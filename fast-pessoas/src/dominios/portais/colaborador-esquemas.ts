/**
 * Portal do colaborador — camada de tipos e rótulos.
 *
 * Origem: docs/08-analise-feedback-analista-rh.md, seção 6 — "Portal do
 * Colaborador (dados, solicitações, benefícios, documentos, férias,
 * avaliações, PDI): tudo existe, falta a visão única". Esta onda é
 * CONSOLIDAÇÃO: nenhuma tabela nova, nenhuma migration. Todo bloco lê dado
 * que já existe pelo serviço do domínio dono.
 *
 * O portal nasceu SÓ LEITURA, e por isso não tinha esquema zod de entrada. A
 * onda H5 abriu a primeira — e só — escrita: o colaborador mantém os PRÓPRIOS
 * dependentes. Os esquemas de entrada estão no fim deste arquivo e seguem a
 * mesma defesa contra IDOR do resto do portal: NENHUM deles tem
 * `colaborador_id`. O alvo continua saindo da sessão, e a ausência do campo é
 * o que fecha a porta — não uma validação que pode falhar (ver
 * colaborador-servico.ts).
 */

import { z } from "zod";
import type { StatusDemanda } from "../demandas/esquemas";
import { PARENTESCOS, ROTULOS_PARENTESCO } from "../beneficios/esquemas";
import type { StatusAdesao } from "../beneficios/esquemas";
import { cpfValido } from "../colaboradores/esquemas";
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

export interface BlocoBeneficios {
  ativos: MinhaAdesao[];
  elegiveis_sem_adesao: BeneficioElegivel[];
}

/**
 * Bloco 4b — Meus dependentes.
 *
 * SAIU DE DENTRO DE `BlocoBeneficios` na onda H5, e a mudança não é cosmética.
 * Enquanto era só leitura, dependente cabia como rodapé do cartão de
 * benefícios. Ao virar CADASTRO ele deixou de caber por dois motivos:
 *
 *   1. a chave passou a ser outra. O cartão de benefícios responde por
 *      `adesao.solicitar`; o cadastro do próprio dependente responde por
 *      `dependente.proprio.manter` (migration 0056). Quem perder uma não pode
 *      perder a outra de carona — e a Onda H1 vai esvaziar justamente a
 *      primeira;
 *   2. dependente não é assunto só de benefício. Ele conta na dedução de IRRF
 *      (folha/repositorio.ts:452). Deixá-lo dentro do cartão de plano de saúde
 *      contaria ao colaborador metade do que aquele cadastro faz.
 */
export interface MeuDependente {
  id: number;
  nome: string;
  /** Valor cru — a tela precisa dele para pré-selecionar o campo na edição. */
  parentesco: string;
  parentesco_rotulo: string;
  nascimento: string;
  /**
   * O CPF do dependente NÃO viaja para a tela — só a notícia de que existe.
   *
   * Minimização por desenho, herdada da migration 0009 e mantida de propósito
   * agora que a pessoa pode escrever: dado de menor de idade que sai do banco
   * é dado que pode ficar em cache de navegador, em log de proxy e em captura
   * de tela. Para conferir se está certo o colaborador redigita; para tirar,
   * limpa o campo. A trilha de auditoria segue a mesma régua e grava
   * "informado"/"removido", nunca o número.
   */
  cpf_informado: boolean;
}

/** Opção do seletor de parentesco — ver `parentescos_possiveis`. */
export interface OpcaoParentesco {
  valor: string;
  rotulo: string;
}

export interface BlocoDependentes {
  itens: MeuDependente[];
  /**
   * A lista vem do SERVIDOR, e não de um `<option>` escrito na tela.
   *
   * Hoje ela é curta e fixa: `CHECK (parentesco IN ('filho','conjuge','outro'))`
   * na migration 0009 — um literal de negócio dentro de uma CHECK, que é
   * exatamente o que o eixo 9 chama de chumbado (mesmo formato que a 0054 teve
   * de desfazer para as categorias de devolução). Não é esta onda que resolve
   * isso, e a decisão é do dono. Mandar a lista pelo payload é o que torna a
   * correção barata quando ela vier: no dia em que `parentesco` virar catálogo
   * administrável, muda o servidor e a tela não sabe que mudou.
   */
  parentescos_possiveis: OpcaoParentesco[];
}

/** O seletor de hoje, montado do domínio — nunca digitado na tela. */
export const PARENTESCOS_POSSIVEIS: OpcaoParentesco[] = PARENTESCOS.map(
  (valor) => ({ valor, rotulo: ROTULOS_PARENTESCO[valor] })
);

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
    dependentes: boolean;
  };
  meus_dados: MeusDados;
  ferias: BlocoFerias | null;
  solicitacoes: BlocoSolicitacoes | null;
  beneficios: BlocoBeneficios | null;
  dependentes: BlocoDependentes | null;
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

// ------------------------------------------------------- entrada (a única do portal)
//
// O QUE NÃO ESTÁ AQUI É O QUE IMPORTA: não existe `colaborador_id`.
//
// O esquema do DP (beneficios/esquemas.ts:232) tem o campo, e tem que ter — o
// DP cadastra dependente DE OUTRA PESSOA, e o id é a única forma de dizer de
// quem. Aqui não há de quem dizer: o titular é o dono da sessão. Se o campo
// existisse, mesmo ignorado, a próxima pessoa a mexer neste arquivo teria de
// descobrir sozinha que ele não vale — e é assim que IDOR volta.

/** Data civil, no mesmo formato dos outros domínios. */
const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

/**
 * CPF do dependente: opcional (recém-nascido pode não ter), mas quando vem tem
 * de ser CPF de verdade. Digito verificador conferido pela MESMA função do
 * domínio de colaboradores — um CPF inválido gravado aqui vira rejeição no
 * eSocial meses depois, longe de quem digitou.
 */
const esquemaCpf = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => valor === "" || cpfValido(valor), { message: "CPF inválido" })
  .transform((valor) => (valor === "" ? null : valor));

export const esquemaMeuDependenteNovo = z.object({
  nome: z.string().trim().min(3, "Informe o nome do dependente").max(200),
  nascimento: esquemaData,
  parentesco: z.enum(PARENTESCOS),
  /** Ausente = não informado; string vazia = não informado (o campo em branco). */
  cpf: esquemaCpf.nullable().optional(),
});

export type MeuDependenteNovo = z.infer<typeof esquemaMeuDependenteNovo>;

export const esquemaMeuDependenteEdicao = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome do dependente").max(200).optional(),
    nascimento: esquemaData.optional(),
    parentesco: z.enum(PARENTESCOS).optional(),
    cpf: esquemaCpf.nullable().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export type MeuDependenteEdicao = z.infer<typeof esquemaMeuDependenteEdicao>;
