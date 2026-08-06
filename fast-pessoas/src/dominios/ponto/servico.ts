import { PoolClient } from "pg";
import {
  Diff,
  EntradaAlteracao,
  registrarAlteracao,
  registrarAlteracoesEmLote,
} from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import {
  inserirEvento,
  registrarLeituraSensivel,
  temPermissao,
} from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  agruparMarcacoesPorDia,
  apurarPonto,
  DiaApurado,
  DiaMotor,
  ErroMotorPonto,
  IntercorrenciaDetectada,
  JornadaMotor,
  limitarCreditoDoBanco,
  MarcacaoMotor,
  MINUTOS_DO_DIA,
  ResultadoApuracao,
  TIPOS_MARCACAO,
  TipoMarcacao,
} from "./calculo";
import {
  AjusteMarcacao,
  APELIDOS_TIPO_MARCACAO,
  ApurarCompetencia,
  EntradaImportacao,
  esquemaEntradaCasoTestePonto,
  esquemaSaidaCasoTestePonto,
  formatarCompetencia,
  formatarMinutos,
  formatarRelogio,
  horaParaMinutos,
  MovimentoBanco,
  NovaEscala,
  NovaJornada,
  NovaRegraBanco,
  NovoFeriado,
  ROTULOS_TIPO_INTERCORRENCIA,
  ROTULOS_TIPO_MARCACAO,
  ROTULOS_TRATAMENTO_RESCISAO,
  StatusIntercorrencia,
  TratarIntercorrencia,
} from "./esquemas";
import * as repo from "./repositorio";

// Camada de regra. Ninguém aqui monta SQL e ninguém aqui fala HTTP além de
// lançar ErroHttp — a rota traduz. Toda escrita entra por comTransacao.
//
// FUSO: o dia de apuração é o dia civil em America/Sao_Paulo. As datas que
// circulam neste arquivo são strings AAAA-MM-DD desse calendário; quem converte
// TIMESTAMPTZ ↔ dia local é o repositório, com AT TIME ZONE explícito.

const FUSO_EXIBICAO = "America/Sao_Paulo";

// ------------------------------------------------------------------ utilitários de data (puros)

function diasDaCompetencia(ano: number, mes: number): string[] {
  const dias: string[] = [];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let dia = 1; dia <= ultimo; dia += 1) {
    dias.push(
      `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    );
  }
  return dias;
}

/**
 * Só DIA FECHADO entra na apuração: a competência corrente é apurada até
 * ONTEM, inclusive.
 *
 * Sem este corte, apurar o mês corrente no dia 10 lançaria falta integral em
 * todos os dias 11 a 31 — o motor vê "dia com jornada prevista e nenhum minuto
 * trabalhado" e não tem como saber que o dia ainda não aconteceu. O resultado
 * seria uma competência inteira de faltas falsas, uma fila de intercorrências
 * `sem_marcacao` sem sentido e desconto de DSR em folha por falta que ninguém
 * cometeu. HOJE também fica de fora: quem entrou às 08:00 e ainda não saiu não
 * está em falta — está trabalhando.
 *
 * Apurar o mês corrente é rotina do DP (acompanhar HE e banco no meio do mês),
 * e reapurar depois do fechamento do mês simplesmente traz os dias que
 * faltavam — a apuração é sobrescrita e o banco de horas recebe o estorno,
 * como já acontece em qualquer reapuração.
 */
function diasFechadosDaCompetencia(ano: number, mes: number): string[] {
  const limite = somarDias(hojeLocal(), -1);
  return diasDaCompetencia(ano, mes).filter((data) => data <= limite);
}

function diaDaSemana(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas (a − b), sem hora nem fuso na conta. */
function distanciaEmDias(a: string, b: string): number {
  const [anoA, mesA, diaA] = a.split("-").map(Number);
  const [anoB, mesB, diaB] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(anoA, mesA - 1, diaA) - Date.UTC(anoB, mesB - 1, diaB)) / 86400000
  );
}

/**
 * Este dia era de TRABALHO na escala da pessoa? Só faz sentido em jornada sem
 * padrão semanal (12x36, escala livre), onde não existe "segunda a sexta": o
 * ritmo vem de `ciclo_dias` da jornada e do dia em que o ciclo começou para
 * AQUELA pessoa (`ancora_escala`, migration 0034).
 *
 * Devolve null enquanto a âncora não estiver cadastrada — e é isso que o motor
 * precisa saber para não afirmar falta que não sabe se existiu. Era esse buraco
 * que fazia o plantonista sem NENHUMA batida no dia passar em silêncio: sem
 * calendário, o dia virava "fora da escala", previsto zero, nada na fila do DP.
 */
function diaDeEscala(
  escala: repo.EscalaVigente,
  data: string
): boolean | null {
  const ciclo = escala.jornada.ciclo_dias;
  if (escala.ancora_escala === null || ciclo === null || ciclo <= 0) return null;
  const distancia = distanciaEmDias(data, escala.ancora_escala);
  if (distancia < 0) return null; // antes do começo do ciclo não há o que afirmar
  return distancia % ciclo === 0;
}

/** Hoje em America/Sao_Paulo — a única leitura de relógio do domínio. */
export function hojeLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_EXIBICAO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function competenciaDe(data: string): { ano: number; mes: number } {
  const [ano, mes] = data.split("-").map(Number);
  return { ano, mes };
}

function competenciaAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

function diff(campos: Record<string, [unknown, unknown]>): Diff {
  const resultado: Diff = {};
  for (const [campo, [de, para]] of Object.entries(campos)) {
    resultado[campo] = {
      de: de === null || de === undefined ? null : String(de),
      para: para === null || para === undefined ? null : String(para),
    };
  }
  return resultado;
}

// ------------------------------------------------------------------ jornadas

export async function listarJornadas() {
  return repo.listarJornadas();
}

/**
 * Nova versão de jornada. Mudar parâmetro NUNCA é UPDATE: encerra a versão
 * ativa do mesmo código na véspera e abre outra — a apuração do mês passado
 * continua enxergando a jornada do mês passado.
 */
export async function criarVersaoJornada(
  sessao: PayloadSessao,
  dados: NovaJornada
): Promise<number> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const ativa = await repo.buscarJornadaAtivaPorCodigo(cliente, dados.codigo);
    if (ativa) {
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          422,
          "A nova vigência precisa começar depois da versão ativa",
          "inicio_vigencia"
        );
      }
      await repo.encerrarJornada(
        cliente,
        ativa.id,
        somarDias(dados.inicio_vigencia, -1)
      );
    }
    const id = await repo.inserirJornada(cliente, {
      codigo: dados.codigo,
      nome: dados.nome,
      tipo: dados.tipo,
      carga_diaria_minutos: dados.carga_diaria,
      carga_semanal_minutos: dados.carga_semanal,
      intervalo_minimo_minutos: dados.intervalo_minimo,
      tolerancia_entrada_minutos: dados.tolerancia_entrada,
      tolerancia_saida_minutos: dados.tolerancia_saida,
      adicional_noturno_inicio: dados.adicional_noturno_inicio,
      adicional_noturno_fim: dados.adicional_noturno_fim,
      // Em branco vai NULL de propósito: o padrão da janela de arraste é regra
      // da tabela (migration 0033), e o mesmo vale para o previsto da semana e
      // o ciclo — o banco os deriva do tipo e da carga digitados. Nenhum
      // default mora aqui.
      janela_arraste_minutos: dados.janela_arraste ?? null,
      previsto_por_dia_semana: dados.previsto_por_dia_semana ?? null,
      ciclo_dias: dados.ciclo_dias ?? null,
      // Estes quatro vêm SEMPRE preenchidos: o esquema os exige (0043) porque
      // o banco parou de adivinhá-los. `dia_repouso_semana` pode ser NULL, e
      // NULL aqui é escolha declarada — "sem dia fixo de repouso" —, não campo
      // que ficou faltando.
      dia_repouso_semana: dados.dia_repouso_semana,
      dias_uteis_semana: dados.dias_uteis_semana,
      intervalo_obrigatorio_acima_minutos: dados.intervalo_obrigatorio_acima,
      hora_noturna_segundos: dados.hora_noturna_segundos,
      horario_entrada_minuto: dados.horario_entrada ?? null,
      horario_saida_minuto: dados.horario_saida ?? null,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: ativa ? "ponto.jornada.nova_versao" : "ponto.jornada.criar",
      tabela: "rh.jornada_versao",
      registroId: String(id),
      diff: diff({
        codigo: [ativa ? dados.codigo : null, dados.codigo],
        nome: [null, dados.nome],
        tipo: [null, dados.tipo],
        carga_diaria: [null, formatarMinutos(dados.carga_diaria)],
        carga_semanal: [null, formatarMinutos(dados.carga_semanal)],
        janela_arraste: [
          null,
          dados.janela_arraste === undefined
            ? "padrão da jornada (carga diária + intervalo)"
            : `${dados.janela_arraste} min`,
        ],
        // Os quatro parâmetros que decidem dinheiro entram na trilha: enquanto
        // eram adivinhados pelo banco não havia o que auditar, e agora que são
        // escolha de alguém a auditoria tem de dizer QUEM escolheu o quê.
        hora_noturna: [null, `${dados.hora_noturna_segundos} s`],
        dia_repouso_semana: [
          null,
          dados.dia_repouso_semana === null
            ? "sem dia fixo"
            : String(dados.dia_repouso_semana),
        ],
        dias_uteis_semana: [null, String(dados.dias_uteis_semana)],
        intervalo_obrigatorio_acima: [
          null,
          formatarMinutos(dados.intervalo_obrigatorio_acima),
        ],
        versao_encerrada: [null, ativa ? String(ativa.id) : null],
      }),
    });
    return id;
  });
}

// ------------------------------------------------------------------ escalas

export async function listarEscalasVigentes() {
  return repo.listarEscalasVigentes();
}

export async function definirEscala(
  sessao: PayloadSessao,
  dados: NovaEscala
): Promise<number> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const jornada = await repo.buscarJornada(dados.jornada_versao_id);
    if (!jornada) {
      throw new ErroHttpCampo(404, "Jornada não encontrada", "jornada_versao_id");
    }
    const anterior = await repo.encerrarEscalaVigente(
      cliente,
      dados.colaborador_id,
      somarDias(dados.inicio_vigencia, -1)
    );
    const id = await repo.inserirEscala(
      cliente,
      dados.colaborador_id,
      dados.jornada_versao_id,
      dados.inicio_vigencia,
      dados.observacao ?? null
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ponto.escala.definir",
      tabela: "rh.escala_colaborador",
      registroId: String(id),
      diff: diff({
        colaborador_id: [null, dados.colaborador_id],
        jornada: [null, `${jornada.codigo} — ${jornada.nome}`],
        inicio_vigencia: [null, dados.inicio_vigencia],
        escala_encerrada: [null, anterior],
      }),
    });
    await inserirEvento(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: "escala_de_trabalho",
      ocorrido_em: `${dados.inicio_vigencia}T00:00:00-03:00`,
      origem_tabela: "rh.escala_colaborador",
      origem_id: id,
      resumo: `Passou a seguir a jornada ${jornada.nome}`,
      payload: { jornada: jornada.nome, tipo: jornada.tipo },
      registrado_por: sessao.usuario_id,
    });
    return id;
  });
}

// ------------------------------------------------------------------ feriados

export async function listarFeriados(de: string, ate: string) {
  return repo.listarFeriados(de, ate);
}

export async function criarFeriado(
  sessao: PayloadSessao,
  dados: NovoFeriado
): Promise<number> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    try {
      const id = await repo.inserirFeriado(cliente, {
        data: dados.data,
        nome: dados.nome,
        abrangencia: dados.abrangencia,
        tipo: dados.tipo,
        uf: dados.uf ?? null,
        municipio: dados.municipio ?? null,
        estabelecimento_id: dados.estabelecimento_id ?? null,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "ponto.feriado.criar",
        tabela: "rh.feriado",
        registroId: String(id),
        diff: diff({
          data: [null, dados.data],
          nome: [null, dados.nome],
          abrangencia: [null, dados.abrangencia],
          tipo: [null, dados.tipo],
        }),
      });
      return id;
    } catch (erro) {
      if (violacaoUnica(erro) === "feriado_sem_repeticao") {
        throw new ErroHttpCampo(
          409,
          "Já existe esse feriado nessa data com o mesmo alcance",
          "data"
        );
      }
      throw erro;
    }
  });
}

export async function removerFeriado(
  sessao: PayloadSessao,
  id: number
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const feriado = await repo.buscarFeriado(cliente, id);
    if (!feriado) throw new ErroHttp(404, "Feriado não encontrado");
    await repo.removerFeriado(cliente, id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ponto.feriado.remover",
      tabela: "rh.feriado",
      registroId: String(id),
      diff: diff({
        data: [feriado.data, null],
        nome: [feriado.nome, null],
      }),
    });
  });
}

// ------------------------------------------------------------------ regra de banco de horas

export async function listarRegrasBanco() {
  return repo.listarRegrasBanco();
}

export async function resolverRegraBanco(colaboradorId: number, data: string) {
  return repo.resolverRegraBanco(colaboradorId, data);
}

export async function criarVersaoRegraBanco(
  sessao: PayloadSessao,
  dados: NovaRegraBanco
): Promise<number> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const escopo = {
      estabelecimento_id: dados.estabelecimento_id ?? null,
      cargo_id: dados.cargo_id ?? null,
      colaborador_id: dados.colaborador_id ?? null,
    };
    const ativa = await repo.buscarRegraAtivaDoEscopo(
      cliente,
      escopo.estabelecimento_id,
      escopo.cargo_id,
      escopo.colaborador_id
    );
    if (ativa) {
      // Versionar é EMPILHAR: a nova versão fecha a anterior no dia anterior ao
      // seu início. Com vigência retroativa esse fechamento cairia ANTES do
      // início da própria versão ativa, o CHECK (fim_vigencia >= inicio_vigencia)
      // da 0027 estourava e o DP recebia "Erro interno do servidor" — 500 sem
      // uma palavra sobre o que fazer. A transação revertia (o estado ficava
      // intacto), mas o erro não ensinava nada. Mesma guarda da versão de
      // jornada, e agora ela diz a data mínima aceita.
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          422,
          `A nova vigência precisa começar depois da versão ativa deste escopo ` +
            `(que vale desde ${ativa.inicio_vigencia}) — a partir de ` +
            `${somarDias(ativa.inicio_vigencia, 1)}. Para corrigir a versão ` +
            `vigente sem criar uma nova, encerre-a primeiro.`,
          "inicio_vigencia"
        );
      }
      await repo.encerrarRegraBanco(
        cliente,
        ativa.id,
        somarDias(dados.inicio_vigencia, -1)
      );
    }
    const id = await repo.inserirRegraBanco(cliente, {
      ...escopo,
      prazo_compensacao_dias: dados.prazo_compensacao_dias,
      limite_positivo_minutos: dados.limite_positivo,
      limite_negativo_minutos: dados.limite_negativo,
      expira_saldo: dados.expira_saldo,
      tratamento_rescisao: dados.tratamento_rescisao,
      fator_he_50: dados.fator_he_50,
      fator_he_100: dados.fator_he_100,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ponto.regra_banco.nova_versao",
      tabela: "rh.regra_banco_horas_versao",
      registroId: String(id),
      diff: diff({
        escopo: [
          null,
          escopo.colaborador_id
            ? `pessoa ${escopo.colaborador_id}`
            : escopo.cargo_id
              ? `cargo ${escopo.cargo_id}`
              : escopo.estabelecimento_id
                ? `unidade ${escopo.estabelecimento_id}`
                : "padrão da empresa",
        ],
        limite_positivo: [null, formatarMinutos(dados.limite_positivo)],
        limite_negativo: [null, formatarMinutos(dados.limite_negativo)],
        prazo_compensacao_dias: [null, dados.prazo_compensacao_dias],
        fator_he_50: [null, dados.fator_he_50],
        fator_he_100: [null, dados.fator_he_100],
        versao_encerrada: [null, ativa ? String(ativa.id) : null],
      }),
    });
    return id;
  });
}

// ------------------------------------------------------------------ importador

interface LinhaRejeitada {
  linha: number;
  motivo: string;
  conteudo: string;
}

export interface ResultadoImportacao {
  lote_id: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  rejeicoes: LinhaRejeitada[];
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * "10/06/2026" ou "2026-06-10" → "2026-06-10". Confere o CALENDÁRIO, não só o
 * formato: 32/06 e 30/02 são recusados aqui, com motivo legível, em vez de
 * estourarem lá no INSERT.
 */
function normalizarData(texto: string): string | null {
  const limpo = texto.trim();
  let ano: number, mes: number, dia: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpo);
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(limpo);
  if (iso) [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [ano, mes, dia] = [Number(br[3]), Number(br[2]), Number(br[1])];
  else return null;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function normalizarHora(texto: string): string | null {
  const achado = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(texto.trim());
  if (!achado) return null;
  const hora = Number(achado[1]);
  if (hora > 23) return null;
  return `${String(hora).padStart(2, "0")}:${achado[2]}:${achado[3] ?? "00"}`;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * A tabela de matrículas do importador, COM data.
 *
 * O importador resolvia matrícula → vínculo por um mapa cru da tabela inteira, e
 * a única rejeição possível era "matrícula não encontrada". Depois de uma
 * transferência entre empresas do grupo a pessoa ganha vínculo (e matrícula)
 * novos, mas o relógio de ponto continua gravando a matrícula ANTIGA por
 * dias — quem troca o crachá no relógio é outro sistema. A batida entrava então
 * no vínculo ENCERRADO, onde ninguém a vê: a apuração da competência só percorre
 * quem não está desligado e o espelho da pessoa resolve por rh.vinculo_atual.
 * Como marcação é append-only, a linha não podia nem ser apagada.
 *
 * Agora a linha é casada com a janela [admissão, desligamento] do vínculo e,
 * quando ela cai fora, a rejeição diz qual matrícula valia naquele dia — que é o
 * que o DP precisa para corrigir o arquivo.
 */
interface TabelaDeMatriculas {
  buscar(matricula: string): repo.VinculoDeMatricula | undefined;
  motivoForaDaVigencia(
    vinculo: repo.VinculoDeMatricula,
    data: string
  ): string | null;
}

function tabelaDeMatriculas(
  vinculos: repo.VinculoDeMatricula[]
): TabelaDeMatriculas {
  // Datas AAAA-MM-DD comparam como texto na ordem do calendário.
  const vigenteEm = (vinculo: repo.VinculoDeMatricula, data: string): boolean =>
    vinculo.data_admissao <= data &&
    (vinculo.data_desligamento === null || data <= vinculo.data_desligamento);

  const porMatricula = new Map<string, repo.VinculoDeMatricula>();
  const porPessoa = new Map<number, repo.VinculoDeMatricula[]>();
  for (const vinculo of vinculos) {
    porMatricula.set(vinculo.matricula, vinculo);
    const irmaos = porPessoa.get(vinculo.pessoa_id);
    if (irmaos) irmaos.push(vinculo);
    else porPessoa.set(vinculo.pessoa_id, [vinculo]);
  }

  return {
    buscar: (matricula) => porMatricula.get(matricula),
    motivoForaDaVigencia: (vinculo, data) => {
      if (vigenteEm(vinculo, data)) return null;
      const janela =
        vinculo.data_desligamento !== null && data > vinculo.data_desligamento
          ? `pertence a vínculo encerrado em ${formatarData(vinculo.data_desligamento)}`
          : `pertence a vínculo que só começa em ${formatarData(vinculo.data_admissao)}`;
      const vigente = (porPessoa.get(vinculo.pessoa_id) ?? []).find((irmao) =>
        vigenteEm(irmao, data)
      );
      const saida = vigente
        ? `a matrícula desta pessoa em ${formatarData(data)} é ${vigente.matricula}`
        : `esta pessoa não tinha vínculo vigente em ${formatarData(data)}`;
      return `Matrícula "${vinculo.matricula}" ${janela}; ${saida}`;
    },
  };
}

/**
 * Importador de planilha (matricula ; data ; hora ; tipo).
 *
 * REGRA DE OURO: validação LINHA A LINHA. Uma linha ruim vira rejeição com
 * motivo no relatório do lote e o resto do arquivo entra normalmente — o
 * contrário (abortar tudo) é o que faz o DP desistir de importar.
 *
 * Idempotência: reimportar o mesmo arquivo não duplica batida — a segunda
 * ocorrência da mesma (pessoa, momento, tipo) bate na unicidade do banco e é
 * rejeitada com motivo "marcação já existente".
 */
export async function importarMarcacoes(
  sessao: PayloadSessao,
  entrada: EntradaImportacao
): Promise<ResultadoImportacao> {
  const matriculas = tabelaDeMatriculas(await repo.vinculosComMatricula());
  const linhas = entrada.conteudo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "");
  if (linhas.length === 0) {
    throw new ErroHttpCampo(422, "Arquivo sem nenhuma linha útil", "conteudo");
  }

  return comTransacao(sessao.usuario_id, async (cliente) => {
    const loteId = await repo.abrirLote(
      cliente,
      entrada.arquivo,
      entrada.ano,
      entrada.mes,
      sessao.usuario_id
    );

    const rejeicoes: LinhaRejeitada[] = [];
    let aceitas = 0;
    let lidas = 0;

    // Duplicata é decidida contra o que JÁ existe no período mais o que já foi
    // aceito neste mesmo arquivo — uma consulta, não uma por linha.
    const primeiroDia = `${entrada.ano}-${String(entrada.mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(Date.UTC(entrada.ano, entrada.mes, 0))
      .toISOString()
      .slice(0, 10);
    const jaExistentes = await repo.chavesDeMarcacaoNoPeriodo(
      cliente,
      primeiroDia,
      ultimoDia
    );

    interface Aceita extends repo.MarcacaoDeLote {
      numero: number;
      conteudo: string;
    }
    const paraGravar: Aceita[] = [];

    for (let indice = 0; indice < linhas.length; indice += 1) {
      const bruta = linhas[indice];
      const numero = indice + 1;
      const colunas = bruta.split(entrada.separador).map((c) => c.trim());

      // Cabeçalho: reconhecido e ignorado sem contar como linha lida.
      if (indice === 0 && normalizar(colunas[0] ?? "").startsWith("matricula")) {
        continue;
      }
      lidas += 1;

      const rejeitar = (motivo: string): void => {
        rejeicoes.push({ linha: numero, motivo, conteudo: bruta });
      };

      if (colunas.length < 4) {
        rejeitar("Esperadas 4 colunas: matrícula, data, hora, tipo");
        continue;
      }
      const [matricula, dataBruta, horaBruta, tipoBruto] = colunas;

      const vinculo = matriculas.buscar(matricula);
      if (!vinculo) {
        rejeitar(`Matrícula "${matricula}" não encontrada`);
        continue;
      }
      const data = normalizarData(dataBruta);
      if (!data) {
        rejeitar(`Data inválida: "${dataBruta}" (use AAAA-MM-DD ou DD/MM/AAAA)`);
        continue;
      }
      const competencia = competenciaDe(data);
      if (competencia.ano !== entrada.ano || competencia.mes !== entrada.mes) {
        rejeitar(
          `Data ${data} fora da competência ${formatarCompetencia(entrada.ano, entrada.mes)}`
        );
        continue;
      }
      // A matrícula tem que valer NO DIA DA BATIDA, não "existir na tabela".
      const foraDaVigencia = matriculas.motivoForaDaVigencia(vinculo, data);
      if (foraDaVigencia) {
        rejeitar(foraDaVigencia);
        continue;
      }
      const colaboradorId = vinculo.id;
      const hora = normalizarHora(horaBruta);
      if (!hora) {
        rejeitar(`Hora inválida: "${horaBruta}" (use HH:MM)`);
        continue;
      }
      const tipo: TipoMarcacao | undefined =
        APELIDOS_TIPO_MARCACAO[normalizar(tipoBruto)];
      if (!tipo) {
        rejeitar(
          `Tipo desconhecido: "${tipoBruto}" (use entrada, saida, inicio_intervalo ou fim_intervalo)`
        );
        continue;
      }

      const chave = `${colaboradorId}|${data} ${hora}|${tipo}`;
      if (jaExistentes.has(chave)) {
        rejeitar("Marcação já existente (reimportação ou linha repetida) — ignorada");
        continue;
      }
      jaExistentes.add(chave);
      paraGravar.push({
        colaborador_id: colaboradorId,
        // Fuso fixado na borda: a planilha traz hora de parede de São Paulo.
        momento_iso: `${data}T${hora}-03:00`,
        tipo,
        origem_referencia: `${entrada.arquivo}:${numero}`,
        numero,
        conteudo: bruta,
      });
    }

    // Gravação em blocos. Se um bloco falhar (corrida com outra importação,
    // por exemplo), ele — e só ele — é refeito linha a linha para que a linha
    // culpada seja identificada e as demais entrem. O lote NUNCA aborta.
    const TAMANHO_BLOCO = 500;
    for (let inicio = 0; inicio < paraGravar.length; inicio += TAMANHO_BLOCO) {
      const bloco = paraGravar.slice(inicio, inicio + TAMANHO_BLOCO);
      await cliente.query("SAVEPOINT bloco");
      try {
        aceitas += await repo.inserirMarcacoesEmLote(
          cliente,
          bloco,
          loteId,
          sessao.usuario_id
        );
        await cliente.query("RELEASE SAVEPOINT bloco");
      } catch {
        await cliente.query("ROLLBACK TO SAVEPOINT bloco");
        for (const linha of bloco) {
          await cliente.query("SAVEPOINT linha");
          try {
            await repo.inserirMarcacao(cliente, {
              colaborador_id: linha.colaborador_id,
              momento_iso: linha.momento_iso,
              tipo: linha.tipo,
              origem: "importacao",
              origem_referencia: linha.origem_referencia,
              efeito: "registro",
              substitui_marcacao_id: null,
              lote_id: loteId,
              registrada_por: sessao.usuario_id,
            });
            await cliente.query("RELEASE SAVEPOINT linha");
            aceitas += 1;
          } catch (erro) {
            await cliente.query("ROLLBACK TO SAVEPOINT linha");
            rejeicoes.push({
              linha: linha.numero,
              conteudo: linha.conteudo,
              motivo:
                violacaoUnica(erro) === "marcacao_sem_repeticao"
                  ? "Marcação já existente (reimportação) — ignorada"
                  : `Falha ao gravar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
            });
          }
        }
      }
    }
    rejeicoes.sort((a, b) => a.linha - b.linha);

    const relatorio = {
      separador: entrada.separador,
      colunas_esperadas: ["matricula", "data", "hora", "tipo"],
      rejeitadas: rejeicoes,
      resumo:
        `${aceitas} de ${lidas} linhas aceitas; ` +
        `${rejeicoes.length} rejeitadas (motivo por linha acima)`,
    };
    await repo.fecharLote(
      cliente,
      loteId,
      lidas,
      aceitas,
      rejeicoes.length,
      relatorio
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ponto.importacao",
      tabela: "rh.lote_importacao_ponto",
      registroId: String(loteId),
      diff: diff({
        arquivo: [null, entrada.arquivo],
        competencia: [null, formatarCompetencia(entrada.ano, entrada.mes)],
        linhas_lidas: [null, lidas],
        linhas_aceitas: [null, aceitas],
        linhas_rejeitadas: [null, rejeicoes.length],
      }),
    });

    return {
      lote_id: loteId,
      linhas_lidas: lidas,
      linhas_aceitas: aceitas,
      linhas_rejeitadas: rejeicoes.length,
      rejeicoes,
    };
  });
}

export async function listarLotes() {
  return repo.listarLotes();
}

export async function buscarLote(id: number) {
  return repo.buscarLote(id);
}

// ------------------------------------------------------------------ ajuste de marcação

/**
 * Correção de ponto. NUNCA edita a marcação original: insere outra com origem
 * 'ajuste_manual' apontando para ela. O espelho mostra as duas e a trilha de
 * quem mudou o quê — é exatamente isso que a fiscalização pede.
 */
export async function ajustarMarcacao(
  sessao: PayloadSessao,
  dados: AjusteMarcacao
): Promise<number> {
  // Pessoa que não existe é 404 antes de qualquer escrita: sem isto a chave
  // estrangeira de rh.marcacao estourava lá dentro e o DP recebia 500 ("erro
  // interno") por ter digitado um id errado, que é erro dele e não do servidor.
  await exigirColaboradorExistente(dados.colaborador_id);
  return comTransacao(sessao.usuario_id, async (cliente) => {
    if (dados.substitui_marcacao_id) {
      const original = await repo.buscarMarcacao(
        cliente,
        dados.substitui_marcacao_id
      );
      if (!original) {
        throw new ErroHttpCampo(
          404,
          "Marcação original não encontrada",
          "substitui_marcacao_id"
        );
      }
      if (original.colaborador_id !== dados.colaborador_id) {
        throw new ErroHttpCampo(
          422,
          "A marcação corrigida é de outro colaborador",
          "substitui_marcacao_id"
        );
      }
      if (original.superada) {
        throw new ErroHttpCampo(
          409,
          "Essa marcação já foi corrigida por outra",
          "substitui_marcacao_id"
        );
      }
    }
    let id: number;
    try {
      id = await repo.inserirMarcacao(cliente, {
        colaborador_id: dados.colaborador_id,
        momento_iso: dados.momento,
        tipo: dados.tipo,
        origem: "ajuste_manual",
        origem_referencia: dados.justificativa,
        efeito: dados.anular ? "anulacao" : "registro",
        substitui_marcacao_id: dados.substitui_marcacao_id ?? null,
        lote_id: null,
        registrada_por: sessao.usuario_id,
      });
    } catch (erro) {
      // Já existe batida igual (mesma pessoa, mesmo instante, mesmo tipo). É
      // conflito de dados do usuário, não falha do servidor: 409, não 500.
      if (violacaoUnica(erro) === "marcacao_sem_repeticao") {
        throw new ErroHttpCampo(
          409,
          "Já existe uma marcação desse tipo para essa pessoa nesse exato instante",
          "momento"
        );
      }
      throw erro;
    }
    // A trilha tem que distinguir os TRÊS desfechos, porque são fatos
    // diferentes para quem fiscaliza: incluir batida que nunca existiu, trocar
    // uma batida errada por outra e anular batida indevida. O campo `substitui`
    // só faz sentido nos dois últimos — na inclusão ele saía como
    // "de null para <o id da própria marcação nova>", dizendo que a batida
    // substituía a si mesma, o que nunca aconteceu (substitui_marcacao_id fica
    // NULL no banco). Quem inclui não substitui nada e a trilha passa a dizer
    // isso com todas as letras.
    const substituiId = dados.substitui_marcacao_id ?? null;
    const origemDaLinha: Record<string, [unknown, unknown]> = substituiId
      ? { substitui: [substituiId, id] }
      : { inclusao: [null, "batida ausente reconstituída pelo ajuste"] };
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: dados.anular
        ? "ponto.marcacao.anular"
        : substituiId
          ? "ponto.marcacao.ajustar"
          : "ponto.marcacao.incluir",
      tabela: "rh.marcacao",
      registroId: String(id),
      diff: diff({
        colaborador_id: [null, dados.colaborador_id],
        momento: [null, dados.momento],
        tipo: [null, dados.tipo],
        ...origemDaLinha,
        justificativa: [null, dados.justificativa],
      }),
    });
    return id;
  });
}

// ------------------------------------------------------------------ apuração

export interface ResultadoApuracaoCompetencia {
  ano: number;
  mes: number;
  apurados: number;
  sem_escala: number;
  intercorrencias: number;
  saldo_total_minutos: number;
  detalhes: {
    colaborador_id: number;
    nome: string;
    trabalhado_minutos: number;
    previsto_minutos: number;
    he_50_minutos: number;
    he_100_minutos: number;
    saldo_banco_minutos: number;
    intercorrencias: number;
  }[];
  /**
   * Mudança de cadastro que aconteceu DURANTE a rodada e não impediu a
   * gravação — o mês foi apurado com o cadastro do começo, e quem mexeu tem
   * que saber disso. Ver a conferência cadastral na FASE 3.
   */
  avisos_cadastro: {
    colaborador_id: number;
    nome: string;
    matricula: string;
    aviso: string;
  }[];
}

// ---------------------------------------------------- quem derrubou o mês

/**
 * Uma pessoa que impediu o fechamento da competência, com o que o DP precisa
 * para ir mexer: NOME, MATRÍCULA e a CAUSA em português.
 */
interface FalhaDePessoa {
  colaborador_id: number;
  nome: string;
  matricula: string;
  causa: string;
}

/** Quantas pessoas a mensagem nomeia antes de virar "e mais N". */
const MAXIMO_NOMES_NA_FALHA = 10;

/**
 * Monta a mensagem que o DP lê quando a competência não fecha.
 *
 * O PORQUÊ desta função: a apuração da competência inteira é UMA transação
 * (ver FASE 3), então o erro de UMA pessoa derruba o mês. Isso está certo — o
 * que estava errado era o mês cair devolvendo "Erro interno do servidor", sem
 * dizer QUAL das 62 pessoas foi. Com 700 pessoas, procurar a agulha é uma noite
 * perdida. A mensagem tem que caber numa linha de tela e ainda assim permitir
 * abrir a ficha de quem quebrou: por isso nome + matrícula + causa, e por isso
 * a lista, não só a primeira — quem for corrigir prefere corrigir as três de
 * uma vez a descobrir a segunda depois de 50 s de reapuração.
 *
 * CAUSA REPETIDA SAI UMA VEZ SÓ. Quando o mesmo defeito derruba todo mundo (a
 * regra padrão da empresa venceu, por exemplo), repetir a mesma frase dez vezes
 * empurra os nomes para fora da tela e esconde justamente o que interessa. Com
 * a causa em comum na frente, a lista vira só os nomes.
 */
function mensagemDeFalhas(
  competencia: string,
  falhas: FalhaDePessoa[],
  aberturaDoMotivo: string
): string {
  const nomeadas = falhas.slice(0, MAXIMO_NOMES_NA_FALHA);
  const restante = falhas.length - nomeadas.length;
  const causaEmComum =
    falhas.length > 1 && falhas.every((falha) => falha.causa === falhas[0].causa)
      ? falhas[0].causa
      : null;
  const lista = nomeadas
    .map((falha) =>
      causaEmComum
        ? `${falha.nome} (matrícula ${falha.matricula})`
        : `${falha.nome} (matrícula ${falha.matricula}): ${falha.causa}`
    )
    .join("; ");
  return (
    `A apuração de ${competencia} não foi gravada — nada entrou pela metade. ` +
    `${falhas.length === 1 ? "1 pessoa" : `${falhas.length} pessoas`} ` +
    `${aberturaDoMotivo}` +
    (causaEmComum ? `, todas pelo mesmo motivo: ${causaEmComum}. São elas` : "") +
    `: ${lista}` +
    (restante > 0 ? `; e mais ${restante}. Corrija e reapure.` : ".")
  );
}

/**
 * DECISÃO REGISTRADA (frente C, 31/07/2026) — falha de UMA pessoa derruba o mês
 * inteiro, de propósito. Não seguimos com "apura os outros 61 e avisa".
 *
 * O argumento, e não é preguiça de implementar:
 *
 * 1. O banco de horas é append-only e a reapuração funciona por ESTORNO + novo
 *    lançamento. Uma competência que fecha "quase toda" não tem estado: na
 *    reapuração seguinte, 61 pessoas seriam estornadas e 1 não, e o saldo de
 *    quem ficou de fora depende de qual rodada errou. Ninguém consegue auditar
 *    isso olhando o extrato.
 * 2. A folha IMPORTA do ponto por competência. Uma competência parcialmente
 *    apurada alimenta a folha com gente faltando SEM que a folha saiba —
 *    o erro sairia no contracheque de quem não foi apurado, não na tela do DP.
 * 3. A competência é a unidade de fechamento que o DP assina. "Fechei julho"
 *    tem que significar julho inteiro.
 *
 * O que muda com esta correção é só o CAMINHO DO ERRO: a mesma recusa atômica,
 * mas dizendo quem e por quê. O custo de refazer é 50 s de reapuração; o custo
 * de um mês meio gravado é uma folha errada.
 *
 * A distinção que VALE a pena e está implementada é outra: DADO DE PESSOA
 * (422/409, com nome e matrícula, o DP corrige e reapura) versus
 * INFRAESTRUTURA (500 genérico e stack no log, não há o que o DP corrija).
 * Erro que não sabemos explicar continua sendo 500 — inventar uma mensagem
 * amigável para uma queda de rede seria mentir para quem está de plantão.
 */
const MOTIVO_ATOMICIDADE =
  "A competência é atômica: ou entra inteira, ou não entra nada.";

/**
 * Apura a competência: varre quem tem escala vigente, monta o mês dia a dia,
 * chama o motor puro e grava apuração + intercorrências + movimento de banco.
 *
 * Reapuração é suportada e HONESTA: a linha da apuração é sobrescrita (o
 * histórico fica em audit.alteracao), mas o banco de horas — que é append-only
 * — recebe um ESTORNO do movimento anterior antes do novo. Saldo continua
 * sendo a soma e ninguém precisa confiar em UPDATE nenhum.
 *
 * A transação abre TRAVANDO (pessoa, competência) — ver repo.travarApuracoes.
 *
 * Roda em três fases (leitura em lote, cálculo puro, uma transação com escritas
 * em lote) por DESEMPENHO: cada fase tem o porquê medido no comentário dela.
 */
export async function apurarCompetencia(
  sessao: PayloadSessao,
  entrada: ApurarCompetencia
): Promise<ResultadoApuracaoCompetencia> {
  const { ano, mes } = entrada;
  const dias = diasFechadosDaCompetencia(ano, mes);
  if (dias.length === 0) {
    throw new ErroHttp(
      409,
      `A competência ${formatarCompetencia(ano, mes)} ainda não tem nenhum dia fechado. A apuração vai até ontem — dia em curso não é apurado.`
    );
  }
  const primeiroDia = dias[0];
  const ultimoDia = dias[dias.length - 1];

  const detalhes: ResultadoApuracaoCompetencia["detalhes"] = [];
  let semEscala = 0;

  // Apurar UMA pessoa: id que não existe é 404, como no espelho e no resumo —
  // ver exigirColaboradorExistente. E quem EXISTE mas não entrou no alvo
  // (desligado ou sem escala vigente no último dia) entra em `sem_escala`:
  // sem isso as três situações devolviam o MESMO "apurados: 0, sem_escala: 0" e
  // o DP não sabia se tinha errado o id, se a pessoa saiu ou se falta escala.
  let alvos: repo.ColaboradorPonto[];
  if (entrada.colaborador_id) {
    await exigirColaboradorExistente(entrada.colaborador_id);
    alvos = (await repo.listarColaboradoresComEscala(ultimoDia)).filter(
      (colaborador) => colaborador.id === entrada.colaborador_id
    );
    if (alvos.length === 0) semEscala = 1;
  } else {
    alvos = await repo.listarColaboradoresComEscala(ultimoDia);
  }

  let totalIntercorrencias = 0;
  let saldoTotal = 0;

  // ------------------------------------------------------------------
  // FASE 1 — LEITURA EM LOTE: uma ida ao banco POR ASSUNTO, não por pessoa.
  //
  // Antes era uma consulta por pessoa para escala, regra, marcação, feriado e
  // saldo. Medido em 31/07/2026 na competência 07/2026 (62 pessoas, banco em
  // us-west-2 com ida e volta de 222 ms): 15,3 idas por pessoa, 951 no total,
  // 340 s de relógio — dos quais 338,8 s esperando a rede e 1,5 s de CPU do
  // motor. O banco em si não trabalhava: o EXPLAIN da leitura de marcações dá
  // 0,27 ms de execução. O gargalo era a QUANTIDADE de idas, não a falta de
  // índice — por isso não há migration nesta correção.
  // ------------------------------------------------------------------
  const idsAlvo = alvos.map((colaborador) => colaborador.id);
  const escalas = await repo.escalasVigentesNaDataEmLote(idsAlvo, ultimoDia);
  const regras = await repo.resolverRegrasBancoEmLote(
    idsAlvo.map((id) => ({ colaborador_id: id, data: ultimoDia }))
  );
  // Um dia a mais nas DUAS pontas, pelo turno que vira a noite (12x36) — o
  // porquê está no comentário do agrupamento, logo abaixo.
  const marcacoesPorPessoa = await repo.marcacoesValidasDoPeriodoEmLote(
    idsAlvo,
    somarDias(primeiroDia, -1),
    somarDias(ultimoDia, 1)
  );
  const feriadosPorPessoa = await repo.feriadosDosColaboradoresEmLote(
    idsAlvo,
    primeiroDia,
    ultimoDia
  );
  // Saldo de banco de horas de todos. Antes lia-se de dentro da transação de
  // cada pessoa, mas SEMPRE pelo pool (nunca pelo cliente da transação), então
  // ler tudo aqui devolve exatamente os mesmos números: o saldo de uma pessoa
  // não depende do que foi gravado para outra.
  const saldos = await repo.saldosBanco(idsAlvo);

  // ------------------------------------------------------------------
  // FASE 2 — CÁLCULO PURO: o motor roda para todo mundo SEM tocar no banco.
  //
  // Efeito colateral bem-vindo: os dois erros 422 desta rotina (regra de banco
  // ausente e erro do motor) agora estouram ANTES de qualquer escrita. Antes
  // eles estouravam no meio do laço, com as pessoas já processadas gravadas e
  // as seguintes não — o DP recebia um erro e ficava com meia competência
  // apurada, sem saber onde a conta parou.
  // ------------------------------------------------------------------
  interface PessoaPreparada {
    colaborador: repo.ColaboradorPonto;
    escala: repo.EscalaVigente;
    regra: repo.RegraBanco;
    resultado: ResultadoApuracao;
    memoria: Record<string, unknown>;
  }
  const preparadas: PessoaPreparada[] = [];
  // Quem não passou pelo cálculo. NÃO se lança no primeiro: o laço vai até o
  // fim e a recusa sai com a lista completa. Quem for corrigir prefere ver as
  // três de uma vez a descobrir a segunda depois de mais 50 s de reapuração —
  // e as três aparecem juntas porque a FASE 2 não toca no banco, então parar no
  // primeiro não protege nada.
  const falhasDeCalculo: FalhaDePessoa[] = [];

  for (const colaborador of alvos) {
    const escala = escalas.get(colaborador.id);
    if (!escala) {
      semEscala += 1;
      continue;
    }
    const regra = regras.get(`${colaborador.id}:${ultimoDia}`);
    if (!regra) {
      // Antes esta recusa não dizia de QUEM era a regra faltando: o DP lia
      // "cadastre em Parâmetros" e não sabia em qual das 62 fichas mexer.
      falhasDeCalculo.push({
        colaborador_id: colaborador.id,
        nome: colaborador.nome_completo,
        matricula: colaborador.matricula,
        causa:
          "não há regra de banco de horas vigente para ela nem padrão da " +
          "empresa — cadastre em Ponto › Parâmetros",
      });
      continue;
    }

    // Um dia a mais nas DUAS pontas, pelo turno que vira a noite (12x36).
    //
    // No FIM: a saída de 07:00 do dia 1º do mês seguinte pertence ao plantão do
    // dia 30. No COMEÇO, o espelho disso: a saída de 07:00 do dia 1º DESTA
    // competência pertence ao plantão que entrou no dia 30 do mês anterior. O
    // arraste de agruparMarcacoesPorDia só amarra a batida da madrugada ao
    // turno da véspera se a véspera estiver NA LISTA — cortada em primeiroDia,
    // a saída ficava órfã no dia 1º, e em 12x36/escala_livre "dia com marcação
    // é dia de escala": previsto cheio, zero trabalhado, FALTA INTEGRAL mais o
    // DSR da semana descontados em folha de quem cumpriu o plantão inteiro.
    //
    // O dia extra entra só para o agrupamento ter em que se amarrar: diasMotor
    // abaixo é montado a partir de `dias`, então nada de fora da competência é
    // apurado — e o que for arrastado para a véspera sai do dia 1º, que é
    // exatamente o efeito desejado (aquele dia é descanso das 36h).
    const porDia = agruparMarcacoesPorDia(
      marcacoesPorPessoa.get(colaborador.id) ?? [],
      escala.jornada
    );
    const feriadoPorData = new Map(
      (feriadosPorPessoa.get(colaborador.id) ?? [])
        .filter((feriado) => feriado.tipo === "feriado")
        .map((feriado) => [feriado.data, feriado.nome])
    );

    // Dia ANTERIOR ao início da escala não é dia da pessoa: quem foi admitido
    // no dia 15 não tinha jornada prevista do dia 1º ao 14, e o motor — que só
    // enxerga "previsto sem marcação" — lançaria meia competência de falta
    // integral (com DSR descontado em folha) em todo admitido do mês.
    const diasMotor: DiaMotor[] = dias
      .filter((data) => data >= escala.inicio_vigencia)
      .map((data) => ({
        data,
        dia_semana: diaDaSemana(data),
        feriado: feriadoPorData.get(data) ?? null,
        dia_de_escala: diaDeEscala(escala, data),
        marcacoes: porDia.get(data) ?? [],
      }));

    let resultado;
    try {
      resultado = apurarPonto({
        ano,
        mes,
        jornada: escala.jornada,
        regra: {
          id: regra.id,
          fator_he_50: regra.fator_he_50,
          fator_he_100: regra.fator_he_100,
        },
        dias: diasMotor,
      });
    } catch (erro) {
      // ErroMotorPonto é DADO DE PESSOA (jornada inválida, marcação impossível):
      // tem dono, tem conserto e vai para a lista com nome e matrícula.
      if (erro instanceof ErroMotorPonto) {
        falhasDeCalculo.push({
          colaborador_id: colaborador.id,
          nome: colaborador.nome_completo,
          matricula: colaborador.matricula,
          causa: erro.message,
        });
        continue;
      }
      // Qualquer outra coisa vindo do motor é defeito nosso, não dado do DP:
      // sobe crua para virar 500 com stack no log. Ver MOTIVO_ATOMICIDADE.
      throw erro;
    }

    // Denominador da MÉDIA DE HORA EXTRA POR DIA (pedido textual da diretoria):
    // dia útil = dia com jornada prevista. Fica na memória para a média poder
    // ser recalculada por qualquer consumidor sem refazer a apuração.
    const diasUteis = resultado.dias.filter(
      (dia) => dia.previsto_minutos > 0
    ).length;
    const totalHe = resultado.he_50_minutos + resultado.he_100_minutos;
    const memoria: Record<string, unknown> = {
      ...resultado.memoria,
      resumo: {
        dias_uteis: diasUteis,
        dias_com_trabalho: resultado.dias.filter(
          (dia) => dia.trabalhado_minutos > 0
        ).length,
        total_he_minutos: totalHe,
        media_he_por_dia_util_minutos:
          diasUteis > 0 ? Math.round(totalHe / diasUteis) : 0,
        formula_media:
          "(HE 50% + HE 100%) ÷ dias com jornada prevista na competência",
      },
      dias: resultado.dias,
    };

    preparadas.push({ colaborador, escala, regra, resultado, memoria });
  }

  const competencia = formatarCompetencia(ano, mes);

  // A recusa sai AQUI, com a lista fechada e antes de a transação abrir: nada
  // foi escrito, ninguém ficou travado, e o DP recebe de uma vez todo mundo que
  // precisa de conserto. 422 porque é dado que existe no cadastro e que ele
  // corrige — não é conflito de concorrência (que é 409, na FASE 3).
  if (falhasDeCalculo.length > 0) {
    throw new ErroHttp(
      422,
      mensagemDeFalhas(
        competencia,
        falhasDeCalculo,
        "não puderam ser calculadas"
      ) +
        ` ${MOTIVO_ATOMICIDADE}`
    );
  }

  // ------------------------------------------------------------------
  // FASE 3 — UMA TRANSAÇÃO, ESCRITAS EM LOTE.
  //
  // Antes era uma transação POR PESSOA: BEGIN, SET, trava, leitura da anterior,
  // gravação, movimento, reconciliação da fila, trilha e COMMIT — nove a onze
  // idas de rede por pessoa, 62 vezes. Agora é uma trava para todos, uma leitura
  // das anteriores, uma gravação, um bloco de movimentos, uma reconciliação, uma
  // gravação de intercorrências e uma trilha.
  //
  // MUDANÇA DE COMPORTAMENTO, e ela é deliberada: a competência passa a ser
  // atômica. Antes, um erro na pessoa 40 deixava 39 apurações gravadas e 22 não;
  // agora ou a competência inteira entra ou nada entra. O que é gravado, e o
  // valor de cada campo, continua idêntico — a diferença aparece só no caminho
  // do erro. Em compensação a trava de (pessoa, competência) fica presa até o
  // fim da rodada: quem apurar UMA pessoa no meio de uma apuração de competência
  // espera, em vez de correr por fora. Isso é o que a trava sempre quis dizer.
  // ------------------------------------------------------------------
  const idsPreparados = preparadas.map((pessoa) => pessoa.colaborador.id);
  const limitesPorPessoa = new Map<
    number,
    ReturnType<typeof limitarCreditoDoBanco>
  >();
  const avisosCadastro: ResultadoApuracaoCompetencia["avisos_cadastro"] = [];

  await comTransacao(sessao.usuario_id, async (cliente) => {
    // TRAVA PRIMEIRO, lê depois: sem isto a PRIMEIRA apuração da competência
    // não trancava nada (não há linha para o FOR UPDATE segurar) e duas
    // execuções simultâneas creditavam o banco duas vezes, sem estorno.
    await repo.travarApuracoes(cliente, idsPreparados, ano, mes);

    // CONFERÊNCIA CADASTRAL — o cadastro foi lido na FASE 1 e só vai ser
    // gravado agora, ~50 s depois. Nesse intervalo o cadastro muda: gente é
    // desligada, escala é encerrada e — foi o que derrubou a verificação de
    // 31/07/2026 — gente é APAGADA. Antes disso aqui existir, a pessoa apagada
    // só aparecia como violação da FK lá no INSERT, o que virava
    // "Erro interno do servidor" para a competência inteira.
    //
    // Duas classes de mudança, tratadas diferente de propósito:
    //
    //  • PESSOA REMOVIDA — não há como gravar (a FK não deixa) e não há o que
    //    decidir: a rodada para, com nome e matrícula de quem sumiu. 409,
    //    porque o mundo mudou embaixo da rodada, não porque o pedido do DP
    //    estivesse errado.
    //  • DESLIGADA ou ESCALA ENCERRADA no meio da janela — a gravação funciona
    //    e o número está CERTO: a pessoa trabalhou aqueles dias e a rescisão
    //    depende justamente desta apuração. Abortar julho inteiro porque
    //    alguém foi desligado dia 31 seria destruir trabalho por nada. Segue,
    //    mas sai em `avisos_cadastro` — o DP fica sabendo em vez de descobrir
    //    depois. É esta a única "falha de uma pessoa que o mês tolera".
    const cadastroAgora = await repo.conferirCadastroParaApuracao(
      cliente,
      idsPreparados,
      ultimoDia
    );
    const removidas: FalhaDePessoa[] = [];
    for (const pessoa of preparadas) {
      const atual = cadastroAgora.get(pessoa.colaborador.id);
      if (!atual) {
        removidas.push({
          colaborador_id: pessoa.colaborador.id,
          nome: pessoa.colaborador.nome_completo,
          matricula: pessoa.colaborador.matricula,
          causa: "foi removida do cadastro depois que a apuração começou",
        });
        continue;
      }
      if (atual.status === "desligado") {
        avisosCadastro.push({
          colaborador_id: atual.id,
          nome: atual.nome_completo,
          matricula: atual.matricula,
          aviso:
            "foi desligada durante a apuração; o mês foi apurado com o " +
            "cadastro do início da rodada — confira antes da rescisão",
        });
      } else if (!atual.tem_escala_vigente) {
        avisosCadastro.push({
          colaborador_id: atual.id,
          nome: atual.nome_completo,
          matricula: atual.matricula,
          aviso:
            `a escala deixou de valer em ${ultimoDia} durante a apuração; ` +
            "o mês foi apurado com a escala do início da rodada",
        });
      }
    }
    if (removidas.length > 0) {
      throw new ErroHttp(
        409,
        mensagemDeFalhas(
          competencia,
          removidas,
          "sumiram do cadastro no meio da rodada"
        ) + ` ${MOTIVO_ATOMICIDADE}`
      );
    }

    const anteriores = await repo.buscarApuracoesParaAtualizarEmLote(
      cliente,
      idsPreparados,
      ano,
      mes
    );

    const paraGravar: repo.DadosApuracao[] = [];
    for (const pessoa of preparadas) {
      const anterior = anteriores.get(pessoa.colaborador.id) ?? null;
      // O teto é conferido contra o saldo JÁ ESTORNADO: reapurar a mesma
      // competência não pode ver o próprio crédito anterior como se fosse de
      // outra pessoa e cortar o dobro. Com o estorno descontado, reapurar duas
      // vezes seguidas dá exatamente o mesmo número.
      const estorno = anterior ? -anterior.saldo_banco_minutos : 0;
      const saldoBase = (saldos.get(pessoa.colaborador.id) ?? 0) + estorno;
      // A regra do teto (e o porquê dela) mora no motor puro, para o semeador
      // da demo aplicar exatamente a mesma — ver limitarCreditoDoBanco.
      const limite = limitarCreditoDoBanco(
        saldoBase,
        pessoa.resultado.saldo_banco_minutos,
        pessoa.regra.limite_positivo_minutos,
        -pessoa.regra.limite_negativo_minutos,
        {
          regra: `${pessoa.regra.escopo} (versão ${pessoa.regra.id})`,
          competencia,
        }
      );
      pessoa.memoria.saldo_banco_teto = limite.memoria;
      limitesPorPessoa.set(pessoa.colaborador.id, limite);

      paraGravar.push({
        colaborador_id: pessoa.colaborador.id,
        ano,
        mes,
        jornada_versao_id: pessoa.escala.jornada.id,
        regra_banco_versao_id: pessoa.regra.id,
        minutos_trabalhados: pessoa.resultado.minutos_trabalhados,
        minutos_previstos: pessoa.resultado.minutos_previstos,
        he_50_minutos: pessoa.resultado.he_50_minutos,
        he_100_minutos: pessoa.resultado.he_100_minutos,
        adicional_noturno_minutos: pessoa.resultado.adicional_noturno_minutos,
        adicional_noturno_relogio_minutos:
          pessoa.resultado.adicional_noturno_relogio_minutos,
        faltas_minutos: pessoa.resultado.faltas_minutos,
        atrasos_minutos: pessoa.resultado.atrasos_minutos,
        dsr_desconto_minutos: pessoa.resultado.dsr_desconto_minutos,
        // O que a apuração mandou ao banco é o que ENTROU no livro, não o que o
        // motor calculou antes do teto — senão o estorno da próxima reapuração
        // devolveria um crédito que nunca existiu.
        saldo_banco_minutos: limite.lancado,
        memoria: pessoa.memoria,
        calculada_por: sessao.usuario_id,
      });
    }
    const idsApuracao = await repo.gravarApuracoesEmLote(cliente, paraGravar);

    // Banco de horas é append-only: o estorno da apuração anterior vem ANTES do
    // crédito novo, pessoa por pessoa, na mesma ordem de sempre.
    const movimentos: repo.DadosMovimentoBanco[] = [];
    for (const pessoa of preparadas) {
      const anterior = anteriores.get(pessoa.colaborador.id) ?? null;
      const limite = limitesPorPessoa.get(pessoa.colaborador.id);
      if (!limite) continue;
      if (anterior && anterior.saldo_banco_minutos !== 0) {
        movimentos.push({
          colaborador_id: pessoa.colaborador.id,
          data: ultimoDia,
          minutos: -anterior.saldo_banco_minutos,
          // Origem própria (0036): estorno automático de reapuração não é
          // ajuste manual do DP, e a amarração com a apuração revertida sai do
          // texto da observação para o campo — auditoria fecha por id.
          origem: "estorno_apuracao",
          apuracao_id: anterior.id,
          observacao:
            `Estorno da apuração anterior de ${competencia} ` +
            `(${formatarMinutos(anterior.saldo_banco_minutos)}) — reapuração`,
          registrado_por: sessao.usuario_id,
        });
      }
      if (limite.lancado !== 0) {
        movimentos.push({
          colaborador_id: pessoa.colaborador.id,
          data: ultimoDia,
          minutos: limite.lancado,
          origem: "apuracao",
          apuracao_id: idsApuracao.get(pessoa.colaborador.id) ?? null,
          observacao:
            `Apuração de ${competencia}` +
            (limite.excedente !== 0
              ? ` — lançado até o limite da regra (${formatarMinutos(limite.lancado)} ` +
                `de ${formatarMinutos(pessoa.resultado.saldo_banco_minutos)} calculados)`
              : ""),
          registrado_por: sessao.usuario_id,
        });
      }
    }
    await repo.inserirMovimentosBancoEmLote(cliente, movimentos);

    // RECONCILIAÇÃO DA FILA — nada é apagado (ver a migration 0037).
    // A do teto do banco nasce aqui no serviço, não no motor, mas é fato do
    // mesmo período e entra na mesma conta: fora da lista de detectadas, ela
    // seria "resolvida" um segundo antes de ser regravada.
    //
    // A lista vai deduplicada por (pessoa, dia, tipo) porque um único comando
    // não pode tocar a mesma linha duas vezes — quando o mesmo fato aparecesse
    // repetido, o detalhe que fica gravado é o ÚLTIMO, que é exatamente o que o
    // laço de antes deixava.
    const deteccoesPorPessoa = new Map<
      number,
      Map<string, repo.DeteccaoIntercorrencia>
    >();
    for (const pessoa of preparadas) {
      const limite = limitesPorPessoa.get(pessoa.colaborador.id);
      const doDia = new Map<string, repo.DeteccaoIntercorrencia>();
      for (const ocorrencia of pessoa.resultado.intercorrencias) {
        doDia.set(`${ocorrencia.data}|${ocorrencia.tipo}`, {
          colaborador_id: pessoa.colaborador.id,
          data: ocorrencia.data,
          tipo: ocorrencia.tipo,
          detalhe: ocorrencia.detalhe,
        });
      }
      if (limite?.intercorrencia) {
        doDia.set(`${ultimoDia}|banco_fora_do_limite`, {
          colaborador_id: pessoa.colaborador.id,
          data: ultimoDia,
          tipo: "banco_fora_do_limite",
          detalhe: limite.intercorrencia,
        });
      }
      deteccoesPorPessoa.set(pessoa.colaborador.id, doDia);
    }
    const deteccoes = [...deteccoesPorPessoa.values()].flatMap((doDia) => [
      ...doDia.values(),
    ]);

    const resolvidasPorPessoa = await repo.resolverIntercorrenciasAusentesEmLote(
      cliente,
      idsPreparados,
      primeiroDia,
      ultimoDia,
      deteccoes,
      sessao.usuario_id,
      competencia
    );
    const desfechos = await repo.inserirIntercorrenciasEmLote(
      cliente,
      deteccoes
    );

    const alteracoes: EntradaAlteracao[] = [];
    for (const pessoa of preparadas) {
      const anterior = anteriores.get(pessoa.colaborador.id) ?? null;
      const limite = limitesPorPessoa.get(pessoa.colaborador.id);
      if (!limite) continue;
      const resolvidas = resolvidasPorPessoa.get(pessoa.colaborador.id) ?? [];
      // Reabertura conta: é o caso em que alguém deu o fato por corrigido (ou
      // uma reapuração anterior não o achou) e o motor achou o mesmo fato de
      // novo. Vai para a trilha da apuração, junto com o que saiu da fila. O
      // fato do TETO não entra: quem o detecta é o serviço, não o motor.
      let reabertas = 0;
      for (const deteccao of (
        deteccoesPorPessoa.get(pessoa.colaborador.id) ?? new Map()
      ).values()) {
        if (deteccao.tipo === "banco_fora_do_limite") continue;
        const chave = `${deteccao.colaborador_id}|${deteccao.data}|${deteccao.tipo}`;
        if (desfechos.get(chave) === "reaberta") reabertas += 1;
      }

      alteracoes.push({
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: anterior ? "ponto.apuracao.reapurar" : "ponto.apuracao.calcular",
        tabela: "rh.apuracao_ponto",
        registroId: String(idsApuracao.get(pessoa.colaborador.id) ?? ""),
        diff: diff({
          colaborador: [null, pessoa.colaborador.nome_completo],
          competencia: [null, competencia],
          trabalhado: [
            anterior ? formatarMinutos(anterior.minutos_trabalhados) : null,
            formatarMinutos(pessoa.resultado.minutos_trabalhados),
          ],
          previsto: [
            anterior ? formatarMinutos(anterior.minutos_previstos) : null,
            formatarMinutos(pessoa.resultado.minutos_previstos),
          ],
          he_50: [
            anterior ? formatarMinutos(anterior.he_50_minutos) : null,
            formatarMinutos(pessoa.resultado.he_50_minutos),
          ],
          he_100: [
            anterior ? formatarMinutos(anterior.he_100_minutos) : null,
            formatarMinutos(pessoa.resultado.he_100_minutos),
          ],
          saldo_banco: [
            anterior ? formatarMinutos(anterior.saldo_banco_minutos) : null,
            formatarMinutos(limite.lancado),
          ],
          ...(limite.excedente !== 0
            ? {
                banco_fora_do_limite: [
                  formatarMinutos(pessoa.resultado.saldo_banco_minutos),
                  `${formatarMinutos(limite.lancado)} lançados; ` +
                    `${formatarMinutos(limite.excedente)} fora do banco pelo ` +
                    `limite da regra ${pessoa.regra.escopo}`,
                ] as [unknown, unknown],
              }
            : {}),
          ...(reabertas > 0
            ? {
                intercorrencias_reabertas: [null, reabertas] as [
                  unknown,
                  unknown,
                ],
              }
            : {}),
          // O que SAIU da fila é a pergunta que a trilha não sabia responder:
          // "o que estava aberto ontem e por que sumiu?". Vai id a id, com o
          // dia e o tipo, porque uma contagem não permite conferir nada.
          ...(resolvidas.length > 0
            ? {
                intercorrencias_resolvidas: [
                  resolvidas.length,
                  resolvidas
                    .map(
                      (item) =>
                        `#${item.id} ${item.data} ` +
                        ROTULOS_TIPO_INTERCORRENCIA[item.tipo]
                    )
                    .join("; "),
                ] as [unknown, unknown],
              }
            : {}),
        }),
      });
    }
    await registrarAlteracoesEmLote(cliente, alteracoes);
    // REDE DE SEGURANÇA do caminho do erro. A conferência cadastral acima e o
    // FOR KEY SHARE que ela segura fecham a janela da pessoa apagada, mas a
    // gravação depende de outras referências (a versão da jornada, a versão da
    // regra de banco) que também podem sumir no meio da rodada. Sem isto,
    // qualquer uma delas volta a ser "Erro interno do servidor" para o mês
    // inteiro. Fica aqui, e não em cada chamada do repositório, porque o que o
    // DP precisa saber é o mesmo em todas: o que sumiu e que nada foi gravado.
  }).catch(async (erro: unknown) => {
    throw await explicarFalhaDaGravacao(erro, preparadas, competencia);
  });

  for (const pessoa of preparadas) {
    const limite = limitesPorPessoa.get(pessoa.colaborador.id);
    if (!limite) continue;
    // A fila do DP conta o que foi GRAVADO: a do teto nasce no serviço, não no
    // motor, e some da contagem se somarmos só o que o motor devolveu.
    const totalDoDia =
      pessoa.resultado.intercorrencias.length + (limite.excedente !== 0 ? 1 : 0);
    detalhes.push({
      colaborador_id: pessoa.colaborador.id,
      nome: pessoa.colaborador.nome_completo,
      trabalhado_minutos: pessoa.resultado.minutos_trabalhados,
      previsto_minutos: pessoa.resultado.minutos_previstos,
      he_50_minutos: pessoa.resultado.he_50_minutos,
      he_100_minutos: pessoa.resultado.he_100_minutos,
      saldo_banco_minutos: limite.lancado,
      intercorrencias: totalDoDia,
    });
    totalIntercorrencias += totalDoDia;
    saldoTotal += limite.lancado;
  }

  return {
    ano,
    mes,
    apurados: detalhes.length,
    sem_escala: semEscala,
    intercorrencias: totalIntercorrencias,
    saldo_total_minutos: saldoTotal,
    detalhes,
    avisos_cadastro: avisosCadastro,
  };
}

/** Códigos do Postgres que a gravação da apuração sabe explicar. */
const PG_VIOLACAO_FK = "23503";
const PG_DEADLOCK = "40P01";
const PG_SERIALIZACAO = "40001";

function codigoPostgres(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null || !("code" in erro))
    return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === "string" ? codigo : null;
}

function restricaoPostgres(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null) return null;
  const restricao = (erro as { constraint?: unknown }).constraint;
  return typeof restricao === "string" ? restricao : null;
}

/**
 * Traduz a queda da gravação para uma frase que o DP consegue AGIR em cima,
 * ou devolve o erro original quando não sabemos o que é.
 *
 * A regra que dá o tom: só viramos uma queda em mensagem amigável quando
 * sabemos MESMO o que aconteceu. Erro de rede, de disco ou defeito nosso
 * continua subindo cru para virar 500 com stack no log — inventar um texto
 * gentil para uma falha de infraestrutura tiraria do plantão a única pista que
 * ele tem, e faria o DP procurar um problema de cadastro que não existe.
 *
 * O id de quem sumiu NÃO sai do texto do erro do Postgres (aquele "Key
 * (colaborador_id)=(2368)…" muda de idioma conforme o lc_messages do servidor).
 * Perguntamos ao banco, de novo e pelo pool — depois do ROLLBACK o cliente da
 * transação não responde mais nada — quais dos ids da rodada não existem.
 */
async function explicarFalhaDaGravacao(
  erro: unknown,
  preparadas: { colaborador: repo.ColaboradorPonto }[],
  competencia: string
): Promise<unknown> {
  // Recusa que já é explicada (a conferência cadastral, por exemplo) passa reta.
  if (erro instanceof ErroHttp) return erro;
  const codigo = codigoPostgres(erro);

  if (codigo === PG_VIOLACAO_FK) {
    const porId = new Map(
      preparadas.map((pessoa) => [pessoa.colaborador.id, pessoa.colaborador])
    );
    const sumiram = await repo.colaboradoresInexistentes([...porId.keys()]);
    if (sumiram.length > 0) {
      return new ErroHttp(
        409,
        mensagemDeFalhas(
          competencia,
          sumiram.map((id) => ({
            colaborador_id: id,
            nome: porId.get(id)?.nome_completo ?? `colaborador #${id}`,
            matricula: porId.get(id)?.matricula ?? "desconhecida",
            causa: "foi removida do cadastro depois que a apuração começou",
          })),
          "sumiram do cadastro no meio da rodada"
        ) + ` ${MOTIVO_ATOMICIDADE}`
      );
    }
    // As pessoas estão todas lá: quem sumiu foi outra referência da apuração
    // (versão de jornada, versão de regra de banco). Não dá para nomear a
    // pessoa, mas dá para nomear a restrição — é por onde o suporte começa.
    return new ErroHttp(
      409,
      `A apuração de ${competencia} não foi gravada — nada entrou pela metade. ` +
        "Um cadastro que a apuração usa foi apagado durante a rodada " +
        `(restrição ${restricaoPostgres(erro) ?? "de integridade"}). ` +
        `Confira a versão da jornada e a da regra de banco de horas e reapure. ${MOTIVO_ATOMICIDADE}`
    );
  }

  if (codigo === PG_DEADLOCK || codigo === PG_SERIALIZACAO) {
    return new ErroHttp(
      409,
      `A apuração de ${competencia} esbarrou em outra operação simultânea e foi ` +
        "desfeita — nada foi gravado. Rode de novo; se repetir, veja quem está " +
        `apurando ou mexendo no cadastro ao mesmo tempo. ${MOTIVO_ATOMICIDADE}`
    );
  }

  return erro;
}

export async function listarApuracoesDaCompetencia(ano: number, mes: number) {
  return repo.listarApuracoesDaCompetencia(ano, mes);
}

// ------------------------------------------------------------------ bateria de regressão do motor

export interface DiferencaCasoPonto {
  campo: string;
  esperado: number | string | boolean | null;
  obtido: number | string | boolean | null;
}

export interface ResultadoCasoPonto {
  caso_id: number;
  nome: string;
  descricao: string;
  passou: boolean;
  diferencas: DiferencaCasoPonto[];
  erro: string | null;
}

/** Totais da apuração, na ordem em que o caso os declara. */
function totaisDoResultado(
  resultado: ResultadoApuracao
): Record<string, number> {
  return {
    trabalhado: resultado.minutos_trabalhados,
    previsto: resultado.minutos_previstos,
    he_50: resultado.he_50_minutos,
    he_100: resultado.he_100_minutos,
    noturno_ficto: resultado.adicional_noturno_minutos,
    noturno_relogio: resultado.adicional_noturno_relogio_minutos,
    faltas: resultado.faltas_minutos,
    atrasos: resultado.atrasos_minutos,
    dsr_desconto: resultado.dsr_desconto_minutos,
    banco: resultado.saldo_banco_minutos,
  };
}

function camposDoDia(dia: DiaApurado): Record<string, number | boolean> {
  return {
    previsto: dia.previsto_minutos,
    trabalhado: dia.trabalhado_minutos,
    intervalo: dia.intervalo_minutos,
    he_50: dia.he_50_minutos,
    he_100: dia.he_100_minutos,
    noturno_ficto: dia.adicional_noturno_minutos,
    noturno_relogio: dia.adicional_noturno_relogio_minutos,
    atraso: dia.atraso_minutos,
    falta: dia.falta_minutos,
    banco: dia.banco_minutos,
    // "Dia PENDENTE de tratamento" não é coluna do resultado: é a consequência
    // do pareamento incompleto, e o motor a publica na memória do dia (é de lá
    // que o espelho a lê). A bateria confere o mesmo campo que a tela mostra.
    pendente: dia.memoria.pendente_de_tratamento === true,
  };
}

/**
 * Roda UM caso versionado de rh.caso_teste_ponto pelo caminho da aplicação:
 * agruparMarcacoesPorDia() e depois apurarPonto(), as mesmas duas funções, na
 * mesma ordem, que apurarCompetencia() usa. As marcações do caso trazem a DATA
 * REAL de cada batida, então o arraste de virada é exercitado — não presumido.
 */
function rodarCasoPonto(caso: repo.CasoTestePonto): ResultadoCasoPonto {
  const base = {
    caso_id: caso.id,
    nome: caso.nome,
    descricao: caso.descricao,
  };
  const entradaLida = esquemaEntradaCasoTestePonto.safeParse(caso.entrada);
  const saidaLida = esquemaSaidaCasoTestePonto.safeParse(caso.saida_esperada);
  if (!entradaLida.success || !saidaLida.success) {
    const falha = entradaLida.success
      ? saidaLida.success
        ? null
        : saidaLida.error
      : entradaLida.error;
    return {
      ...base,
      passou: false,
      diferencas: [],
      erro:
        "Caso malformado: entrada/saída não seguem o contrato do motor" +
        (falha ? ` (${falha.issues[0]?.path.join(".")}: ${falha.issues[0]?.message})` : "") +
        ".",
    };
  }

  const entrada = entradaLida.data;
  const esperado = saidaLida.data;
  try {
    const jornada: JornadaMotor = {
      // A jornada do caso é declarada, não cadastrada: não há linha em
      // rh.jornada_versao para referenciar (ver o cabeçalho da 0042).
      id: 0,
      ...entrada.jornada,
    };
    const porDia = agruparMarcacoesPorDia(
      entrada.marcacoes.map((marcacao, indice) => ({
        id: indice + 1,
        tipo: marcacao.tipo,
        data_local: marcacao.data,
        minuto_local: horaParaMinutos(marcacao.hora) ?? 0,
      })),
      jornada
    );
    const resultado = apurarPonto({
      ano: entrada.ano,
      mes: entrada.mes,
      jornada,
      regra: {
        id: null,
        fator_he_50: entrada.regra.fator_he_50,
        fator_he_100: entrada.regra.fator_he_100,
      },
      dias: entrada.dias.map((dia) => ({
        data: dia.data,
        dia_semana: diaDaSemana(dia.data),
        feriado: dia.feriado ?? null,
        dia_de_escala: dia.dia_de_escala ?? null,
        marcacoes: porDia.get(dia.data) ?? [],
      })),
    });

    const diferencas: DiferencaCasoPonto[] = [];

    const totais = totaisDoResultado(resultado);
    for (const [campo, valorEsperado] of Object.entries(esperado.totais)) {
      if (totais[campo] !== valorEsperado) {
        diferencas.push({
          campo: `totais.${campo}`,
          esperado: valorEsperado,
          obtido: totais[campo],
        });
      }
    }

    const apuradoPorData = new Map(resultado.dias.map((dia) => [dia.data, dia]));
    for (const [data, esperadoDoDia] of Object.entries(esperado.dias ?? {})) {
      const dia = apuradoPorData.get(data);
      if (!dia) {
        diferencas.push({
          campo: data,
          esperado: "dia apurado",
          obtido: null,
        });
        continue;
      }
      const obtidoDoDia = camposDoDia(dia);
      for (const [campo, valorEsperado] of Object.entries(esperadoDoDia)) {
        if (campo === "intercorrencias") continue;
        if (obtidoDoDia[campo] !== valorEsperado) {
          diferencas.push({
            campo: `${data}.${campo}`,
            esperado: valorEsperado as number | boolean,
            obtido: obtidoDoDia[campo] ?? null,
          });
        }
      }
      if (esperadoDoDia.intercorrencias) {
        // Conjunto ordenado: a ordem em que o motor empilha os achados do dia é
        // detalhe de implementação; o que o caso afirma é QUAIS achados existem.
        const obtidas = dia.intercorrencias
          .map((ocorrencia) => ocorrencia.tipo)
          .sort()
          .join(", ");
        const esperadas = [...esperadoDoDia.intercorrencias].sort().join(", ");
        if (obtidas !== esperadas) {
          diferencas.push({
            campo: `${data}.intercorrencias`,
            esperado: esperadas === "" ? "nenhuma" : esperadas,
            obtido: obtidas === "" ? "nenhuma" : obtidas,
          });
        }
      }
    }

    return {
      ...base,
      passou: diferencas.length === 0,
      diferencas,
      erro: null,
    };
  } catch (erro) {
    return {
      ...base,
      passou: false,
      diferencas: [],
      erro:
        erro instanceof ErroMotorPonto
          ? erro.message
          : erro instanceof Error
            ? erro.message
            : "Erro desconhecido no motor.",
    };
  }
}

export interface ResultadoSuitePonto {
  total: number;
  passaram: number;
  falharam: number;
  casos: ResultadoCasoPonto[];
}

/**
 * Bateria de regressão do motor de ponto: roda os rh.caso_teste_ponto ativos e
 * confere minuto a minuto contra a saída esperada, que foi calculada à mão e
 * está escrita por extenso na descrição de cada caso.
 *
 * É o alarme que a folha já tinha e o ponto não: nenhum dos números que a 0033 e
 * a 0034 tiraram do fonte — hora noturna reduzida, divisor do DSR, dia de
 * repouso, tolerância por marcação, janela de arraste — consegue voltar a ser
 * constante sem quebrar um caso aqui, e os casos GÊMEOS fazem quebrar só o lado
 * certo, que é o que aponta o defeito.
 */
export async function executarSuitePonto(): Promise<ResultadoSuitePonto> {
  const casos = await repo.listarCasosTestePontoAtivos();
  const resultados = casos.map(rodarCasoPonto);
  const passaram = resultados.filter((item) => item.passou).length;
  return {
    total: resultados.length,
    passaram,
    falharam: resultados.length - passaram,
    casos: resultados,
  };
}

// ------------------------------------------------------------------ espelho de ponto

export interface EspelhoPonto {
  colaborador: repo.ColaboradorPonto;
  ano: number;
  mes: number;
  jornada: string | null;
  apuracao: repo.Apuracao | null;
  marcacoes: repo.MarcacaoRegistro[];
  intercorrencias: repo.Intercorrencia[];
  saldo_banco_minutos: number;
}

/**
 * Espelho da competência. Leitura de ponto de TERCEIRO é dado sensível
 * (revela rotina, atrasos e saúde) — grava audit.leitura_sensivel. Espelho do
 * próprio não grava: é direito do trabalhador (Portaria 671 art. 79).
 */
export async function espelhoDaCompetencia(
  sessao: PayloadSessao,
  colaboradorId: number,
  ano: number,
  mes: number
): Promise<EspelhoPonto> {
  const proprio = await repo.colaboradorDoUsuario(sessao.usuario_id);
  const ehProprio = await ehVinculoProprio(sessao, colaboradorId);
  const chave = ehProprio
    ? null
    : await exigirAlcanceSobre(sessao, colaboradorId);

  const dias = diasDaCompetencia(ano, mes);
  const colaboradores = await repo.listarColaboradoresComEscala(
    dias[dias.length - 1]
  );
  // Sem escala vigente a pessoa ainda TEM espelho — vazio. Cair em 404 aqui
  // faria o gestor bater na parede ao clicar no liderado que ainda não foi
  // escalado. O alcance já foi conferido acima; buscar por id não amplia nada.
  const colaborador =
    colaboradores.find((item) => item.id === colaboradorId) ??
    (proprio?.id === colaboradorId ? proprio : null) ??
    (await repo.buscarColaboradorPonto(colaboradorId));
  if (!colaborador) throw new ErroHttp(404, "Colaborador não encontrado");
  // A trilha só depois do 404 — ver exigirColaboradorExistente.
  if (chave) {
    await registrarLeituraDePonto(
      sessao,
      chave,
      "ponto.espelho",
      `${colaboradorId}:${formatarCompetencia(ano, mes)}`
    );
  }

  const escala = await repo.escalaVigenteNaData(
    colaboradorId,
    dias[dias.length - 1]
  );
  return {
    colaborador,
    ano,
    mes,
    jornada: escala ? `${escala.jornada.codigo} — ${escala.jornada.nome}` : null,
    apuracao: await repo.buscarApuracao(colaboradorId, ano, mes),
    marcacoes: await repo.listarMarcacoesDoPeriodo(
      colaboradorId,
      dias[0],
      dias[dias.length - 1]
    ),
    // Uma pessoa em um mês nunca chega perto do teto da página — o espelho leva
    // a lista pura mesmo.
    intercorrencias: (
      await repo.listarIntercorrencias({
        colaboradorId,
        de: dias[0],
        ate: dias[dias.length - 1],
      })
    ).itens,
    saldo_banco_minutos: await repo.saldoBanco(colaboradorId),
  };
}

// ------------------------------------------------------------------ alcance e trilha de leitura

/**
 * As duas chaves que abrem o ponto de terceiro. A porta tem duas fechaduras, e
 * a trilha precisa dizer QUAL delas foi usada: `audit.leitura_sensivel.chave_permissao`
 * é "a chave que autorizou a leitura" (0001_fundacao.sql), não a chave que
 * protege o recurso. Carimbar sempre `ponto.ver.equipe` faria a auditoria
 * responder "como gestor da pessoa" para quem leu sendo DP e não é gestor de
 * ninguém.
 */
export type ChaveAlcancePonto = "ponto.administrar" | "ponto.ver.equipe";

/**
 * Política de trilha do módulo: TODA leitura de ponto de terceiro grava — a de
 * uma pessoa, a do time inteiro e a da competência do DP. O ponto do PRÓPRIO
 * nunca grava: é direito do trabalhador (Portaria 671 art. 79).
 */
async function registrarLeituraDePonto(
  sessao: PayloadSessao,
  chave: ChaveAlcancePonto,
  recurso: string,
  registroId: string
): Promise<void> {
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: chave,
    recurso,
    registroId,
  });
}

/**
 * "Este vínculo é meu?" — pela PESSOA, não pelo contrato corrente.
 *
 * Ler o próprio ponto não passa por chave nenhuma: é direito do trabalhador
 * (Portaria 671 art. 79), e o contrato anterior dele na mesma holding continua
 * sendo dele. Comparar só com `rh.vinculo_atual` fazia o sistema responder 403
 * para o dono do dado assim que ele mudava de empresa do grupo — inclusive para
 * o saldo de banco que o próprio sistema disse ter preservado para o acerto.
 * Para AGIR (bater ponto, ajustar marcação) o vínculo continua sendo o corrente:
 * esta função é só de leitura.
 */
async function ehVinculoProprio(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<boolean> {
  const meus = await repo.vinculosDoUsuario(sessao.usuario_id);
  return meus.includes(colaboradorId);
}

/**
 * Alcance de leitura: DP/diretoria (ponto.administrar) veem todo mundo; gestor
 * (ponto.ver.equipe) só quem está na relação vigente. O papel do login não dá
 * alcance sozinho — quem dá é rh.relacao_gestor. Devolve a chave que autorizou,
 * para quem chama levá-la à trilha.
 */
async function exigirAlcanceSobre(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<ChaveAlcancePonto> {
  if (await temPermissao(sessao.usuario_id, "ponto.administrar")) {
    return "ponto.administrar";
  }
  if (await temPermissao(sessao.usuario_id, "ponto.ver.equipe")) {
    const proprio = await repo.colaboradorDoUsuario(sessao.usuario_id);
    if (proprio) {
      const equipe = await repo.liderados(proprio.id);
      if (equipe.some((pessoa) => pessoa.id === colaboradorId)) {
        return "ponto.ver.equipe";
      }
    }
  }
  throw new ErroHttp(403, "Sem permissão para ver o ponto desta pessoa");
}

/**
 * Id que não existe é 404 — o que o espelho sempre devolveu e o resumo, o
 * extrato e o time respondiam com zeros, fingindo uma pessoa sem movimento.
 * O 404 vem ANTES de registrar a trilha: ler id fantasma não é leitura sensível
 * de ninguém, é ruído numa tabela que só serve para responder "quem leu o quê"
 * (a demo já tinha duas linhas assim). E vem DEPOIS do alcance: 403 antes de
 * 404, senão a dupla de respostas vira detector de quais ids existem para quem
 * não pode ler nenhum deles.
 *
 * Vale também para ESCREVER: o ajuste de marcação e o movimento de banco
 * chegavam ao INSERT e voltavam 500 pela chave estrangeira, e a apuração de uma
 * pessoa devolvia "apurados: 0" como se fosse sucesso. Nas três, id que não
 * existe é erro de quem pediu — 404 —, não falha do servidor nem sucesso vazio.
 */
async function exigirColaboradorExistente(
  colaboradorId: number
): Promise<void> {
  const colaborador = await repo.buscarColaboradorPonto(colaboradorId);
  if (!colaborador) throw new ErroHttp(404, "Colaborador não encontrado");
}

// ------------------------------------------------------------------ intercorrências

/**
 * Fila de intercorrências: pessoas nomeadas com a data, o tipo e a observação
 * em texto livre de quem tratou. É ponto de terceiro pelo mesmo critério do
 * espelho — o alcance decide o tamanho da fila e a trilha guarda o alcance
 * usado (empresa toda ou uma equipe).
 */
export async function listarIntercorrencias(
  sessao: PayloadSessao,
  filtros: {
    status?: StatusIntercorrencia | null;
    de?: string | null;
    ate?: string | null;
  }
): Promise<repo.FilaIntercorrencias> {
  if (await temPermissao(sessao.usuario_id, "ponto.administrar")) {
    const fila = await repo.listarIntercorrencias(filtros);
    if (fila.itens.length > 0) {
      await registrarLeituraDePonto(
        sessao,
        "ponto.administrar",
        "ponto.intercorrencias",
        "empresa"
      );
    }
    return fila;
  }
  const proprio = await repo.colaboradorDoUsuario(sessao.usuario_id);
  if (!proprio) {
    return {
      itens: [],
      total: 0,
      limite: repo.LIMITE_FILA_INTERCORRENCIAS,
      mais_antiga: null,
    };
  }
  const equipe = await repo.liderados(proprio.id);
  const fila = await repo.listarIntercorrencias({
    ...filtros,
    colaboradoresPermitidos: equipe.map((pessoa) => pessoa.id),
  });
  if (fila.itens.length > 0) {
    await registrarLeituraDePonto(
      sessao,
      "ponto.ver.equipe",
      "ponto.intercorrencias",
      `equipe:${proprio.id}`
    );
  }
  return fila;
}

/**
 * Conferência do FATO em UM dia: roda o MESMO motor da apuração sobre o dia da
 * intercorrência e devolve o que ele ainda enxerga ali, com a sequência de
 * marcações que sustenta a leitura. É o que separa "corrigida" (o fato sumiu
 * porque a marcação que faltava foi gravada) de "justificada" (o fato continua
 * e alguém responde por ele por escrito).
 *
 * A consulta pega véspera e dia seguinte porque o agrupamento precisa dos
 * vizinhos para amarrar o turno que vira a noite; só o dia pedido é apurado.
 * Devolve null quando não há escala vigente na data: sem jornada não existe
 * conferência, e afirmar correção no escuro é justamente o que esta função
 * existe para impedir.
 *
 * Devolve TAMBÉM as batidas do dia e o previsto — é o mesmo agrupamento, e é o
 * que o formulário de correção precisa para não oferecer campo fixo (ver
 * `diaParaAjuste`). O veredito não muda por causa disso: quem lê
 * `intercorrencias` continua lendo exatamente o que lia.
 */
async function conferirDia(
  colaboradorId: number,
  data: string
): Promise<{
  intercorrencias: IntercorrenciaDetectada[];
  sequencia: string;
  /** As batidas VÁLIDAS já amarradas a este dia (minuto ≥ 1440 veio da virada). */
  batidas: MarcacaoMotor[];
  jornada: repo.JornadaVersao;
  previsto_minutos: number;
} | null> {
  const escala = await repo.escalaVigenteNaData(colaboradorId, data);
  if (!escala) return null;
  const marcacoes = await repo.listarMarcacoesDoPeriodo(
    colaboradorId,
    somarDias(data, -1),
    somarDias(data, 1)
  );
  const doDia =
    agruparMarcacoesPorDia(
      repo.marcacoesValidas(marcacoes),
      escala.jornada
    ).get(data) ?? [];
  const feriado = (
    await repo.feriadosDoColaborador(colaboradorId, data, data)
  ).find((item) => item.tipo === "feriado");
  const { ano, mes } = competenciaDe(data);
  const resultado = apurarPonto({
    ano,
    mes,
    jornada: escala.jornada,
    // Fator NEUTRO de propósito: esta conferência só lê intercorrência, e
    // fator de banco de horas não cria nem apaga fato nenhum.
    regra: { id: null, fator_he_50: 1, fator_he_100: 1 },
    dias: [
      {
        data,
        dia_semana: diaDaSemana(data),
        feriado: feriado?.nome ?? null,
        dia_de_escala: diaDeEscala(escala, data),
        marcacoes: doDia,
      },
    ],
  });
  const sequencia = doDia
    .map(
      (marcacao) =>
        `${formatarRelogio(marcacao.minuto)}` +
        `${marcacao.minuto >= MINUTOS_DO_DIA ? " (dia seguinte)" : ""} ` +
        ROTULOS_TIPO_MARCACAO[marcacao.tipo].toLowerCase()
    )
    .join(", ");
  return {
    intercorrencias: resultado.intercorrencias,
    sequencia: sequencia || "nenhuma marcação válida no dia",
    batidas: doDia,
    jornada: escala.jornada,
    previsto_minutos: resultado.dias[0]?.previsto_minutos ?? 0,
  };
}

// ------------------------------------- o dia, do jeito que a correção precisa

/** Uma batida que o dia REALMENTE tem, já amarrada ao dia de apuração. */
export interface BatidaDoDia {
  id: number;
  /** Minutos desde a meia-noite do DIA DE APURAÇÃO; ≥1440 veio da virada. */
  minuto: number;
  /** Relógio HH:MM (já normalizado quando a batida veio da madrugada). */
  hora: string;
  /** Dia CIVIL da batida — é a data que o ajuste tem de gravar. */
  data_civil: string;
  /** A batida caiu no dia civil seguinte: turno que atravessa a meia-noite. */
  dia_seguinte: boolean;
}

/**
 * Um dos quatro registros do dia, com o que ele TEM e o que a jornada ESPERA.
 *
 * `batidas` vazio é a resposta honesta para "essa batida não existe" — e é ela
 * que faz o formulário de correção parar de exigir hora que não há. `esperado`
 * responde a outra pergunta, a que impede a lista fixa de quatro campos:
 * jornada de 6h não tem intervalo obrigatório (art. 71 caput) e dia de repouso
 * não espera batida nenhuma.
 */
export interface RegistroDoDia {
  tipo: TipoMarcacao;
  batidas: BatidaDoDia[];
  esperado: boolean;
}

export interface DiaParaAjuste {
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data: string;
  /** Dia civil seguinte, pré-calculado: o turno da noite grava nele. */
  data_seguinte: string;
  jornada: string | null;
  /** Sem escala vigente não há jornada — a tela avisa em vez de adivinhar. */
  tem_escala: boolean;
  previsto_minutos: number;
  /**
   * O turno DESTE dia pode fechar depois da meia-noite? Quando pode, a tela
   * pergunta em que dia civil a batida nova cai; quando não pode, não pergunta.
   */
  vira_a_noite: boolean;
  registros: RegistroDoDia[];
  /** O que o motor ainda enxerga no dia — a mesma leitura de `conferirDia`. */
  intercorrencias: IntercorrenciaDetectada[];
  sequencia: string;
}

/**
 * A jornada DAQUELE dia espera este registro?
 *
 * Dia sem previsto (repouso, feriado, dia fora do ciclo da escala) não espera
 * nada — o que for batido ali é extra, não é o cumprimento de uma jornada.
 * Entrada e saída são o par mínimo de qualquer dia trabalhado. O intervalo só
 * é obrigatório acima do limite da jornada (CLT art. 71 caput), que é
 * parâmetro dela e não número deste código.
 */
function esperaRegistro(
  tipo: TipoMarcacao,
  previstoMinutos: number,
  jornada: JornadaMotor
): boolean {
  if (previstoMinutos <= 0) return false;
  if (tipo === "entrada" || tipo === "saida") return true;
  return previstoMinutos > jornada.intervalo_obrigatorio_acima_minutos;
}

/**
 * Leitura de UM dia de UMA pessoa, do tamanho exato do formulário de correção:
 * quais das quatro batidas o dia tem (com id e hora), quais faltam, e quais a
 * jornada daquele dia sequer espera.
 *
 * POR QUE NÃO O ESPELHO: o espelho devolve as marcações do MÊS pelo dia civil
 * em que foram batidas. Quem entra 19h e sai 07h tem a saída no dia civil
 * SEGUINTE, e quem amarra as duas ao mesmo dia de apuração é
 * `agruparMarcacoesPorDia`, com a janela de arraste da jornada. Filtrar o
 * espelho por data no cliente perderia justamente a batida do plantão noturno —
 * e o espelho também não sabe dizer que uma jornada de 6h não tem intervalo.
 * Esta função usa o MESMO agrupamento da apuração, então o que a tela oferece é
 * o que o motor enxerga.
 *
 * Ler ponto de terceiro é leitura sensível como qualquer outra do módulo, e
 * grava a chave que DE FATO autorizou.
 */
export async function diaParaAjuste(
  sessao: PayloadSessao,
  colaboradorId: number,
  data: string
): Promise<DiaParaAjuste> {
  const chave = (await ehVinculoProprio(sessao, colaboradorId))
    ? null
    : await exigirAlcanceSobre(sessao, colaboradorId);
  const colaborador = await repo.buscarColaboradorPonto(colaboradorId);
  if (!colaborador) throw new ErroHttp(404, "Colaborador não encontrado");
  if (chave) {
    await registrarLeituraDePonto(
      sessao,
      chave,
      "ponto.dia",
      `${colaboradorId}:${data}`
    );
  }

  const conferencia = await conferirDia(colaboradorId, data);
  // Sem escala vigente não há jornada para amarrar a virada nem para dizer o
  // que o dia espera. O que ainda dá para afirmar é o que está gravado no dia
  // civil — e a tela diz que é só isso (`tem_escala: false`).
  const brutas = conferencia
    ? conferencia.batidas.map((marcacao) => ({
        id: marcacao.id,
        tipo: marcacao.tipo,
        minuto: marcacao.minuto,
      }))
    : repo
        .marcacoesValidas(
          await repo.listarMarcacoesDoPeriodo(colaboradorId, data, data)
        )
        .map((marcacao) => ({
          id: marcacao.id,
          tipo: marcacao.tipo,
          minuto: marcacao.minuto_local,
        }));

  const dataSeguinte = somarDias(data, 1);
  const registros: RegistroDoDia[] = TIPOS_MARCACAO.map((tipo) => ({
    tipo,
    batidas: brutas
      .filter((bruta) => bruta.tipo === tipo)
      .map((bruta) => ({
        id: bruta.id,
        minuto: bruta.minuto,
        hora: formatarRelogio(bruta.minuto),
        data_civil: bruta.minuto >= MINUTOS_DO_DIA ? dataSeguinte : data,
        dia_seguinte: bruta.minuto >= MINUTOS_DO_DIA,
      })),
    esperado: conferencia
      ? esperaRegistro(tipo, conferencia.previsto_minutos, conferencia.jornada)
      : false,
  }));

  // "Pode fechar depois da meia-noite" é da JORNADA, não do relógio: fim
  // contratual acima de 1440 (turno que já nasce virando), ou jornada sem
  // horário fixo com janela de arraste ligada (o 12x36 é exatamente isso).
  // Um dia que JÁ tem batida arrastada responde sozinho.
  const jornada = conferencia?.jornada ?? null;
  const viraANoite =
    brutas.some((bruta) => bruta.minuto >= MINUTOS_DO_DIA) ||
    (jornada !== null &&
      jornada.janela_arraste_minutos > 0 &&
      (jornada.horario_saida_minuto === null ||
        jornada.horario_saida_minuto > MINUTOS_DO_DIA));

  return {
    colaborador_id: colaborador.id,
    colaborador_nome: colaborador.nome_completo,
    matricula: colaborador.matricula,
    data,
    data_seguinte: dataSeguinte,
    jornada: jornada ? `${jornada.codigo} — ${jornada.nome}` : null,
    tem_escala: conferencia !== null,
    previsto_minutos: conferencia?.previsto_minutos ?? 0,
    vira_a_noite: viraANoite,
    registros,
    intercorrencias: conferencia?.intercorrencias ?? [],
    sequencia: conferencia?.sequencia ?? "sem escala vigente para conferir",
  };
}

export async function tratarIntercorrencia(
  sessao: PayloadSessao,
  id: number,
  dados: TratarIntercorrencia
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await repo.buscarIntercorrencia(cliente, id);
    if (!atual) throw new ErroHttp(404, "Intercorrência não encontrada");
    if (atual.status === "resolvida_por_reapuracao") {
      throw new ErroHttp(
        409,
        `Uma reapuração já constatou que este fato não existe mais em ` +
          `${atual.data} — a linha saiu da fila sozinha. Recarregue a tela.`
      );
    }
    if (atual.status !== "aberta") {
      throw new ErroHttp(409, "Essa intercorrência já foi tratada");
    }

    // 'corrigida' é AFIRMAÇÃO sobre o fato, não decisão sobre ele — e o sistema
    // sabe conferir o fato sozinho. Sem esta trava, um PATCH com {"status":
    // "corrigida"} e nada mais tirava o item da fila sem que uma única marcação
    // mudasse, e a linha tratada ainda bloqueava a redetecção da reapuração.
    // Corrigir de verdade continua sendo gravar a marcação (ajustarMarcacao);
    // aqui só se registra o desfecho depois que ela existe.
    let observacao = dados.observacao ?? null;
    if (dados.status === "corrigida") {
      const conferencia = await conferirDia(atual.colaborador_id, atual.data);
      if (!conferencia) {
        throw new ErroHttp(
          422,
          `Sem escala vigente em ${atual.data} não há como conferir a correção. ` +
            `Trate como justificada, explicando o caso.`
        );
      }
      const persistente = conferencia.intercorrencias.find(
        (item) => item.tipo === atual.tipo
      );
      if (persistente) {
        throw new ErroHttpCampo(
          422,
          `O fato continua: as marcações de ${atual.data} ainda produzem ` +
            `"${ROTULOS_TIPO_INTERCORRENCIA[atual.tipo]}" — ${persistente.detalhe}. ` +
            `Grave a marcação de ajuste antes de fechar como corrigida, ou trate ` +
            `como justificada, que assume o fato de pé.`,
          "status"
        );
      }
      // O desfecho 'corrigida' não pede texto do usuário (0027), então o que a
      // fiscalização lê é a conferência: o fato, não a palavra de quem fechou.
      const prova =
        `Conferido pelo motor em ${atual.data}: não há mais ` +
        `"${ROTULOS_TIPO_INTERCORRENCIA[atual.tipo]}" (marcações válidas do dia: ` +
        `${conferencia.sequencia}).`;
      observacao = observacao ? `${observacao} — ${prova}` : prova;
    }

    await repo.tratarIntercorrencia(
      cliente,
      id,
      dados.status,
      observacao,
      sessao.usuario_id
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ponto.intercorrencia.tratar",
      tabela: "rh.intercorrencia_ponto",
      registroId: String(id),
      diff: diff({
        colaborador: [null, atual.colaborador_nome],
        data: [null, atual.data],
        tipo: [null, ROTULOS_TIPO_INTERCORRENCIA[atual.tipo]],
        status: [atual.status, dados.status],
        observacao: [atual.observacao, observacao],
      }),
    });
  });
}

// ------------------------------------------------------------------ banco de horas

export async function saldoBanco(colaboradorId: number): Promise<number> {
  return repo.saldoBanco(colaboradorId);
}

/**
 * Extrato do banco de horas. Movimento a movimento com data, minutos, origem e
 * a observação em texto livre — superconjunto do resumo, que já grava trilha.
 * Extrato de terceiro é leitura sensível como qualquer outra do módulo.
 */
export async function listarMovimentosBanco(
  sessao: PayloadSessao,
  colaboradorId: number
) {
  if (!(await ehVinculoProprio(sessao, colaboradorId))) {
    const chave = await exigirAlcanceSobre(sessao, colaboradorId);
    await exigirColaboradorExistente(colaboradorId);
    await registrarLeituraDePonto(
      sessao,
      chave,
      "ponto.banco",
      String(colaboradorId)
    );
  }
  return repo.listarMovimentosBanco(colaboradorId);
}

/**
 * Lançamento manual no banco (compensação, expiração, ajuste, rescisão).
 * Append-only: para "desfazer", lança-se o contrário — nunca se apaga.
 * O limite da regra vigente é conferido ANTES de gravar, e o que ele barra é a
 * DIREÇÃO do movimento, não o estado final: só cai movimento que piore uma
 * violação do teto. Ver o comentário dentro da função.
 */
export async function lancarMovimentoBanco(
  sessao: PayloadSessao,
  dados: MovimentoBanco
): Promise<number> {
  // Mesma regra do ajuste de marcação: 404 antes de escrever. Id inexistente
  // chegava até o INSERT e voltava 500 pela chave estrangeira — e um saldo de
  // banco de horas resolvido para pessoa nenhuma não é erro de servidor.
  await exigirColaboradorExistente(dados.colaborador_id);
  const regra = await repo.resolverRegraBanco(dados.colaborador_id, dados.data);
  const saldoAtual = await repo.saldoBanco(dados.colaborador_id);
  const novoSaldo = saldoAtual + dados.minutos;
  if (regra) {
    // O limite barra quem AFASTA o saldo do teto, não quem o aproxima. Testar
    // só o estado final trancava o DP na armadilha: a apuração credita sem
    // conferir teto nenhum (é fato do mundo, não pedido de autorização), e quem
    // amanhecia estourado não conseguia mais lançar a compensação, a expiração
    // nem o acerto de rescisão que baixariam o saldo — cada um deles voltava 422
    // dizendo que o saldo "passaria" de um teto que já estava passado.
    if (
      novoSaldo > regra.limite_positivo_minutos &&
      novoSaldo > saldoAtual
    ) {
      throw new ErroHttpCampo(
        422,
        `Saldo passaria de ${formatarMinutos(novoSaldo)} e o limite positivo da regra ` +
          `(${regra.escopo}) é ${formatarMinutos(regra.limite_positivo_minutos)}` +
          (saldoAtual > regra.limite_positivo_minutos
            ? ` — o saldo atual (${formatarMinutos(saldoAtual)}) já está acima do ` +
              `limite, então só passa movimento que o reduza`
            : ""),
        "minutos"
      );
    }
    if (
      novoSaldo < -regra.limite_negativo_minutos &&
      novoSaldo < saldoAtual
    ) {
      throw new ErroHttpCampo(
        422,
        `Saldo passaria de ${formatarMinutos(novoSaldo)} e o limite negativo da regra ` +
          `(${regra.escopo}) é ${formatarMinutos(-regra.limite_negativo_minutos)}` +
          (saldoAtual < -regra.limite_negativo_minutos
            ? ` — o saldo atual (${formatarMinutos(saldoAtual)}) já está abaixo do ` +
              `limite, então só passa movimento que o eleve`
            : ""),
        "minutos"
      );
    }
  }
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const id = await repo.inserirMovimentoBanco(cliente, {
      colaborador_id: dados.colaborador_id,
      data: dados.data,
      minutos: dados.minutos,
      origem: dados.origem,
      apuracao_id: null,
      observacao: dados.observacao,
      registrado_por: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ponto.banco.movimento",
      tabela: "rh.banco_horas_movimento",
      registroId: String(id),
      diff: diff({
        colaborador_id: [null, dados.colaborador_id],
        data: [null, dados.data],
        minutos: [formatarMinutos(saldoAtual), formatarMinutos(novoSaldo)],
        origem: [null, dados.origem],
        observacao: [null, dados.observacao],
      }),
    });
    return id;
  });
}

// ------------------------------------------------------- prazo e expiração do saldo
//
// POR QUE ESTE BLOCO EXISTE
// `prazo_compensacao_dias` e `expira_saldo` eram cadastrados na tela de
// Parâmetros, mostrados na tabela de regras e NUNCA lidos: todas as ocorrências
// no fonte eram declaração de tipo, coluna de SELECT ou parâmetro de INSERT.
// O DP marcava "saldo expira no fim do prazo", punha prazo de 1 dia, e o saldo
// continuava integral — hoje e sempre. Parâmetro que o sistema não cumpre é
// pior que parâmetro ausente: ele faz o usuário acreditar numa política que não
// existe.
//
// COMO A CONTA É FEITA — FIFO, e por quê
// O crédito mais antigo é o primeiro a ser compensado (é assim que o
// trabalhador entende o próprio saldo, e é o que preserva mais hora dele: gastar
// primeiro o que vence primeiro). O livro é percorrido em ordem de entrada;
// cada débito (folga, atraso, ajuste) consome os créditos mais antigos ainda de
// pé. O que sobrar de pé e já tiver passado do prazo da regra VIGENTE NA DATA DO
// CRÉDITO — porque prazo é cláusula do acordo em vigor quando a hora foi
// guardada — está vencido.
//
// IDEMPOTÊNCIA POR CONSTRUÇÃO: a expiração grava um DÉBITO, e débito consome os
// créditos mais antigos — exatamente os que acabaram de vencer. Rodar duas vezes
// no mesmo dia não expira nada na segunda.

export interface CreditoEmAberto {
  data: string;
  minutos: number;
  /** Null quando a regra daquela data não faz o saldo expirar. */
  vence_em: string | null;
  vencido: boolean;
}

/**
 * Consome o livro em ordem e devolve os créditos que sobraram de pé — puro,
 * sem IO, para a conta poder ser lida de cima a baixo.
 */
function creditosDePe(
  movimentos: { data: string; minutos: number }[]
): { data: string; minutos: number }[] {
  const fila: { data: string; minutos: number }[] = [];
  for (const movimento of movimentos) {
    if (movimento.minutos > 0) {
      fila.push({ data: movimento.data, minutos: movimento.minutos });
      continue;
    }
    // Débito consome do começo da fila (o crédito mais antigo primeiro).
    let devendo = -movimento.minutos;
    while (devendo > 0 && fila.length > 0) {
      const primeiro = fila[0];
      const usado = Math.min(primeiro.minutos, devendo);
      primeiro.minutos -= usado;
      devendo -= usado;
      if (primeiro.minutos === 0) fila.shift();
    }
    // Sobrou débito sem crédito para consumir: o saldo está negativo e não há
    // nada a expirar. Segue o livro; um crédito futuro cobre isso.
  }
  return fila;
}

export interface ExpiracaoPessoa {
  colaborador_id: number;
  nome: string;
  matricula: string;
  saldo_minutos: number;
  minutos_vencidos: number;
  creditos_vencidos: { data: string; minutos: number; vence_em: string }[];
  proximo_vencimento: { data: string; minutos: number } | null;
}

export interface ResultadoExpiracao {
  data_referencia: string;
  pessoas: ExpiracaoPessoa[];
  total_minutos: number;
  /** Quantos movimentos de expiração foram GRAVADOS (0 na prévia). */
  movimentos: number;
}

/**
 * TRÊS CONSULTAS para a base inteira, não três por pessoa: quem tem saldo, o
 * livro de todos eles e a regra de cada (pessoa, data de crédito) em lote. A
 * primeira versão resolvia a regra chamada a chamada e a prévia da tela levava
 * 40 segundos com 61 pessoas.
 */
async function levantarExpiracao(
  cliente: PoolClient | null,
  referencia: string
): Promise<ExpiracaoPessoa[]> {
  const candidatos = await repo.colaboradoresComSaldoPositivo();
  if (candidatos.length === 0) return [];
  const livros = await repo.movimentosBancoEmOrdem(
    cliente,
    candidatos.map((pessoa) => pessoa.id)
  );
  const dePe = new Map(
    candidatos.map((pessoa) => [
      pessoa.id,
      creditosDePe(livros.get(pessoa.id) ?? []),
    ])
  );
  const regras = await repo.resolverRegrasBancoEmLote(
    candidatos.flatMap((pessoa) =>
      (dePe.get(pessoa.id) ?? []).map((credito) => ({
        colaborador_id: pessoa.id,
        data: credito.data,
      }))
    )
  );

  const pessoas: ExpiracaoPessoa[] = [];
  for (const pessoa of candidatos) {
    const creditos: CreditoEmAberto[] = (dePe.get(pessoa.id) ?? []).map(
      (credito) => {
        const regra = regras.get(`${pessoa.id}:${credito.data}`);
        // Prazo é cláusula do acordo em vigor QUANDO A HORA FOI GUARDADA.
        const vence = regra?.expira_saldo
          ? somarDias(credito.data, regra.prazo_compensacao_dias)
          : null;
        return {
          data: credito.data,
          minutos: credito.minutos,
          vence_em: vence,
          vencido: vence !== null && vence < referencia,
        };
      }
    );
    const vencidos = creditos.filter((credito) => credito.vencido);
    const aVencer = creditos.filter(
      (credito) => !credito.vencido && credito.vence_em !== null
    );
    const total = vencidos.reduce((soma, item) => soma + item.minutos, 0);
    if (total === 0 && aVencer.length === 0) continue;
    pessoas.push({
      colaborador_id: pessoa.id,
      nome: pessoa.nome_completo,
      matricula: pessoa.matricula,
      saldo_minutos: pessoa.saldo,
      minutos_vencidos: total,
      creditos_vencidos: vencidos.map((item) => ({
        data: item.data,
        minutos: item.minutos,
        vence_em: item.vence_em!,
      })),
      proximo_vencimento: aVencer[0]
        ? { data: aVencer[0].vence_em!, minutos: aVencer[0].minutos }
        : null,
    });
  }
  return pessoas;
}

/**
 * PRÉVIA da expiração — não grava nada. É o que a tela mostra antes de o DP
 * mandar executar: quem tem hora vencida, quanto, de que crédito, e qual é o
 * próximo vencimento de cada um.
 */
export async function previaExpiracaoBanco(
  dataReferencia?: string
): Promise<ResultadoExpiracao> {
  const referencia = dataReferencia ?? hojeLocal();
  const pessoas = await levantarExpiracao(null, referencia);
  return {
    data_referencia: referencia,
    pessoas,
    total_minutos: pessoas.reduce(
      (soma, pessoa) => soma + pessoa.minutos_vencidos,
      0
    ),
    movimentos: 0,
  };
}

/**
 * EXECUTA a expiração: um movimento de origem 'expiracao' por pessoa, com a
 * lista dos créditos vencidos na observação. Ato do DP, auditado, e reversível
 * do único jeito que um livro append-only permite — lançando o contrário.
 */
export async function expirarSaldosBanco(
  sessao: PayloadSessao,
  dataReferencia?: string
): Promise<ResultadoExpiracao> {
  const referencia = dataReferencia ?? hojeLocal();
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const pessoas = await levantarExpiracao(cliente, referencia);
    let movimentos = 0;
    for (const pessoa of pessoas) {
      if (pessoa.minutos_vencidos === 0) continue;
      const detalhe = pessoa.creditos_vencidos
        .map(
          (credito) =>
            `${formatarMinutos(credito.minutos)} de ${credito.data} (venceu em ${credito.vence_em})`
        )
        .join("; ");
      const id = await repo.inserirMovimentoBanco(cliente, {
        colaborador_id: pessoa.colaborador_id,
        data: referencia,
        minutos: -pessoa.minutos_vencidos,
        origem: "expiracao",
        apuracao_id: null,
        observacao:
          `Expiração do prazo de compensação da regra vigente — ${detalhe}`.slice(
            0,
            500
          ),
        registrado_por: sessao.usuario_id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "ponto.banco.expiracao",
        tabela: "rh.banco_horas_movimento",
        registroId: String(id),
        diff: diff({
          colaborador: [null, pessoa.nome],
          data_referencia: [null, referencia],
          saldo: [
            formatarMinutos(pessoa.saldo_minutos),
            formatarMinutos(pessoa.saldo_minutos - pessoa.minutos_vencidos),
          ],
          creditos_vencidos: [null, detalhe],
        }),
      });
      movimentos += 1;
    }
    return {
      data_referencia: referencia,
      pessoas,
      total_minutos: pessoas.reduce(
        (soma, pessoa) => soma + pessoa.minutos_vencidos,
        0
      ),
      movimentos,
    };
  });
}

/**
 * ACERTO DO BANCO NA RESCISÃO — o que `tratamento_rescisao` decide.
 *
 * Chamado pelo encerramento do processo de desligamento, na MESMA transação que
 * marca o contrato como encerrado: banco de horas não sobrevive ao contrato, e
 * deixar o saldo de pé depois do desligamento era o terceiro parâmetro morto da
 * tela de Parâmetros.
 *
 *   • 'perde'    — o saldo é zerado por movimento de origem 'rescisao', nas duas
 *                  direções. Positivo perdido é o que a regra manda; NEGATIVO
 *                  também é zerado, porque cobrar horas de quem já foi desligado
 *                  não é decisão que um sistema toma sozinho.
 *   • 'paga' e 'compensa' — NADA é lançado automaticamente. O saldo fica de pé,
 *                  visível e íntegro, porque o destino dele (verba rescisória ou
 *                  desconto no aviso) é ato de gente, com número conferido no
 *                  acerto. O que o sistema faz é DIZER isso na trilha, com o
 *                  número exato, em vez de deixar o saldo mudo.
 *
 * Devolve o que aconteceu para o desligamento registrar na própria auditoria.
 */
export interface AcertoBancoRescisao {
  saldo_minutos: number;
  tratamento: string;
  movimento_id: number | null;
  resumo: string;
}

export async function liquidarBancoNaRescisao(
  cliente: PoolClient,
  usuarioId: number,
  colaboradorId: number,
  dataTermino: string
): Promise<AcertoBancoRescisao> {
  const saldo = await repo.saldoBanco(colaboradorId);
  const regra = await repo.resolverRegraBanco(colaboradorId, dataTermino);
  if (!regra) {
    return {
      saldo_minutos: saldo,
      tratamento: "sem regra vigente",
      movimento_id: null,
      resumo:
        `saldo de ${formatarMinutos(saldo)} sem regra de banco de horas vigente ` +
        `na data do término — trate no acerto`,
    };
  }
  const rotulo = ROTULOS_TRATAMENTO_RESCISAO[regra.tratamento_rescisao];
  if (saldo === 0) {
    return {
      saldo_minutos: 0,
      tratamento: rotulo,
      movimento_id: null,
      resumo: "banco de horas zerado no desligamento — nada a acertar",
    };
  }
  if (regra.tratamento_rescisao !== "perde") {
    return {
      saldo_minutos: saldo,
      tratamento: rotulo,
      movimento_id: null,
      resumo:
        `saldo de ${formatarMinutos(saldo)} preservado para o acerto — a regra ` +
        `${regra.escopo} manda "${rotulo.toLowerCase()}", e isso é lançamento de ` +
        `gente (verba rescisória ou desconto), não automático`,
    };
  }
  const id = await repo.inserirMovimentoBanco(cliente, {
    colaborador_id: colaboradorId,
    data: dataTermino,
    minutos: -saldo,
    origem: "rescisao",
    apuracao_id: null,
    observacao:
      `Desligamento em ${dataTermino}: saldo de ${formatarMinutos(saldo)} zerado ` +
      `pela regra ${regra.escopo} (tratamento na rescisão: ${rotulo.toLowerCase()})`,
    registrado_por: usuarioId,
  });
  return {
    saldo_minutos: saldo,
    tratamento: rotulo,
    movimento_id: id,
    resumo: `saldo de ${formatarMinutos(saldo)} zerado no desligamento pela regra ${regra.escopo}`,
  };
}

// ================================================================ EXPORTADO PARA OUTROS MÓDULOS
// Contrato estável do domínio de ponto para portal do colaborador, portal do
// gestor, ficha e Central de Metas. Quem chama NÃO precisa saber de marcação,
// jornada nem memória de cálculo — só destes números.

export interface ResumoPontoColaborador {
  colaborador_id: number;
  saldo_banco_minutos: number;
  media_he_por_dia_util_minutos_ultimo_mes: number;
  total_he_ultimo_mes_minutos: number;
  ultima_apuracao: {
    ano: number;
    mes: number;
    competencia: string;
    calculada_em: string;
  } | null;
  intercorrencias_abertas: number;
}

export async function resumoPontoDoColaborador(
  colaboradorId: number
): Promise<ResumoPontoColaborador> {
  const [saldo, ultimas, abertas] = await Promise.all([
    repo.saldoBanco(colaboradorId),
    repo.ultimasApuracoes([colaboradorId]),
    repo.contarIntercorrenciasAbertas([colaboradorId]),
  ]);
  const ultima = ultimas.get(colaboradorId) ?? null;
  return {
    colaborador_id: colaboradorId,
    saldo_banco_minutos: saldo,
    total_he_ultimo_mes_minutos: ultima?.total_he_minutos ?? 0,
    media_he_por_dia_util_minutos_ultimo_mes:
      ultima && ultima.dias_uteis > 0
        ? Math.round(ultima.total_he_minutos / ultima.dias_uteis)
        : 0,
    ultima_apuracao: ultima
      ? {
          ano: ultima.ano,
          mes: ultima.mes,
          competencia: formatarCompetencia(ultima.ano, ultima.mes),
          calculada_em: ultima.calculada_em,
        }
      : null,
    intercorrencias_abertas: abertas.get(colaboradorId) ?? 0,
  };
}

export interface LinhaResumoEquipe extends ResumoPontoColaborador {
  nome: string;
  matricula: string;
  limite_positivo_minutos: number | null;
  acima_do_limite: boolean;
}

export interface ResumoPontoEquipe {
  gestor_colaborador_id: number;
  liderados: LinhaResumoEquipe[];
  saldo_total_minutos: number;
  acima_do_limite: number;
  intercorrencias_abertas: number;
}

/**
 * Visão do portal do gestor: banco de horas do time e QUEM ESTÁ ESTOURANDO
 * hora extra — o limite vem da regra resolvida nos três níveis para cada
 * pessoa, não de um número fixo na tela.
 */
export async function resumoPontoDaEquipe(
  gestorColaboradorId: number
): Promise<ResumoPontoEquipe> {
  const equipe = await repo.liderados(gestorColaboradorId);
  const ids = equipe.map((pessoa) => pessoa.id);
  const [saldos, ultimas, abertas] = await Promise.all([
    repo.saldosBanco(ids),
    repo.ultimasApuracoes(ids),
    repo.contarIntercorrenciasAbertas(ids),
  ]);
  const hoje = hojeLocal();

  const linhas: LinhaResumoEquipe[] = [];
  for (const pessoa of equipe) {
    const saldo = saldos.get(pessoa.id) ?? 0;
    const ultima = ultimas.get(pessoa.id) ?? null;
    const regra = await repo.resolverRegraBanco(pessoa.id, hoje);
    linhas.push({
      colaborador_id: pessoa.id,
      nome: pessoa.nome_completo,
      matricula: pessoa.matricula,
      saldo_banco_minutos: saldo,
      total_he_ultimo_mes_minutos: ultima?.total_he_minutos ?? 0,
      media_he_por_dia_util_minutos_ultimo_mes:
        ultima && ultima.dias_uteis > 0
          ? Math.round(ultima.total_he_minutos / ultima.dias_uteis)
          : 0,
      ultima_apuracao: ultima
        ? {
            ano: ultima.ano,
            mes: ultima.mes,
            competencia: formatarCompetencia(ultima.ano, ultima.mes),
            calculada_em: ultima.calculada_em,
          }
        : null,
      intercorrencias_abertas: abertas.get(pessoa.id) ?? 0,
      limite_positivo_minutos: regra?.limite_positivo_minutos ?? null,
      acima_do_limite: regra ? saldo > regra.limite_positivo_minutos : false,
    });
  }

  return {
    gestor_colaborador_id: gestorColaboradorId,
    liderados: linhas,
    saldo_total_minutos: linhas.reduce(
      (total, linha) => total + linha.saldo_banco_minutos,
      0
    ),
    acima_do_limite: linhas.filter((linha) => linha.acima_do_limite).length,
    intercorrencias_abertas: linhas.reduce(
      (total, linha) => total + linha.intercorrencias_abertas,
      0
    ),
  };
}

/** Competência anterior à de hoje — o "último mês" que a diretoria cita. */
export function ultimaCompetenciaFechada(): { ano: number; mes: number } {
  const { ano, mes } = competenciaDe(hojeLocal());
  return competenciaAnterior(ano, mes);
}

/** Reexportado para as telas não precisarem importar o motor. */
export { MINUTOS_DO_DIA };

// ================================================================ etapa 2: leituras das telas e indicadores

export async function listarCompetenciasApuradas() {
  return repo.listarCompetenciasApuradas();
}

/**
 * Tabela da competência do DP: a empresa inteira nominada, com jornada, hora
 * extra, faltas e atrasos de cada um. É a leitura de ponto mais larga do
 * sistema — grava uma linha por abertura, tendo a competência como registro
 * (não uma linha por pessoa, que só encheria a trilha de ruído).
 */
export async function listarApuracoesComNome(
  sessao: PayloadSessao,
  ano: number,
  mes: number
) {
  const apuracoes = await repo.listarApuracoesComNome(ano, mes);
  if (apuracoes.length > 0) {
    await registrarLeituraDePonto(
      sessao,
      "ponto.administrar",
      "ponto.apuracoes",
      formatarCompetencia(ano, mes)
    );
  }
  return apuracoes;
}

export async function listarColaboradoresAtivos() {
  return repo.listarColaboradoresAtivos();
}

/** Catálogo que os formulários de parâmetro precisam (escopos da regra). */
export async function opcoesDeEscopo() {
  const [cargos, estabelecimentos] = await Promise.all([
    repo.listarCargosParaRegra(),
    repo.listarEstabelecimentosParaRegra(),
  ]);
  return { cargos, estabelecimentos };
}

/**
 * Resumo de ponto de UMA pessoa com o alcance conferido — é o que a ficha do
 * colaborador consome. O próprio sempre pode; terceiro passa pela mesma regra
 * do espelho (DP vê todos, gestor só os liderados) e a leitura fica na trilha.
 */
export async function resumoPontoComAlcance(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<ResumoPontoColaborador> {
  if (!(await ehVinculoProprio(sessao, colaboradorId))) {
    const chave = await exigirAlcanceSobre(sessao, colaboradorId);
    await exigirColaboradorExistente(colaboradorId);
    await registrarLeituraDePonto(
      sessao,
      chave,
      "ponto.resumo",
      String(colaboradorId)
    );
  }
  return resumoPontoDoColaborador(colaboradorId);
}

/** Colaborador da sessão (ou null se o usuário não é pessoa do quadro). */
export async function colaboradorDaSessao(sessao: PayloadSessao) {
  return repo.colaboradorDoUsuario(sessao.usuario_id);
}

/**
 * Gestor: só o próprio time, a menos que tenha a chave de administrar o ponto.
 * Devolve a chave que autorizou — o próprio time entra por `ponto.ver.equipe`,
 * o time alheio por `ponto.administrar`.
 */
export async function exigirAlcanceDeGestor(
  sessao: PayloadSessao,
  gestorColaboradorId: number
): Promise<ChaveAlcancePonto> {
  const proprio = await repo.colaboradorDoUsuario(sessao.usuario_id);
  if (proprio?.id === gestorColaboradorId) return "ponto.ver.equipe";
  if (await temPermissao(sessao.usuario_id, "ponto.administrar")) {
    return "ponto.administrar";
  }
  throw new ErroHttp(403, "Sem permissão para ver o ponto desta equipe");
}

/**
 * Resumo do time com o alcance conferido — é o que o portal do gestor consome.
 * Ler o time é ler o ponto de dez terceiros de uma vez (nome, matrícula, saldo
 * de banco e hora extra de cada um): grava a MESMA trilha do resumo individual,
 * senão o caminho largo sairia mais barato que o estreito. Uma linha por
 * leitura, com o gestor lido no registro — como o painel da folha faz com a
 * competência.
 */
export async function resumoPontoDaEquipeComAlcance(
  sessao: PayloadSessao,
  gestorColaboradorId: number
): Promise<ResumoPontoEquipe> {
  const chave = await exigirAlcanceDeGestor(sessao, gestorColaboradorId);
  // Gestor que não existe é 404, não um time vazio: equipe vazia é resposta
  // legítima de quem existe e ainda não tem liderado.
  await exigirColaboradorExistente(gestorColaboradorId);
  const resumo = await resumoPontoDaEquipe(gestorColaboradorId);
  if (resumo.liderados.length > 0) {
    await registrarLeituraDePonto(
      sessao,
      chave,
      "ponto.resumo.equipe",
      String(gestorColaboradorId)
    );
  }
  return resumo;
}

// ---------------------------------------------------------------- Central de Metas
// Só agregados. Nenhuma das duas funções abaixo devolve pessoa identificada.

/**
 * Indicador `horas_extras`: HE ÷ horas trabalhadas nas apurações dos últimos
 * 12 meses, em %. Sem apuração no período o valor é null ("sem dados") — nunca
 * zero, que mentiria dizendo "nenhuma hora extra".
 */
export async function valorIndicadorHorasExtras(): Promise<number | null> {
  const { he_minutos, trabalhado_minutos } =
    await repo.agregadoHorasExtras12Meses();
  if (trabalhado_minutos === 0) return null;
  return Math.round((he_minutos / trabalhado_minutos) * 1000) / 10;
}

/**
 * Indicador `saldo_banco_horas`: passivo acumulado do banco de horas dos
 * colaboradores ativos, em HORAS (a unidade do catálogo é 'qtd'). Minuto é a
 * verdade interna; a conversão para hora acontece só aqui, na borda.
 */
export async function valorIndicadorSaldoBancoHoras(): Promise<number | null> {
  const { saldo_minutos, pessoas_com_saldo } =
    await repo.saldoTotalBancoHorasAtivos();
  if (pessoas_com_saldo === 0) return null;
  return Math.round((saldo_minutos / 60) * 10) / 10;
}

/** Detalhe legível do indicador de saldo (quantas pessoas compõem o número). */
export async function detalheIndicadorSaldoBancoHoras(): Promise<string> {
  const { saldo_minutos, pessoas_com_saldo } =
    await repo.saldoTotalBancoHorasAtivos();
  if (pessoas_com_saldo === 0) return "nenhum movimento de banco de horas";
  return (
    `${formatarMinutos(saldo_minutos)} somados em ${pessoas_com_saldo} ` +
    `colaborador(es) ativo(s) com saldo diferente de zero`
  );
}
