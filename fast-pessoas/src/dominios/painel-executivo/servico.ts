// Dashboard Executivo — orquestração.
//
// O que este serviço faz, em uma frase: pega contagem crua do repositório e
// entrega card com VALOR + PERÍODO + A CONTA. A conta é texto em pt-BR montado
// com os números que acabaram de sair do banco, não uma legenda genérica: a
// diretoria tem que poder refazer a divisão no papel e chegar no mesmo número.
//
// Três regras de segurança que este arquivo aplica (e a rota confere de novo):
//
//  • CUSTO DE PESSOAL exige `folha.ver` ADEMAIS de `painel.executivo.ver`. Sem
//    ela o payload leva `CardBloqueado` — um objeto que não tem campo de valor.
//    Não é máscara, não é "R$ ***", não é total agregado: é ausência.
//  • DIVERSIDADE sai com supressão de recorte pequeno, a mesma regra da tela de
//    relatórios, inclusive a guarda contra revelação por complemento. O k não é
//    constante: vem de sistema.parametro_privacidade (migration 0044).
//  • LEITURA SENSÍVEL deixa trilha: diversidade (dado autodeclarado), custo de
//    pessoal (remuneração) e performance (resultado de avaliação) gravam em
//    audit.leitura_sensivel com a chave que autorizou a leitura.

import {
  FAIXAS_IDADE,
  ROTULOS_GENERO,
  type Genero,
} from "../colaboradores/esquemas";
import { lerMinimoPorRecorte } from "../colaboradores/repositorio";
import { calcularEnps } from "../pesquisas/servico";
import type { PayloadSessao } from "../identidade/esquemas";
import {
  CHAVE_FOLHA,
  CHAVE_PAINEL,
  competenciaCurta,
  dataCurta,
  ROTULOS_VINCULO,
  type CardAbsenteismo,
  type CardBloqueado,
  type CardClima,
  type CardCustoPessoal,
  type CardDiversidade,
  type CardHeadcount,
  type CardPerformance,
  type CardPromocoes,
  type CardSemFonte,
  type CardTempoContratacao,
  type CardTurnover,
  type LinhaContagem,
  type MicroSerie,
  type PainelExecutivo,
  type PontoSerie,
  type RecortePainel,
  type Tendencia,
  type UnidadeSerie,
} from "./esquemas";
import * as repositorio from "./repositorio";

const MESES_SERIE = 12;
/** Janela do check-in de clima, em dias — a mesma do indicador adesao_checkin. */
const DIAS_CLIMA = 30;

// ------------------------------------------------------------------ utilidades

function numero(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  return typeof valor === "number" ? valor : Number(valor);
}

function numeroOuNulo(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const convertido = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function arredondar(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function pt(valor: number, casas = 1): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Soma um dia e subtrai meses/dias em ISO puro, sem passar por Date/fuso. */
function somarDias(iso: string, dias: number): string {
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const total = (ano * 12 + (mes - 1)) + meses;
  const anoNovo = Math.floor(total / 12);
  const mesNovo = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anoNovo, mesNovo, 0)).getUTCDate();
  const diaNovo = Math.min(dia, ultimoDia);
  return `${String(anoNovo).padStart(4, "0")}-${String(mesNovo).padStart(2, "0")}-${String(diaNovo).padStart(2, "0")}`;
}

function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function periodo(inicio: string, fim: string): string {
  return `de ${dataCurta(inicio)} a ${dataCurta(fim)}`;
}

// ------------------------------------------------------------------ séries e tendência

function pontos(
  linhas: repositorio.LinhaSerie[],
  mesCorrente: string
): PontoSerie[] {
  return linhas.map((linha) => ({
    mes: linha.mes,
    valor: numeroOuNulo(linha.valor),
    parcial: linha.mes === mesCorrente,
  }));
}

const SEM_TENDENCIA = (motivo: string, subirEBom: boolean): Tendencia => ({
  direcao: "indefinida",
  texto: motivo,
  subir_e_bom: subirEBom,
});

/**
 * Tendência de NÍVEL (estoque): compara o último ponto com o primeiro ponto
 * válido da série. Serve para headcount, clima, custo — grandezas que existem
 * "em" um instante.
 */
function tendenciaNivel(
  serie: PontoSerie[],
  subirEBom: boolean,
  formatar: (valor: number) => string
): Tendencia {
  const validos = serie.filter((ponto) => ponto.valor !== null);
  if (validos.length < 2) {
    return SEM_TENDENCIA(
      "série curta demais para tendência (menos de dois meses com dado)",
      subirEBom
    );
  }
  const primeiro = validos[0];
  const ultimo = validos[validos.length - 1];
  const delta = arredondar((ultimo.valor as number) - (primeiro.valor as number), 2);
  return {
    direcao: delta > 0 ? "sobe" : delta < 0 ? "desce" : "estavel",
    texto:
      `${formatar(ultimo.valor as number)} em ${competenciaCurta(ultimo.mes)} ` +
      `contra ${formatar(primeiro.valor as number)} em ${competenciaCurta(primeiro.mes)}`,
    subir_e_bom: subirEBom,
  };
}

/**
 * Tendência de FLUXO (eventos que acontecem ao longo do mês): compara a soma
 * dos 6 últimos meses com a dos 6 anteriores. Mês a mês, desligamento e
 * promoção são números pequenos e barulhentos; em semestre a comparação para de
 * mentir.
 */
function tendenciaFluxo(
  serie: PontoSerie[],
  subirEBom: boolean,
  substantivo: string
): Tendencia {
  if (serie.length < MESES_SERIE) {
    return SEM_TENDENCIA("série incompleta para comparar semestres", subirEBom);
  }
  const soma = (lista: PontoSerie[]) =>
    lista.reduce((total, ponto) => total + (ponto.valor ?? 0), 0);
  const anteriores = soma(serie.slice(0, 6));
  const recentes = soma(serie.slice(6));
  const delta = recentes - anteriores;
  const inicioRecente = competenciaCurta(serie[6].mes);
  const fimRecente = competenciaCurta(serie[serie.length - 1].mes);
  const inicioAnterior = competenciaCurta(serie[0].mes);
  const fimAnterior = competenciaCurta(serie[5].mes);
  return {
    direcao: delta > 0 ? "sobe" : delta < 0 ? "desce" : "estavel",
    texto:
      `${recentes} ${substantivo} em ${inicioRecente}–${fimRecente} ` +
      `contra ${anteriores} em ${inicioAnterior}–${fimAnterior}`,
    subir_e_bom: subirEBom,
  };
}

function serie(
  rotulo: string,
  unidade: UnidadeSerie,
  lista: PontoSerie[],
  tendencia: Tendencia
): MicroSerie {
  return { rotulo, unidade, pontos: lista, tendencia };
}

// ------------------------------------------------------------------ supressão k = 5

/**
 * Mesma regra da tela de relatórios (`suprimirRecortesPequenos` em
 * colaboradores/servico.ts), reescrita aqui porque a original é privada do
 * domínio dono do dado. O k é LIDO do mesmo parâmetro administrável
 * (sistema.parametro_privacidade, migration 0044) para que o piso de anonimato
 * tenha um único lugar de verdade: mudar o parâmetro muda as duas telas juntas.
 *
 * Recorte com 1..k-1 pessoas não é publicado. Guarda contra revelação por
 * complemento: se sobrar UM único recorte suprimido, o menor recorte publicado
 * também é suprimido — senão bastaria subtrair do total para reidentificar.
 */
function suprimirRecortesPequenos(
  recortes: { chave: string; rotulo: string; quantidade: number }[],
  minimoPorRecorte: number
): RecortePainel[] {
  const suprimidos = new Set(
    recortes
      .filter(
        (recorte) =>
          recorte.quantidade > 0 && recorte.quantidade < minimoPorRecorte
      )
      .map((recorte) => recorte.chave)
  );
  if (suprimidos.size === 1) {
    const candidato = recortes
      .filter(
        (recorte) => recorte.quantidade > 0 && !suprimidos.has(recorte.chave)
      )
      .sort((a, b) => a.quantidade - b.quantidade)[0];
    if (candidato) {
      suprimidos.add(candidato.chave);
    }
  }
  return recortes.map((recorte) => {
    const suprimido = suprimidos.has(recorte.chave);
    return {
      chave: recorte.chave,
      rotulo: recorte.rotulo,
      quantidade: suprimido ? null : recorte.quantidade,
      suprimido,
    };
  });
}

// ------------------------------------------------------------------ cards

async function montarHeadcount(
  hoje: string,
  primeiroMes: string,
  mesCorrente: string
): Promise<CardHeadcount> {
  const anoAtras = somarMeses(hoje, -12);
  const [ativos, ativosAntes, porUnidade, porVinculo, serieBruta] =
    await Promise.all([
      repositorio.headcountEm(hoje),
      repositorio.headcountEm(anoAtras),
      repositorio.headcountPorUnidade(hoje),
      repositorio.headcountPorVinculo(hoje),
      repositorio.serieHeadcount(primeiroMes, hoje),
    ]);

  const unidades: LinhaContagem[] = porUnidade.map((linha) => ({
    rotulo: linha.rotulo,
    quantidade: linha.quantidade,
  }));
  const comLotacao = unidades.reduce((total, l) => total + l.quantidade, 0);
  const delta = ativos - ativosAntes;

  return {
    periodo: `posição em ${dataCurta(hoje)}`,
    conta:
      `Headcount = vínculos com admissão até ${dataCurta(hoje)} e sem desligamento ` +
      `até essa data (afastado conta: o vínculo está vivo). ` +
      `${ativos} hoje contra ${ativosAntes} em ${dataCurta(anoAtras)} = ` +
      `${delta >= 0 ? "+" : ""}${delta} pessoa(s). ` +
      `A quebra por unidade usa a lotação vigente na data.`,
    ativos,
    por_unidade: unidades,
    sem_lotacao: ativos - comLotacao,
    por_vinculo: porVinculo.map((linha) => ({
      rotulo: ROTULOS_VINCULO[linha.rotulo] ?? linha.rotulo,
      quantidade: linha.quantidade,
    })),
    variacao_12m: {
      referencia: anoAtras,
      ativos_antes: ativosAntes,
      delta,
      percentual: ativosAntes > 0 ? arredondar((delta / ativosAntes) * 100) : 0,
    },
    serie: (() => {
      const lista = pontos(serieBruta, mesCorrente);
      return serie(
        "Headcount no fim de cada mês",
        "qtd",
        lista,
        tendenciaNivel(lista, true, (valor) => `${valor}`)
      );
    })(),
  };
}

async function montarTurnover(
  inicio: string,
  fim: string,
  primeiroMes: string,
  mesCorrente: string
): Promise<CardTurnover> {
  const [bruto, serieBruta] = await Promise.all([
    repositorio.turnoverJanela(inicio, fim),
    repositorio.serieDesligamentos(primeiroMes, fim),
  ]);
  const medio = (bruto.hc_inicio + bruto.hc_fim) / 2;
  const percentual = medio > 0 ? arredondar((bruto.desligados / medio) * 100, 2) : 0;
  const lista = pontos(serieBruta, mesCorrente);

  return {
    periodo: periodo(somarDias(inicio, 1), fim),
    conta:
      `Turnover = desligados no período ÷ headcount médio × 100. ` +
      `${bruto.desligados} ÷ ((${bruto.hc_inicio} + ${bruto.hc_fim}) ÷ 2 = ${pt(medio)}) ` +
      `× 100 = ${pt(percentual, 2)}%. ` +
      `Headcount médio é a média entre o início e o fim da janela (não a média ` +
      `mês a mês) — é a conta que a diretoria confere no papel. ` +
      `No mesmo período entraram ${bruto.admitidos} pessoa(s).`,
    percentual,
    desligados: bruto.desligados,
    admitidos: bruto.admitidos,
    headcount_inicio: bruto.hc_inicio,
    headcount_fim: bruto.hc_fim,
    headcount_medio: arredondar(medio),
    serie: serie(
      "Desligamentos por mês",
      "qtd",
      lista,
      tendenciaFluxo(lista, false, "desligamento(s)")
    ),
  };
}

/**
 * Custo de pessoal. Devolve `CardBloqueado` sem NENHUM número quando a sessão
 * não tem folha.ver — e nem chega a consultar a folha nesse caso.
 */
async function montarCustoPessoal(
  sessao: PayloadSessao,
  podeVerFolha: boolean,
  mesCorrente: string
): Promise<CardCustoPessoal | CardBloqueado | CardSemFonte> {
  if (!podeVerFolha) {
    return {
      disponivel: false,
      bloqueio: "permissao",
      requer_chave: CHAVE_FOLHA,
      motivo:
        "Requer permissão de folha (folha.ver). Custo de pessoal é dado de " +
        "remuneração: o painel não mostra valor mascarado nem total aproximado " +
        "para quem não tem a chave.",
    };
  }

  const competencia = await repositorio.ultimaCompetenciaFechada();
  if (!competencia) {
    // SEM FONTE, não bloqueio: quem chegou aqui TEM folha.ver. Rotular isto
    // como falta de permissão mandaria a diretoria pedir uma chave que ela já
    // possui, quando o que falta é fechar uma competência.
    return {
      disponivel: false,
      bloqueio: "sem_fonte",
      motivo:
        "Nenhuma competência de folha FECHADA ainda. O custo só é publicado a " +
        "partir de folha fechada — competência aberta ou em conferência muda de " +
        "valor até o fechamento.",
    };
  }

  await repositorio.registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: CHAVE_FOLHA,
    recurso: "painel_executivo.custo_pessoal",
    registroId: `competencia:${competencia.id}`,
  });

  const [total, porUnidade, serieBruta] = await Promise.all([
    repositorio.totalCompetencia(competencia.id),
    // Sem data: o rateio deriva a referência da própria competência (a mesma
    // que `competencia.referencia` calcula para o texto da conta).
    repositorio.custoPorUnidade(competencia.id),
    repositorio.serieCustoFechado(MESES_SERIE),
  ]);

  const proventos = numero(total.proventos);
  const fgts = numero(total.encargo_fgts);
  const custo = arredondar(proventos + fgts, 2);
  const unidades = porUnidade.map((linha) => {
    const linhaProventos = numero(linha.proventos);
    const linhaFgts = numero(linha.encargo_fgts);
    return {
      unidade: linha.unidade,
      centro_custo: linha.centro_custo,
      pessoas: linha.pessoas,
      proventos: linhaProventos,
      encargo_fgts: linhaFgts,
      total: arredondar(linhaProventos + linhaFgts, 2),
    };
  });
  const rateado = arredondar(
    unidades.reduce((soma, linha) => soma + linha.total, 0),
    2
  );

  const rotuloCompetencia = competenciaCurta(
    `${competencia.ano}-${String(competencia.mes).padStart(2, "0")}`
  );
  const lista = pontos(
    // A série vem do banco em ordem decrescente (as N últimas fechadas);
    // invertida aqui para a micro-série ler da esquerda para a direita.
    [...serieBruta].reverse(),
    mesCorrente
  );

  return {
    disponivel: true,
    periodo: `competência ${rotuloCompetencia}, fechada em ${dataCurta(competencia.fechada_em)}`,
    conta:
      `Custo = total de proventos calculados + encargo de FGTS da competência ` +
      `${rotuloCompetencia}: ${reais(proventos)} + ${reais(fgts)} = ${reais(custo)}, ` +
      `para ${total.pessoas} folha(s). ` +
      `FGTS é o ÚNICO encargo que a folha própria (F1) modela — INSS patronal, ` +
      `terceiros e provisões de 13º e férias não estão no motor, então este NÃO é ` +
      `o custo contábil total da empresa. ` +
      `O rateio por unidade e centro de custo usa a lotação vigente em ` +
      `${dataCurta(competencia.referencia)} (último dia da competência), não a de hoje.`,
    competencia: {
      ano: competencia.ano,
      mes: competencia.mes,
      fechada_em: competencia.fechada_em,
    },
    pessoas: total.pessoas,
    proventos,
    encargo_fgts: fgts,
    total: custo,
    sem_lotacao: arredondar(custo - rateado, 2),
    por_unidade: unidades,
    serie: serie(
      "Custo por competência fechada",
      "R$",
      lista,
      tendenciaNivel(lista, false, (valor) => reais(valor))
    ),
  };
}

async function montarTempoContratacao(
  inicio: string,
  fim: string
): Promise<CardTempoContratacao> {
  const [casos, perna] = await Promise.all([
    repositorio.temposContratacao(inicio, fim),
    repositorio.pernaRecrutamento(inicio, fim),
  ]);
  const medio =
    casos.length > 0
      ? arredondar(
          casos.reduce((soma, caso) => soma + caso.dias, 0) / casos.length
        )
      : null;
  const diasPerna = numeroOuNulo(perna.dias_medio);

  return {
    periodo: periodo(somarDias(inicio, 1), fim),
    conta:
      `Tempo de contratação = dias corridos da APROVAÇÃO da requisição de vaga ` +
      `até a data de admissão do contratado. ` +
      (medio === null
        ? "Nenhuma contratação fechou o ciclo inteiro nesta janela — o card fica " +
          "sem média em vez de mostrar zero."
        : `Média de ${pt(medio)} dia(s) em ${casos.length} contratação(ões): ` +
          `${casos.map((caso) => `${caso.dias}d`).join(", ")}. ` +
          `Com amostra deste tamanho a média é indicativa, não taxa — por isso o ` +
          `card publica caso a caso. `) +
      `O elo entre a vaga e a admissão é o CPF (não há vínculo direto entre ` +
      `candidatura e ficha, por decisão de retenção de dado de candidato); ` +
      `nenhum nome entra neste card. ` +
      (diasPerna === null
        ? "Nenhuma vaga fechada na janela para medir a perna de R&S isolada."
        : `Só a perna de R&S (requisição aprovada → vaga fechada): ` +
          `${pt(diasPerna)} dia(s) em ${perna.vagas} vaga(s) fechada(s).`),
    dias_medio: medio,
    casos: casos.length,
    detalhe: casos,
    perna_recrutamento: { vagas: perna.vagas, dias_medio: diasPerna },
  };
}

async function montarAbsenteismo(
  primeiroMes: string,
  fim: string,
  mesCorrente: string
): Promise<CardAbsenteismo> {
  const linhas = await repositorio.absenteismoMensal(primeiroMes, fim);
  const previstos = linhas.reduce((soma, linha) => soma + linha.previstos, 0);
  const ausentes = linhas.reduce((soma, linha) => soma + linha.ausentes, 0);
  const percentual = previstos > 0 ? arredondar((ausentes / previstos) * 100, 2) : 0;
  const lista: PontoSerie[] = linhas.map((linha) => ({
    mes: linha.mes,
    valor:
      linha.previstos > 0
        ? arredondar((linha.ausentes / linha.previstos) * 100, 2)
        : null,
    parcial: linha.mes === mesCorrente,
  }));

  return {
    periodo: periodo(primeiroMes, fim),
    conta:
      `Absenteísmo = dias úteis de afastamento ÷ dias úteis previstos × 100. ` +
      `${ausentes} ÷ ${previstos.toLocaleString("pt-BR")} × 100 = ${pt(percentual, 2)}%. ` +
      `Dia útil = segunda a sexta, MENOS os feriados cadastrados em Ponto → ` +
      `Parâmetros (nacional para todos; o da unidade só para quem estava ` +
      `lotado nela naquele dia). Ponto facultativo continua sendo dia útil. ` +
      `Previstos somam, dia por dia, os vínculos vivos — quem ainda não tinha sido ` +
      `admitido e quem já havia saído não entram no denominador. ` +
      `Dois afastamentos sobrepostos contam um dia, não dois. ` +
      `A ESCALA de cada pessoa ainda não entra: quem faz 6x1 ou 12x36 é contado ` +
      `como se trabalhasse de segunda a sexta. ` +
      `Agregado puro: o card não traz tipo, motivo nem pessoa — afastamento é ` +
      `dado de saúde. Cobre AFASTAMENTOS registrados; falta e atraso avulsos ` +
      `saem da apuração do Ponto e ainda não são somados aqui.`,
    percentual,
    dias_afastamento: ausentes,
    dias_uteis_previstos: previstos,
    serie: serie(
      "Absenteísmo mensal",
      "%",
      lista,
      tendenciaNivel(lista, false, (valor) => `${pt(valor, 2)}%`)
    ),
  };
}

async function montarPromocoes(
  inicio: string,
  fim: string,
  primeiroMes: string,
  mesCorrente: string
): Promise<CardPromocoes> {
  const [movimentacoes, serieBruta] = await Promise.all([
    repositorio.movimentacoesAplicadas(inicio, fim),
    repositorio.seriePromocoes(primeiroMes, fim),
  ]);
  const conta = (tipo: string) =>
    movimentacoes.find((linha) => linha.tipo === tipo)?.quantidade ?? 0;
  const promocoes = conta("promocao");
  const transferencias = conta("transferencia_unidade");
  const lista = pontos(serieBruta, mesCorrente);

  return {
    periodo: periodo(somarDias(inicio, 1), fim),
    conta:
      `${promocoes} promoção(ões) EFETIVADA(S) no período. ` +
      `Conta movimentação com data de aplicação: a aplicação só ocorre depois da ` +
      `cadeia de aprovação de dois níveis (líder e diretoria) e é ela que abre a ` +
      `posição salarial nova — pedido aprovado mas não aplicado ainda não mudou ` +
      `a vida de ninguém e não entra. ` +
      `No mesmo período houve ${transferencias} transferência(s) de unidade ` +
      `efetivada(s), contadas à parte porque não são promoção.`,
    promocoes,
    transferencias,
    serie: serie(
      "Promoções por mês",
      "qtd",
      lista,
      tendenciaFluxo(lista, true, "promoção(ões)")
    ),
  };
}

async function montarDiversidade(
  sessao: PayloadSessao,
  hoje: string,
  primeiroMes: string,
  mesCorrente: string
): Promise<CardDiversidade> {
  await repositorio.registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: CHAVE_PAINEL,
    recurso: "painel_executivo.diversidade",
    registroId: "agregado",
  });

  const [total, generos, idades, cobertura, serieBruta, minimoPorRecorte] =
    await Promise.all([
      repositorio.headcountEm(hoje),
      repositorio.contarPorGenero(hoje),
      repositorio.contarPorIdade(hoje),
      repositorio.coberturaNascimento(hoje),
      repositorio.serieGenero(primeiroMes, hoje),
      lerMinimoPorRecorte(),
    ]);

  const porGenero = suprimirRecortesPequenos(
    Object.keys(ROTULOS_GENERO).map((chave) => ({
      chave,
      rotulo: ROTULOS_GENERO[chave as Genero],
      quantidade:
        generos.find((linha) => linha.genero === chave)?.quantidade ?? 0,
    })),
    minimoPorRecorte
  );
  const porFaixa = suprimirRecortesPequenos(
    FAIXAS_IDADE.map((faixa) => ({
      chave: faixa.chave,
      rotulo: faixa.rotulo,
      quantidade: idades
        .filter((linha) => linha.idade >= faixa.min && linha.idade <= faixa.max)
        .reduce((soma, linha) => soma + linha.quantidade, 0),
    })),
    minimoPorRecorte
  );

  // Ponto a ponto: mês com menos de k mulheres não publica percentual — a
  // série não pode furar o piso que a tabela respeita.
  const lista: PontoSerie[] = serieBruta.map((linha) => ({
    mes: linha.mes,
    valor:
      linha.total > 0 && linha.mulheres >= minimoPorRecorte
        ? arredondar((linha.mulheres / linha.total) * 100)
        : null,
    parcial: linha.mes === mesCorrente,
  }));
  const suprimidosGenero = porGenero.filter((r) => r.suprimido).length;

  return {
    periodo: `posição em ${dataCurta(hoje)}`,
    conta:
      `Composição do quadro ativo (${total} pessoa(s)) por gênero autodeclarado e ` +
      `por faixa de idade calculada na data. ` +
      `Recorte com menos de ${minimoPorRecorte} pessoas é SUPRIMIDO ` +
      `(${suprimidosGenero} recorte(s) de gênero suprimido(s) hoje) — num quadro deste ` +
      `tamanho publicar "1 pessoa" identifica alguém. Se sobrasse um único ` +
      `recorte suprimido, o menor recorte publicado também seria suprimido, ` +
      `senão bastaria subtrair do total. ` +
      `${cobertura.sem_data} ficha(s) sem data de nascimento ficam fora das ` +
      `faixas de idade e isso é reportado em vez de virar zero. ` +
      `A leitura deste card fica registrada na trilha de dado sensível.`,
    total_quadro: total,
    com_data_nascimento: cobertura.com_data,
    sem_data_nascimento: cobertura.sem_data,
    minimo_por_recorte: minimoPorRecorte,
    por_genero: porGenero,
    por_faixa_idade: porFaixa,
    serie: serie(
      "% de mulheres no quadro",
      "%",
      lista,
      tendenciaNivel(lista, true, (valor) => `${pt(valor)}%`)
    ),
  };
}

async function montarClima(
  hoje: string,
  primeiroMes: string,
  mesCorrente: string
): Promise<CardClima> {
  const inicioClima = somarDias(hoje, -DIAS_CLIMA);
  // Mesmo piso do resto do sistema (0044/0045): o card do painel executivo não
  // pode publicar o eNPS de uma amostra que a tela de pesquisas esconde.
  const [checkin, enps, serieBruta, minimoAmostra] = await Promise.all([
    repositorio.checkinJanela(inicioClima, hoje),
    repositorio.contagemEnpsUltimaEncerrada(),
    repositorio.serieClima(primeiroMes, hoje),
    lerMinimoPorRecorte(),
  ]);

  const media = numeroOuNulo(checkin.media);
  const amostraOk = enps !== null && enps.respostas >= minimoAmostra;
  const pontosEnps =
    enps !== null && amostraOk
      ? calcularEnps(enps.promotores, enps.detratores, enps.respostas)
      : null;
  const lista = pontos(serieBruta, mesCorrente);

  return {
    periodo:
      `check-in de ${dataCurta(somarDias(inicioClima, 1))} a ${dataCurta(hoje)} ` +
      `(${DIAS_CLIMA} dias)` +
      (enps ? `; eNPS da pesquisa encerrada em ${dataCurta(enps.encerrada_em)}` : ""),
    conta:
      (media === null
        ? `Nenhum check-in nos últimos ${DIAS_CLIMA} dias. `
        : `Média do check-in = soma das notas ÷ ${checkin.respostas.toLocaleString("pt-BR")} ` +
          `resposta(s) dos últimos ${DIAS_CLIMA} dias = ${pt(media, 2)} (escala de 1 a 5). `) +
      (enps === null
        ? "Nenhuma pesquisa encerrada com pergunta de 0 a 10 — sem eNPS."
        : !amostraOk
          ? `A última pesquisa encerrada tem menos de ${minimoAmostra} respostas de ` +
            `eNPS: o valor não é publicado (nem as contagens).`
          : `eNPS = %promotores (notas 9–10) − %detratores (notas 0–6) sobre ` +
            `${enps.respostas} resposta(s): ${enps.promotores} − ${enps.detratores} ` +
            `em ${enps.respostas} = ${pt(pontosEnps as number)} pontos ` +
            `(escala de −100 a +100, não é percentual). ` +
            `Resposta individual nunca aparece: a pesquisa é anônima.`),
    media_checkin: media,
    respostas_checkin: checkin.respostas,
    enps:
      enps === null
        ? null
        : {
            pesquisa: enps.titulo,
            encerrada_em: enps.encerrada_em,
            pontos: pontosEnps,
            respostas: amostraOk ? enps.respostas : null,
            promotores: amostraOk ? enps.promotores : null,
            detratores: amostraOk ? enps.detratores : null,
            minimo_amostra: minimoAmostra,
          },
    serie: serie(
      "Média mensal do check-in",
      "nota",
      lista,
      tendenciaNivel(lista, true, (valor) => pt(valor, 2))
    ),
  };
}

async function montarPerformance(
  sessao: PayloadSessao
): Promise<CardPerformance> {
  await repositorio.registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: CHAVE_PAINEL,
    recurso: "painel_executivo.performance",
    registroId: "distribuicao_ultima_safra",
  });

  const linhas = await repositorio.distribuicaoUltimaSafra();
  const total = linhas.reduce((soma, linha) => soma + linha.quantidade, 0);
  const safra = linhas[0]?.safra ?? null;

  return {
    periodo:
      safra === null
        ? "nenhuma safra de avaliação de desempenho com resultado"
        : `safra de ${competenciaCurta(safra)}`,
    conta:
      safra === null
        ? "Nenhum ciclo de desempenho consolidado ainda — sem distribuição a publicar."
        : `Distribuição das ${total} avaliação(ões) de DESEMPENHO cujo resultado foi ` +
          `consolidado em ${competenciaCurta(safra)}, pelas faixas do modelo vigente ` +
          `naquela safra. As quatro faixas aparecem sempre, inclusive vazias. ` +
          `Ciclos de experiência (45 e 90 dias) ficam fora: são porta de entrada, ` +
          `não régua de performance do quadro. ` +
          `Sai contagem por faixa e nada mais — sem nome e sem nota individual; ` +
          `a leitura fica registrada na trilha de dado sensível.`,
    safra,
    avaliacoes: total,
    faixas: linhas.map((linha) => ({
      rotulo: linha.rotulo,
      minimo: numero(linha.minimo),
      maximo: numero(linha.maximo),
      quantidade: linha.quantidade,
      percentual: total > 0 ? arredondar((linha.quantidade / total) * 100) : 0,
    })),
    sem_serie:
      "Sem micro-série: a régua de desempenho tem duas safras registradas e " +
      "comparar distribuição de safras com tamanho muito diferente confunde mais " +
      "do que informa. A série entra quando houver três safras comparáveis.",
  };
}

/** ROI de treinamento: card honesto. Não existe fonte — e o painel diz isso. */
function montarRoiTreinamento(): CardSemFonte {
  return {
    disponivel: false,
    bloqueio: "sem_fonte",
    motivo:
      "Depende do módulo de Treinamento & Desenvolvimento, que hoje vive no " +
      "Sults: o Fast Pessoas não tem custo de treinamento, horas de trilha nem " +
      "participação por curso. Sem esses três números não existe ROI — e um ROI " +
      "estimado num painel de diretoria vira decisão errada. Quando T&D entrar " +
      "(ou for integrado), o cálculo natural é ganho medido (queda de turnover e " +
      "de retrabalho na área treinada) sobre custo do programa.",
  };
}

// ------------------------------------------------------------------ orquestração

/**
 * Monta o painel inteiro. `podeVerFolha` é decidido no banco (não no front) e
 * governa apenas o card de custo — todos os outros são iguais para diretoria,
 * dp e líder de T&D.
 */
export async function montarPainelExecutivo(
  sessao: PayloadSessao
): Promise<PainelExecutivo> {
  // Uma única leitura da data de negócio: o painel inteiro fala da mesma
  // janela, mesmo que a requisição atravesse a meia-noite.
  const hoje = await repositorio.hojeSaoPaulo();
  const inicio12m = somarMeses(hoje, -12);
  const primeiroMes = primeiroDiaDoMes(somarMeses(hoje, -(MESES_SERIE - 1)));
  const mesCorrente = hoje.slice(0, 7);
  const podeVerFolha = await repositorio.temChave(sessao.usuario_id, CHAVE_FOLHA);

  const [
    headcount,
    turnover,
    custoPessoal,
    tempoContratacao,
    absenteismo,
    promocoes,
    diversidade,
    clima,
    performance,
  ] = await Promise.all([
    montarHeadcount(hoje, primeiroMes, mesCorrente),
    montarTurnover(inicio12m, hoje, primeiroMes, mesCorrente),
    montarCustoPessoal(sessao, podeVerFolha, mesCorrente),
    montarTempoContratacao(inicio12m, hoje),
    montarAbsenteismo(primeiroMes, hoje, mesCorrente),
    montarPromocoes(inicio12m, hoje, primeiroMes, mesCorrente),
    montarDiversidade(sessao, hoje, primeiroMes, mesCorrente),
    montarClima(hoje, primeiroMes, mesCorrente),
    montarPerformance(sessao),
  ]);

  return {
    hoje,
    janela_12m: { inicio: somarDias(inicio12m, 1), fim: hoje },
    headcount,
    turnover,
    custo_pessoal: custoPessoal,
    tempo_contratacao: tempoContratacao,
    absenteismo,
    promocoes,
    diversidade,
    clima,
    performance,
    roi_treinamento: montarRoiTreinamento(),
  };
}
