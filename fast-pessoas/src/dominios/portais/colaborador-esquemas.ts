/**
 * Portal do colaborador — camada de tipos e rótulos.
 *
 * Origem: docs/08-analise-feedback-analista-rh.md, seção 6 — "Portal do
 * Colaborador (dados, solicitações, benefícios, documentos, férias,
 * avaliações, PDI): tudo existe, falta a visão única". Esta onda é
 * CONSOLIDAÇÃO: nenhuma tabela nova, nenhuma migration. Todo bloco lê dado
 * que já existe pelo serviço do domínio dono.
 *
 * Não há esquema zod de entrada aqui de propósito: o portal é SÓ LEITURA e o
 * alvo é sempre o colaborador da sessão. Não existe parâmetro para validar —
 * e é justamente essa ausência que fecha a porta para IDOR (ver
 * colaborador-servico.ts).
 */

import type { StatusDemanda } from "../demandas/esquemas";
import type { StatusAdesao } from "../beneficios/esquemas";
import type { StatusCiclo, TipoCiclo } from "../avaliacao/esquemas";

// ------------------------------------------------------------------ blocos

/**
 * Bloco 1 — Meus dados. Vem da ficha (rh.colaborador + posição/lotação/
 * relação de gestor vigentes). SEM SALÁRIO: a chave `rh.posicao.ver` não é do
 * papel `funcionario`, e a regra do projeto é ausência, não máscara. O próprio
 * colaborador consultar o próprio salário é caso de uso legítimo, mas quem
 * responde por isso é o holerite (rh_folha) e a via oficial é a demanda
 * "Dúvida sobre a folha" — não este portal. FichaColaborador nem carrega o
 * campo, então não há como vazar por descuido de serialização.
 */
/**
 * Contrato ANTERIOR da mesma pessoa no grupo (migration 0046: o CPF é da
 * pessoa, o contrato é do vínculo). Existe porque o portal calava sobre ele: a
 * Onda I foi feita para "não perder o histórico" na troca de empresa, e o dono
 * do histórico era justamente quem não via que ele existia — o portal abria no
 * vínculo corrente e não dizia uma palavra sobre o anterior.
 *
 * Só o RÓTULO mora aqui. O conteúdo de cada contrato (ficha, espelho de ponto,
 * banco de horas, documentos) continua atrás da mesma guarda de sempre, que já
 * alcança a pessoa inteira — ver `condicaoEscopo` e `vinculosDoUsuario`.
 */
export interface ContratoAnterior {
  colaborador_id: number;
  matricula: string;
  empresa_nome: string | null;
  data_admissao: string;
  data_desligamento: string | null;
}

export interface MeusDados {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  /**
   * Os OUTROS contratos da mesma pessoa no grupo, do mais novo ao mais antigo.
   * Vazio para quem sempre teve um só — o caso da maioria.
   */
  contratos_anteriores: ContratoAnterior[];
  cargo_nome: string | null;
  /** Cargo da posição vigente — alvo do link para o RCF. */
  cargo_id: number | null;
  /** Para onde mandar o colaborador ver o RCF (ver montarLinkRcf). */
  rcf_href: string | null;
  unidade: string | null;
  data_admissao: string;
  dias_de_casa: number;
  tempo_de_casa: string;
  gestor_nome: string | null;
  tipo_vinculo: string;
  status: string;
}

/** Bloco 2 — Minhas férias. */
export interface MeuPeriodoFerias {
  id: number;
  inicio: string;
  fim: string;
  saldo_disponivel: number;
  status: string;
  limite_concessivo: string;
  dias_ate_limite: number;
  /** Vencido ou a menos de 90 dias do limite concessivo (art. 137). */
  em_alerta: boolean;
}

export interface MinhaProgramacaoFerias {
  id: number;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: string;
  demanda_numero: number | null;
}

export interface BlocoFerias {
  saldo_total: number;
  periodos: MeuPeriodoFerias[];
  programadas: MinhaProgramacaoFerias[];
  /** Frase pronta do alerta legal, ou null quando não há o que avisar. */
  alerta: string | null;
}

/** Bloco 3 — Minhas solicitações. */
export interface MinhaSolicitacao {
  id: number;
  numero: number;
  tipo_nome: string;
  descricao: string;
  status: StatusDemanda;
  status_rotulo: string;
  prazo: string;
  dias_ate_prazo: number;
  em_atraso: boolean;
  encerrada: boolean;
}

export interface BlocoSolicitacoes {
  em_aberto: MinhaSolicitacao[];
  encerradas: MinhaSolicitacao[];
}

/** Bloco 4 — Meus benefícios. */
export interface MinhaAdesao {
  id: number;
  beneficio_nome: string;
  categoria_rotulo: string;
  status: StatusAdesao;
  inicio: string;
  /** Dado do próprio colaborador — pode ver o que desconta do holerite dele. */
  valor: number | null;
  desconto: number | null;
}

export interface BeneficioElegivel {
  beneficio_id: number;
  nome: string;
  categoria_rotulo: string;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  /** Já pediu e o DP ainda não efetivou — não oferecer duas vezes. */
  solicitacao_pendente: boolean;
}

export interface MeuDependente {
  id: number;
  nome: string;
  parentesco_rotulo: string;
  nascimento: string;
}

export interface BlocoBeneficios {
  ativos: MinhaAdesao[];
  elegiveis_sem_adesao: BeneficioElegivel[];
  dependentes: MeuDependente[];
}

/** Bloco 5 — Meus documentos. */
export interface MeuDocumento {
  id: number;
  titulo: string;
  categoria: string;
  /** true = documento geral (política, comunicado); false = da minha pasta. */
  geral: boolean;
  enviado_em: string;
  ciencia_em: string | null;
}

export interface BlocoDocumentos {
  aguardando_ciencia: MeuDocumento[];
  com_ciencia: MeuDocumento[];
}

/**
 * Bloco 6 — Minhas avaliações. SEM nota bruta, SEM percentual, SEM
 * recomendação e SEM a decisão: no MVP o avaliado não vê resultado (regra do
 * projeto, docs/03-modulos/05-avaliacao-360.md). Aqui entra só o FATO de que
 * o ciclo existiu e quando fechou — nada que permita inferir a nota.
 */
export interface MeuCicloAvaliacao {
  id: number;
  tipo: TipoCiclo;
  tipo_rotulo: string;
  /** "Em andamento" | "Concluída" | "Cancelada" — ver ANDAMENTO_CICLO. */
  andamento: string;
  concluida_em: string | null;
}

/** Itens do PDI derivados de rh.acao_aberta (ver colaborador-servico.ts). */
export interface MeuItemPdi {
  id: number;
  descricao: string;
  prazo: string;
  status: string;
  status_rotulo: string;
  responsavel_nome: string;
  em_atraso: boolean;
}

export interface BlocoAvaliacoes {
  ciclos: MeuCicloAvaliacao[];
  pdi: MeuItemPdi[];
}

/** Bloco 7 — Meu check-in de hoje. */
export interface BlocoCheckin {
  data_referencia: string;
  respondido: boolean;
  perguntas_pendentes: number;
  aviso_transparencia: string;
}

export interface PortalColaborador {
  /** Blocos que a sessão alcança — cada um depende da chave do domínio dono. */
  pode: {
    ferias: boolean;
    solicitacoes: boolean;
    beneficios: boolean;
    documentos: boolean;
    checkin: boolean;
  };
  meus_dados: MeusDados;
  ferias: BlocoFerias | null;
  solicitacoes: BlocoSolicitacoes | null;
  beneficios: BlocoBeneficios | null;
  documentos: BlocoDocumentos | null;
  avaliacoes: BlocoAvaliacoes;
  checkin: BlocoCheckin | null;
  /** Bloco 8 — honestidade sobre o que o Fast Pessoas ainda não faz. */
  treinamentos: { disponivel: false; explicacao: string };
}

// ------------------------------------------------------------------ rótulos

/**
 * Andamento do ciclo do ponto de vista do AVALIADO. Deliberadamente mais
 * pobre que ROTULOS_STATUS_CICLO (avaliacao/esquemas.ts): "Aguardando
 * decisão" e "Decidida" contam ao avaliado que existe uma decisão em curso
 * sobre ele — informação do gestor/RH, não dele, no MVP. Aqui os dois viram
 * "Concluída".
 */
export const ANDAMENTO_CICLO: Record<StatusCiclo, string> = {
  aberto: "Em andamento",
  em_avaliacao: "Em andamento",
  consolidado: "Concluída",
  decidido: "Concluída",
  cancelado: "Cancelada",
};

export const ROTULOS_STATUS_PDI: Record<string, string> = {
  aberta: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/**
 * Bloco 8 do pedido da analista: treinamentos. O texto é a resposta honesta —
 * o LMS é o Sults (seção 7 do documento de feedback: fronteira Fast Pessoas ×
 * Sults é decisão de escopo pendente). Enquanto não houver integração, o
 * portal DIZ isso em vez de mostrar uma lista vazia que parece defeito.
 */
export const EXPLICACAO_TREINAMENTOS =
  "O histórico de treinamentos ainda não vive aqui: hoje as trilhas, provas e " +
  "certificados são registrados no Sults. Quando a integração for definida, " +
  "este bloco passa a mostrar os seus treinamentos concluídos e os obrigatórios " +
  "em aberto. Até então, consulte o Sults ou abra uma solicitação para o RH.";

// ------------------------------------------------------------------ derivações

/** Dias a partir dos quais o limite concessivo já é assunto (art. 137). */
export const DIAS_ALERTA_FERIAS = 90;

/**
 * "2 anos e 4 meses" — tempo de casa legível. Conta mês de CALENDÁRIO entre as
 * duas datas (não dias/30,44): admitido em 29/03/2024, em 29/07/2026 a pessoa
 * tem 2 anos e 4 meses, e é isso que ela espera ler. Ambas as datas em
 * AAAA-MM-DD; `hoje` já vem no fuso de exibição (America/Sao_Paulo).
 */
export function tempoDeCasa(dataAdmissao: string, hoje: string): string {
  const [anoIni, mesIni, diaIni] = dataAdmissao.split("-").map(Number);
  const [anoFim, mesFim, diaFim] = hoje.split("-").map(Number);
  if ([anoIni, mesIni, diaIni, anoFim, mesFim, diaFim].some(Number.isNaN)) {
    return "—";
  }
  let meses = (anoFim - anoIni) * 12 + (mesFim - mesIni);
  if (diaFim < diaIni) meses -= 1;
  if (meses < 0) return "—";
  if (meses === 0) {
    const dias = Math.round(
      (Date.UTC(anoFim, mesFim - 1, diaFim) -
        Date.UTC(anoIni, mesIni - 1, diaIni)) /
        86_400_000
    );
    if (dias <= 0) return "primeiro dia";
    return dias === 1 ? "1 dia" : `${dias} dias`;
  }
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(anos === 1 ? "1 ano" : `${anos} anos`);
  if (mesesRestantes > 0) {
    partes.push(mesesRestantes === 1 ? "1 mês" : `${mesesRestantes} meses`);
  }
  return partes.join(" e ");
}
