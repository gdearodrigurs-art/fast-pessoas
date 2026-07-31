import { PoolClient } from "pg";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp, lerSessao } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { notificar } from "../notificacoes/servico";
import { calcularResultado, EstruturaCongelada } from "./calculo";
import {
  Decisao,
  decisaoDiverge,
  EntradaDecisao,
  EstruturaModeloEntrada,
  ROTULOS_DECISAO,
  ROTULOS_RECOMENDACAO,
  ROTULOS_STATUS_CICLO,
  ROTULOS_TIPO_CICLO,
  Recomendacao,
  SalvarRespostas,
  validarAtivacao,
} from "./esquemas";
import {
  abrirLoteDesempenho,
  ativarModelo,
  atualizarStatusCiclo,
  buscarCicloDetalhe,
  buscarCicloParaMutacao,
  buscarDecisao,
  buscarEstrutura,
  buscarModeloAtivo,
  buscarModeloParaMutacao,
  buscarResultado,
  buscarResultadoComCliente,
  CicloCriado,
  CicloDetalhe,
  CicloParaMutacao,
  CicloResumo,
  criarModeloRascunho,
  DecisaoGravada,
  existeRascunho,
  garantirAvaliacao,
  gerarCiclosExperiencia,
  inserirDecisao,
  inserirResultado,
  listarAtivosSemGestor,
  listarCiclos,
  listarCiclosDoAvaliador,
  listarModelos,
  listarPendenciasSemGestor,
  listarRespostas,
  listarRespostasComCliente,
  marcarEnviada,
  ModeloResumo,
  PendenciaSemGestor,
  registrarLeituraSensivel,
  RespostaGravada,
  salvarRespostas,
  substituirEstrutura,
} from "./repositorio";

const TABELA_MODELO = "rh.modelo_avaliacao_versao";
const TABELA_CICLO = "rh.ciclo_avaliacao";
const TABELA_AVALIACAO = "rh.avaliacao";
const TABELA_RESULTADO = "rh.resultado_avaliacao";
const TABELA_DECISAO = "rh.decisao_avaliacao";

const CHAVE_RESULTADO_VER = "avaliacao.resultado.ver";

// ------------------------------------------------------------------ permissões

export interface PermissoesAvaliacao {
  responder: boolean;
  configurar: boolean;
  decidir: boolean;
  resultado_ver: boolean;
}

async function carregarPermissoes(
  usuarioId: number
): Promise<PermissoesAvaliacao> {
  const linhas = await consultar<{
    responder: boolean;
    configurar: boolean;
    decidir: boolean;
    resultado_ver: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'avaliacao.responder')     AS responder,
            sistema.tem_permissao($1, 'avaliacao.configurar')    AS configurar,
            sistema.tem_permissao($1, 'avaliacao.decidir')       AS decidir,
            sistema.tem_permissao($1, 'avaliacao.resultado.ver') AS resultado_ver`,
    [usuarioId]
  );
  return linhas[0];
}

function algumaPermissao(pode: PermissoesAvaliacao): boolean {
  return pode.responder || pode.configurar || pode.decidir || pode.resultado_ver;
}

/**
 * Guarda das rotas do módulo cujo acesso vale para MAIS de uma chave
 * (painel e detalhe): sessão válida + ao menos uma chave de avaliação.
 * Mesmo contrato do exigirPermissao de src/lib/sessao.ts.
 */
export async function exigirSessaoDoModulo(): Promise<{
  sessao: PayloadSessao;
  pode: PermissoesAvaliacao;
}> {
  const sessao = await lerSessao();
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  if (sessao.pendente_2fa) {
    throw new ErroHttp(
      403,
      "Configure a autenticação em duas etapas para continuar"
    );
  }
  const pode = await carregarPermissoes(sessao.usuario_id);
  if (!algumaPermissao(pode)) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return { sessao, pode };
}

// ------------------------------------------------------------------ utilitários

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Instante do banco (UTC) exibido em America/Sao_Paulo — regra do projeto. */
function formatarDataHora(instante: string | Date): string {
  return new Date(instante).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

async function auditarCicloCriado(
  cliente: PoolClient,
  sessao: PayloadSessao,
  criado: CicloCriado,
  modeloVersao: number,
  origem: string
): Promise<void> {
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "criacao",
    tabela: TABELA_CICLO,
    registroId: String(criado.id),
    diff: {
      Colaborador: {
        de: null,
        para: `${criado.colaborador_nome} (matrícula ${criado.matricula})`,
      },
      Tipo: { de: null, para: ROTULOS_TIPO_CICLO[criado.tipo] },
      Avaliador: { de: null, para: criado.avaliador_nome },
      Prazo: { de: null, para: formatarData(criado.prazo) },
      Modelo: { de: null, para: `v${modeloVersao} (congelado no ciclo)` },
      Origem: { de: null, para: origem },
    },
  });
}

/**
 * Aviso neutro ao avaliador na abertura do ciclo (lazy 45/90 ou lote de
 * desempenho) — sem nota/resultado; o conteúdo mora na página do ciclo.
 * Sem aviso quando o gestor não tem conta ou quando ele mesmo disparou a
 * geração ao abrir o painel.
 */
async function notificarAvaliador(
  cliente: PoolClient,
  sessao: PayloadSessao,
  criado: CicloCriado
): Promise<void> {
  if (
    criado.avaliador_usuario_id === null ||
    criado.avaliador_usuario_id === sessao.usuario_id
  ) {
    return;
  }
  await notificar(cliente, {
    usuarioId: criado.avaliador_usuario_id,
    tipo: "avaliacao.ciclo_aberto",
    titulo: "Nova avaliação para responder",
    corpo: `Ciclo "${ROTULOS_TIPO_CICLO[criado.tipo]}" de ${criado.colaborador_nome} aberto — prazo ${formatarData(criado.prazo)}.`,
    link: `/avaliacoes/${criado.id}`,
  });
}

// ------------------------------------------------------------------ painel

export interface PainelAvaliacoes {
  pode: PermissoesAvaliacao;
  modelo_ativo: { versao: number; nome: string } | null;
  /** Ciclos de experiência abertos automaticamente NESTA chamada. */
  ciclos_gerados_agora: number;
  /** Ciclos em que o usuário é o avaliador (null sem avaliacao.responder). */
  minhas: CicloResumo[] | null;
  /** Todos os ciclos (null sem configurar/decidir). */
  ciclos: CicloResumo[] | null;
  /** Marcos de experiência sem gestor vigente (null sem configurar). */
  pendencias_sem_gestor: PendenciaSemGestor[] | null;
}

/**
 * Painel do módulo. Antes de listar, gera LAZY os ciclos de experiência
 * devidos a partir de rh.processo_admissao (marcos 45/90) com o modelo
 * ATIVO congelado — sem modelo ativo nada é gerado (aviso na tela).
 */
export async function montarPainel(
  sessao: PayloadSessao,
  pode: PermissoesAvaliacao
): Promise<PainelAvaliacoes> {
  const modeloAtivo = await buscarModeloAtivo();
  let geradosAgora = 0;
  if (modeloAtivo) {
    geradosAgora = await gerarExperienciaLazy(sessao, modeloAtivo);
  }
  const [minhas, ciclos, pendencias] = await Promise.all([
    pode.responder ? listarCiclosDoAvaliador(sessao.usuario_id) : null,
    pode.configurar || pode.decidir ? listarCiclos() : null,
    pode.configurar ? listarPendenciasSemGestor() : null,
  ]);
  return {
    pode,
    modelo_ativo: modeloAtivo
      ? { versao: modeloAtivo.versao, nome: modeloAtivo.nome }
      : null,
    ciclos_gerados_agora: geradosAgora,
    minhas,
    ciclos,
    pendencias_sem_gestor: pendencias,
  };
}

async function gerarExperienciaLazy(
  sessao: PayloadSessao,
  modeloAtivo: ModeloResumo
): Promise<number> {
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const criados = await gerarCiclosExperiencia(cliente, modeloAtivo.id);
      for (const criado of criados) {
        await auditarCicloCriado(
          cliente,
          sessao,
          criado,
          modeloAtivo.versao,
          "Geração automática (marcos 45/90 do contrato de experiência)"
        );
        await notificarAvaliador(cliente, sessao, criado);
      }
      return criados.length;
    });
  } catch (erro) {
    // Corrida entre duas sessões abrindo o painel: a outra já gerou.
    if (violacaoUnica(erro)) {
      return 0;
    }
    throw erro;
  }
}

// ------------------------------------------------------------------ lote de desempenho

export interface ResultadoLote {
  abertos: number;
  sem_gestor: { colaborador_nome: string; matricula: string }[];
}

/** Abre ciclo de desempenho para TODO colaborador ativo com gestor vigente. */
export async function abrirLote(
  sessao: PayloadSessao,
  prazo: string
): Promise<ResultadoLote> {
  if (prazo < hojeSaoPaulo()) {
    throw new ErroHttpCampo(400, "O prazo não pode estar no passado.", "prazo");
  }
  const modeloAtivo = await buscarModeloAtivo();
  if (!modeloAtivo) {
    throw new ErroHttp(
      409,
      "Não há versão ativa do modelo de avaliação. Ative um modelo antes de abrir ciclos."
    );
  }
  const criados = await comTransacao(sessao.usuario_id, async (cliente) => {
    const lista = await abrirLoteDesempenho(cliente, modeloAtivo.id, prazo);
    for (const criado of lista) {
      await auditarCicloCriado(
        cliente,
        sessao,
        criado,
        modeloAtivo.versao,
        `Abertura em lote (prazo ${formatarData(prazo)})`
      );
      await notificarAvaliador(cliente, sessao, criado);
    }
    return lista;
  });
  return {
    abertos: criados.length,
    sem_gestor: await listarAtivosSemGestor(),
  };
}

// ------------------------------------------------------------------ detalhe do ciclo

export interface ResultadoPayload {
  percentual: number;
  faixa_rotulo: string;
  faixa_minimo: number;
  faixa_maximo: number;
  recomendacao: Recomendacao;
  memoria_calculo: Record<string, unknown>;
  em: string;
}

export interface CicloPayload {
  id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_nome: string;
  tipo: CicloDetalhe["tipo"];
  status: CicloDetalhe["status"];
  origem: CicloDetalhe["origem"];
  prazo: string;
  dias_para_prazo: number;
  modelo_versao: number;
  modelo_nome: string;
  avaliacao_estado: "rascunho" | "enviada" | null;
  enviado_em: string | null;
  criado_em: string;
}

/**
 * Estado do ciclo EXPLICADO (G1a): quem não é o avaliador via uma tela sem
 * formulário, sem resultado e sem decisão — e, antes desta correção, sem
 * explicação nenhuma (parecia página quebrada). O texto nasce aqui, no
 * serviço, porque depende das MESMAS regras que liberam as ações.
 */
export interface SituacaoCiclo {
  /** Estado atual em uma frase ("Aguardando o avaliador responder"). */
  titulo: string;
  /** Quem é quem e o que já aconteceu, com o prazo. */
  detalhe: string;
  /** O que precisa acontecer para o ciclo andar (independe de quem lê). */
  proximo_passo: string;
  /** O que ESTA pessoa pode fazer aqui — nunca vazio (diz "nada" quando é nada). */
  o_que_posso_fazer: string[];
}

export interface DetalheCiclo {
  pode: PermissoesAvaliacao & { sou_avaliador: boolean };
  ciclo: CicloPayload;
  /** Estado explicado — sempre presente, para nunca haver tela em branco. */
  situacao: SituacaoCiclo;
  /**
   * Modelo congelado do ciclo (pilares/indicadores/pesos). Não é dado pessoal:
   * vai para quem vê respostas E para quem configura o modelo — é o que a
   * pessoa já lê em /avaliacoes/modelos.
   */
  estrutura: EstruturaCongelada | null;
  respostas: RespostaGravada[] | null;
  /** RESTRITO a avaliacao.resultado.ver — ausência, não máscara. */
  resultado: ResultadoPayload | null;
  decisao: DecisaoGravada | null;
  acoes: { responder: boolean; decidir: boolean; cancelar: boolean };
}

interface AcoesCiclo {
  responder: boolean;
  decidir: boolean;
  cancelar: boolean;
}

function textoPrazo(prazo: string, dias: number, vivo: boolean): string {
  const data = formatarData(prazo);
  if (!vivo) return `prazo ${data}`;
  if (dias < 0) return `prazo ${data} — vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return `prazo ${data} — vence hoje`;
  return `prazo ${data} — faltam ${dias} dia(s)`;
}

function montarSituacao(
  ciclo: CicloDetalhe,
  souAvaliador: boolean,
  pode: PermissoesAvaliacao,
  acoes: AcoesCiclo,
  temResultado: boolean
): SituacaoCiclo {
  const vivo = ciclo.status === "aberto" || ciclo.status === "em_avaliacao";
  const quem =
    `${ROTULOS_TIPO_CICLO[ciclo.tipo]} de ${ciclo.colaborador_nome} ` +
    `(matrícula ${ciclo.matricula}) · avaliador: ${ciclo.avaliador_nome}`;
  const prazo = textoPrazo(ciclo.prazo, ciclo.dias_para_prazo, vivo);

  let titulo: string;
  let detalhe: string;
  let proximo_passo: string;
  if (vivo) {
    titulo = souAvaliador
      ? "Esta avaliação está com você"
      : "Aguardando o avaliador responder";
    detalhe =
      `${quem}. ${prazo}. ` +
      (ciclo.status === "em_avaliacao"
        ? "Já há rascunho salvo, ainda não enviado."
        : "Nenhuma resposta gravada até agora.");
    proximo_passo =
      `O avaliador responde TODOS os indicadores do modelo congelado ` +
      `(v${ciclo.modelo_versao}) — nota 1–5 ou "não observado" — e envia. ` +
      "O envio consolida o resultado automaticamente; envio parcial não existe.";
  } else if (ciclo.status === "consolidado") {
    titulo = "Aguardando decisão";
    detalhe =
      `${quem}. ${prazo}. Avaliação enviada` +
      (ciclo.enviado_em ? ` em ${formatarDataHora(ciclo.enviado_em)}` : "") +
      " e resultado consolidado — respostas imutáveis.";
    proximo_passo =
      "DP ou diretoria registra a decisão humana. A faixa é recomendação: " +
      "divergir dela exige justificativa.";
  } else if (ciclo.status === "decidido") {
    titulo = "Ciclo concluído";
    detalhe = `${quem}. ${prazo}. Enviado, consolidado e com decisão registrada.`;
    proximo_passo =
      "Nada pendente. Ciclo fechado não reabre — correção é ciclo novo.";
  } else {
    titulo = "Ciclo cancelado";
    detalhe = `${quem}. ${prazo}. Cancelado antes do envio — nenhum resultado foi consolidado.`;
    proximo_passo = "Se ainda for preciso avaliar, o RH abre um ciclo novo.";
  }

  const posso: string[] = [];
  if (acoes.responder) {
    posso.push(
      "Responder e enviar esta avaliação — você é o avaliador deste ciclo."
    );
  } else if (souAvaliador && ciclo.avaliacao_estado === "enviada") {
    posso.push("Consultar o que você respondeu (enviado é imutável).");
  }
  if (acoes.decidir) {
    posso.push("Registrar a decisão humana sobre o resultado consolidado.");
  } else if (pode.decidir && vivo) {
    posso.push(
      "Decidir — só depois que o avaliador enviar e o resultado for consolidado."
    );
  }
  if (acoes.cancelar) {
    posso.push(
      "Cancelar o ciclo enquanto não houver envio (o motivo fica na trilha)."
    );
  }
  if (pode.configurar) {
    posso.push(
      "Configurar o modelo (pilares, indicadores, pesos e faixas) em Modelos — " +
        "vale só para ciclos abertos depois da ativação."
    );
  }
  if (pode.resultado_ver && !temResultado && vivo) {
    posso.push(
      "Ver o resultado consolidado — ele aparece aqui assim que o avaliador enviar."
    );
  }
  if (posso.length === 0) {
    posso.push(
      "Nada a fazer aqui: este ciclo é só acompanhamento para o seu perfil."
    );
  }
  return { titulo, detalhe, proximo_passo, o_que_posso_fazer: posso };
}

/**
 * Detalhe com payload MINIMIZADO por permissão: respostas para o avaliador
 * do ciclo e para quem tem resultado.ver; resultado/recomendação SÓ para
 * resultado.ver. Toda leitura sensível autorizada gera trilha.
 */
export async function obterDetalhe(
  sessao: PayloadSessao,
  pode: PermissoesAvaliacao,
  id: number
): Promise<DetalheCiclo> {
  const ciclo = await buscarCicloDetalhe(id);
  if (!ciclo) {
    throw new ErroHttp(404, "Avaliação não encontrada.");
  }
  const souAvaliador =
    pode.responder && ciclo.avaliador_usuario_id === sessao.usuario_id;
  if (!souAvaliador && !pode.configurar && !pode.decidir && !pode.resultado_ver) {
    // Ausência, não máscara: quem não participa não sabe que o ciclo existe.
    throw new ErroHttp(404, "Avaliação não encontrada.");
  }

  const incluirRespostas = souAvaliador || pode.resultado_ver;
  // A estrutura do modelo NÃO é dado pessoal (é o mesmo conteúdo de
  // /avaliacoes/modelos): quem configura também recebe, senão o RH abre o
  // ciclo e não vê sequer o que está sendo perguntado (parte do G1a).
  const incluirEstrutura = incluirRespostas || pode.configurar;
  const [estrutura, respostas, resultado, decisao] = await Promise.all([
    incluirEstrutura ? buscarEstrutura(ciclo.modelo_versao_id) : null,
    incluirRespostas && ciclo.avaliacao_id !== null
      ? listarRespostas(ciclo.avaliacao_id)
      : null,
    pode.resultado_ver ? buscarResultado(id) : null,
    pode.resultado_ver || pode.decidir ? buscarDecisao(id) : null,
  ]);

  // Trilha de leitura: notas brutas de terceiros e resultado consolidado.
  if (
    pode.resultado_ver &&
    !souAvaliador &&
    respostas !== null &&
    respostas.length > 0
  ) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: CHAVE_RESULTADO_VER,
      recurso: "rh.resposta_item",
      registroId: String(id),
    });
  }
  if (resultado) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: CHAVE_RESULTADO_VER,
      recurso: TABELA_RESULTADO,
      registroId: String(id),
    });
  }

  const acoes: AcoesCiclo = {
    responder:
      souAvaliador &&
      (ciclo.status === "aberto" || ciclo.status === "em_avaliacao") &&
      ciclo.avaliacao_estado !== "enviada",
    decidir: pode.decidir && ciclo.status === "consolidado",
    cancelar:
      pode.configurar &&
      (ciclo.status === "aberto" || ciclo.status === "em_avaliacao"),
  };

  return {
    pode: { ...pode, sou_avaliador: souAvaliador },
    ciclo: {
      id: ciclo.id,
      colaborador_nome: ciclo.colaborador_nome,
      matricula: ciclo.matricula,
      avaliador_nome: ciclo.avaliador_nome,
      tipo: ciclo.tipo,
      status: ciclo.status,
      origem: ciclo.origem,
      prazo: ciclo.prazo,
      dias_para_prazo: ciclo.dias_para_prazo,
      modelo_versao: ciclo.modelo_versao,
      modelo_nome: ciclo.modelo_nome,
      avaliacao_estado: ciclo.avaliacao_estado,
      enviado_em: ciclo.enviado_em,
      criado_em: ciclo.criado_em,
    },
    situacao: montarSituacao(
      ciclo,
      souAvaliador,
      pode,
      acoes,
      resultado !== null
    ),
    estrutura,
    respostas,
    resultado: resultado
      ? {
          percentual: resultado.percentual,
          faixa_rotulo: resultado.faixa_rotulo,
          faixa_minimo: resultado.faixa_minimo,
          faixa_maximo: resultado.faixa_maximo,
          recomendacao: resultado.recomendacao,
          memoria_calculo: resultado.memoria_calculo,
          em: resultado.em,
        }
      : null,
    decisao,
    acoes,
  };
}

// ------------------------------------------------------------------ responder (rascunho e envio)

async function exigirCicloDoAvaliador(
  cliente: PoolClient,
  sessao: PayloadSessao,
  cicloId: number
): Promise<CicloParaMutacao> {
  const ciclo = await buscarCicloParaMutacao(cliente, cicloId);
  if (!ciclo || ciclo.avaliador_usuario_id !== sessao.usuario_id) {
    throw new ErroHttp(404, "Avaliação não encontrada.");
  }
  if (ciclo.status !== "aberto" && ciclo.status !== "em_avaliacao") {
    throw new ErroHttp(
      409,
      `Ciclo ${ROTULOS_STATUS_CICLO[ciclo.status].toLowerCase()} não aceita respostas.`
    );
  }
  if (ciclo.avaliacao_estado === "enviada") {
    throw new ErroHttp(
      409,
      "Avaliação já enviada é imutável — fale com o RH se precisar corrigir."
    );
  }
  return ciclo;
}

/** Salva rascunho (subconjunto permitido) — envio é que exige tudo. */
export async function salvarRascunho(
  sessao: PayloadSessao,
  cicloId: number,
  entrada: SalvarRespostas
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const ciclo = await exigirCicloDoAvaliador(cliente, sessao, cicloId);
    const estrutura = await buscarEstrutura(ciclo.modelo_versao_id);
    if (!estrutura) {
      throw new ErroHttp(500, "Modelo congelado do ciclo não encontrado.");
    }
    const idsDoModelo = new Set(
      estrutura.pilares.flatMap((p) => p.indicadores.map((i) => i.id))
    );
    for (const resposta of entrada.respostas) {
      if (!idsDoModelo.has(resposta.indicador_id)) {
        throw new ErroHttpCampo(
          400,
          "Resposta para indicador fora do modelo congelado do ciclo.",
          "respostas"
        );
      }
    }
    const avaliacaoId =
      ciclo.avaliacao_id ?? (await garantirAvaliacao(cliente, cicloId));
    await salvarRespostas(cliente, avaliacaoId, entrada.respostas);
    if (ciclo.status === "aberto") {
      await atualizarStatusCiclo(cliente, cicloId, "em_avaliacao");
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_AVALIACAO,
      registroId: String(avaliacaoId),
      diff: {
        Colaborador: {
          de: null,
          para: `${ciclo.colaborador_nome} (matrícula ${ciclo.matricula})`,
        },
        Rascunho: {
          de: null,
          para: `${entrada.respostas.length} resposta(s) salva(s) de ${idsDoModelo.size} indicadores`,
        },
      },
    });
  });
}

/**
 * ENVIO + CONSOLIDAÇÃO na mesma transação (MVP líder→liderado: uma
 * avaliação por ciclo). Envio parcial NÃO existe: o motor exige toda
 * pergunta com nota OU não observado — senão continua rascunho (409).
 * O resultado nasce do MOTOR (calculo.ts) com memória de cálculo completa.
 */
export async function enviarAvaliacao(
  sessao: PayloadSessao,
  cicloId: number
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const ciclo = await exigirCicloDoAvaliador(cliente, sessao, cicloId);
    const estrutura = await buscarEstrutura(ciclo.modelo_versao_id);
    if (!estrutura) {
      throw new ErroHttp(500, "Modelo congelado do ciclo não encontrado.");
    }
    const avaliacaoId =
      ciclo.avaliacao_id ?? (await garantirAvaliacao(cliente, cicloId));
    const respostas = await listarRespostasComCliente(cliente, avaliacaoId);

    // Motor: lança 409 se faltar resposta (parcial = continua rascunho)
    // ou se tudo estiver marcado como não observado.
    const resultado = calcularResultado(estrutura, respostas);

    await marcarEnviada(cliente, avaliacaoId);
    await inserirResultado(cliente, {
      ciclo_id: cicloId,
      percentual: resultado.percentual,
      faixa_resultado_id: resultado.faixa.id,
      recomendacao: resultado.faixa.recomendacao,
      memoria_calculo: resultado.memoria,
    });
    await atualizarStatusCiclo(cliente, cicloId, "consolidado");

    const rotuloCiclo = `${ROTULOS_TIPO_CICLO[ciclo.tipo]} de ${ciclo.colaborador_nome} (matrícula ${ciclo.matricula})`;
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_AVALIACAO,
      registroId: String(avaliacaoId),
      diff: {
        Ciclo: { de: null, para: rotuloCiclo },
        Estado: { de: "Rascunho", para: "Enviada (imutável)" },
      },
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_RESULTADO,
      registroId: String(cicloId),
      diff: {
        Ciclo: { de: null, para: rotuloCiclo },
        Percentual: { de: null, para: `${resultado.percentual}%` },
        Faixa: { de: null, para: resultado.faixa.rotulo },
        Recomendação: {
          de: null,
          para: ROTULOS_RECOMENDACAO[resultado.faixa.recomendacao],
        },
        Modelo: { de: null, para: `v${estrutura.versao}` },
      },
    });
  });
}

// ------------------------------------------------------------------ decisão humana

/**
 * Decisão humana registrada sobre o ciclo consolidado. Divergência da
 * recomendação da faixa EXIGE justificativa (erro 5 da auditoria btime).
 * A decisão nunca executa nada: "desligar" é encaminhamento — o processo
 * de desligamento é aberto no módulo próprio pelo DP.
 */
export async function registrarDecisao(
  sessao: PayloadSessao,
  cicloId: number,
  entrada: EntradaDecisao
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const ciclo = await buscarCicloParaMutacao(cliente, cicloId);
    if (!ciclo) {
      throw new ErroHttp(404, "Avaliação não encontrada.");
    }
    if (ciclo.status !== "consolidado") {
      throw new ErroHttp(
        409,
        ciclo.status === "decidido"
          ? "Este ciclo já tem decisão registrada — decisão é imutável."
          : "A decisão só pode ser registrada após o envio e a consolidação da avaliação."
      );
    }
    const resultado = await buscarResultadoComCliente(cliente, cicloId);
    if (!resultado) {
      throw new ErroHttp(409, "Ciclo sem resultado consolidado.");
    }
    const divergente = decisaoDiverge(resultado.recomendacao, entrada.decisao);
    const justificativa = entrada.justificativa?.trim() || null;
    if (divergente && !justificativa) {
      throw new ErroHttpCampo(
        400,
        `A decisão "${ROTULOS_DECISAO[entrada.decisao]}" diverge da recomendação da faixa (${ROTULOS_RECOMENDACAO[resultado.recomendacao]}) — justificativa é obrigatória.`,
        "justificativa"
      );
    }
    await inserirDecisao(cliente, {
      ciclo_id: cicloId,
      decisao: entrada.decisao,
      divergente,
      justificativa,
      decisor_usuario_id: sessao.usuario_id,
    });
    await atualizarStatusCiclo(cliente, cicloId, "decidido");

    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "decisao",
      tabela: TABELA_DECISAO,
      registroId: String(cicloId),
      diff: {
        Ciclo: {
          de: null,
          para: `${ROTULOS_TIPO_CICLO[ciclo.tipo]} de ${ciclo.colaborador_nome} (matrícula ${ciclo.matricula})`,
        },
        "Recomendação da faixa": {
          de: null,
          para: `${resultado.faixa_rotulo} (${ROTULOS_RECOMENDACAO[resultado.recomendacao]})`,
        },
        Decisão: { de: null, para: ROTULOS_DECISAO[entrada.decisao] },
        Divergente: { de: null, para: divergente ? "Sim" : "Não" },
        ...(justificativa
          ? { Justificativa: { de: null, para: justificativa } }
          : {}),
      },
    });

    // Linha do tempo: fato relevante SEM notas brutas nem percentual.
    await inserirEvento(cliente, {
      colaborador_id: ciclo.colaborador_id,
      tipo: "avaliacao_concluida",
      ocorrido_em: new Date().toISOString(),
      origem_tabela: TABELA_CICLO,
      origem_id: cicloId,
      resumo: `${ROTULOS_TIPO_CICLO[ciclo.tipo]} concluída — faixa "${resultado.faixa_rotulo}" · decisão: ${ROTULOS_DECISAO[entrada.decisao]}${divergente ? " (divergente da recomendação)" : ""}`,
      payload: {
        ciclo_id: cicloId,
        tipo: ciclo.tipo,
        faixa: resultado.faixa_rotulo,
        recomendacao: resultado.recomendacao,
        decisao: entrada.decisao,
        divergente,
      },
      registrado_por: sessao.usuario_id,
    });
  });
}

/** Cancela ciclo ainda sem envio (ex.: desligamento no meio, abertura indevida). */
export async function cancelarCiclo(
  sessao: PayloadSessao,
  cicloId: number,
  motivo: string
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const ciclo = await buscarCicloParaMutacao(cliente, cicloId);
    if (!ciclo) {
      throw new ErroHttp(404, "Avaliação não encontrada.");
    }
    if (ciclo.status !== "aberto" && ciclo.status !== "em_avaliacao") {
      throw new ErroHttp(
        409,
        "Só ciclos ainda não consolidados podem ser cancelados — ciclo fechado não reabre."
      );
    }
    await atualizarStatusCiclo(cliente, cicloId, "cancelado");
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_CICLO,
      registroId: String(cicloId),
      diff: {
        Ciclo: {
          de: null,
          para: `${ROTULOS_TIPO_CICLO[ciclo.tipo]} de ${ciclo.colaborador_nome} (matrícula ${ciclo.matricula})`,
        },
        Status: {
          de: ROTULOS_STATUS_CICLO[ciclo.status],
          para: ROTULOS_STATUS_CICLO.cancelado,
        },
        Motivo: { de: null, para: motivo },
      },
    });
  });
}

// ------------------------------------------------------------------ administração do modelo

export interface PainelModelos {
  modelos: ModeloResumo[];
  ativa: EstruturaCongelada | null;
  rascunho: EstruturaCongelada | null;
}

export async function montarPainelModelos(): Promise<PainelModelos> {
  const modelos = await listarModelos();
  const ativa = modelos.find((m) => m.status === "ativa");
  const rascunho = modelos.find((m) => m.status === "rascunho");
  const [estruturaAtiva, estruturaRascunho] = await Promise.all([
    ativa ? buscarEstrutura(ativa.id) : null,
    rascunho ? buscarEstrutura(rascunho.id) : null,
  ]);
  return { modelos, ativa: estruturaAtiva, rascunho: estruturaRascunho };
}

/** Nova versão SEMPRE nasce rascunho — só uma em rascunho por vez. */
export async function criarRascunhoModelo(
  sessao: PayloadSessao,
  estrutura: EstruturaModeloEntrada
): Promise<{ id: number; versao: number }> {
  const jaExiste = await existeRascunho();
  if (jaExiste !== null) {
    throw new ErroHttp(
      409,
      "Já existe uma versão em rascunho — edite ou ative a existente antes de criar outra."
    );
  }
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const criado = await criarModeloRascunho(cliente, estrutura.nome);
    await substituirEstrutura(cliente, criado.id, estrutura);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_MODELO,
      registroId: String(criado.id),
      diff: {
        Versão: { de: null, para: `v${criado.versao} (rascunho)` },
        Nome: { de: null, para: estrutura.nome },
        Pilares: {
          de: null,
          para: estrutura.pilares
            .map((p) => `${p.nome} (${p.peso}%)`)
            .join(" · "),
        },
        Faixas: {
          de: null,
          para: estrutura.faixas
            .map((f) => `${f.minimo}–${f.maximo} ${f.rotulo}`)
            .join(" · "),
        },
      },
    });
    return criado;
  });
}

export async function atualizarRascunhoModelo(
  sessao: PayloadSessao,
  id: number,
  estrutura: EstruturaModeloEntrada
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const modelo = await buscarModeloParaMutacao(cliente, id);
    if (!modelo) {
      throw new ErroHttp(404, "Versão do modelo não encontrada.");
    }
    if (modelo.status !== "rascunho") {
      throw new ErroHttp(
        409,
        "Versão ativada é imutável — mudança de pilar, peso ou faixa é uma NOVA versão."
      );
    }
    await substituirEstrutura(cliente, id, estrutura);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_MODELO,
      registroId: String(id),
      diff: {
        Versão: { de: null, para: `v${modelo.versao} (rascunho)` },
        Estrutura: {
          de: null,
          para: `${estrutura.pilares.length} pilar(es), ${estrutura.pilares.reduce((s, p) => s + p.indicadores.length, 0)} indicador(es), ${estrutura.faixas.length} faixa(s)`,
        },
      },
    });
  });
}

/**
 * ATIVAÇÃO valida somas = 100 (pilares e dentro de cada pilar) e faixas
 * contíguas 0–100, encerra a versão anterior e ativa esta — que passa a
 * valer SOMENTE para ciclos abertos depois (ciclo congela a versão).
 */
export async function ativarVersaoModelo(
  sessao: PayloadSessao,
  id: number
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const modelo = await buscarModeloParaMutacao(cliente, id);
    if (!modelo) {
      throw new ErroHttp(404, "Versão do modelo não encontrada.");
    }
    if (modelo.status !== "rascunho") {
      throw new ErroHttp(409, "Só versão em rascunho pode ser ativada.");
    }
    const estrutura = await buscarEstrutura(id);
    if (!estrutura || estrutura.pilares.length === 0) {
      throw new ErroHttp(400, "O modelo precisa de ao menos um pilar.");
    }
    if (estrutura.faixas.length === 0) {
      throw new ErroHttp(400, "O modelo precisa de ao menos uma faixa.");
    }
    const problemas = validarAtivacao({
      nome: estrutura.nome,
      pilares: estrutura.pilares.map((p) => ({
        nome: p.nome,
        peso: p.peso,
        indicadores: p.indicadores.map((i) => ({
          nome: i.nome,
          descricao: i.descricao,
          peso: i.peso,
        })),
      })),
      faixas: estrutura.faixas.map((f) => ({
        minimo: f.minimo,
        maximo: f.maximo,
        rotulo: f.rotulo,
        recomendacao: f.recomendacao,
      })),
    });
    if (problemas.length > 0) {
      throw new ErroHttp(
        400,
        `Ativação bloqueada: ${problemas.map((p) => p.mensagem).join(" ")}`
      );
    }
    const encerradaId = await ativarModelo(cliente, id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_MODELO,
      registroId: String(id),
      diff: {
        Versão: { de: `v${modelo.versao} (rascunho)`, para: `v${modelo.versao} (ativa)` },
        "Versão anterior": {
          de: null,
          para:
            encerradaId === null
              ? "Nenhuma (primeira ativação)"
              : `Encerrada (id ${encerradaId}) — ciclos abertos com ela NÃO são recalculados`,
        },
      },
    });
  });
}

// Reexporta os rótulos usados pelas telas via payload do serviço.
export type { CicloResumo, DecisaoGravada, ModeloResumo, PendenciaSemGestor, RespostaGravada };
export type { Decisao };
