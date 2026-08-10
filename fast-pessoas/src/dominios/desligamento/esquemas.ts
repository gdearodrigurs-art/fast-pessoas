import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

// ------------------------------------------------------------------ máquina de estados do processo

export const ESTADOS_PROCESSO = [
  "iniciado",
  "em_cumprimento",
  "em_acerto",
  "encerrado",
  "cancelado",
] as const;

export type EstadoProcesso = (typeof ESTADOS_PROCESSO)[number];

export const ROTULOS_ESTADO: Record<EstadoProcesso, string> = {
  iniciado: "Iniciado",
  em_cumprimento: "Em cumprimento",
  em_acerto: "Em acerto",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

/** Transições "para frente" permitidas fora dos terminais (encerrar/cancelar). */
export const PROXIMO_ESTADO: Partial<Record<EstadoProcesso, EstadoProcesso>> = {
  iniciado: "em_cumprimento",
  em_cumprimento: "em_acerto",
};

export const ESTADOS_TERMINAIS: readonly EstadoProcesso[] = [
  "encerrado",
  "cancelado",
];

// ------------------------------------------------------------------ atributos do processo

export const INICIATIVAS = [
  "empregador",
  "empregado",
  "acordo",
  "termino_contrato",
] as const;

export type Iniciativa = (typeof INICIATIVAS)[number];

export const ROTULOS_INICIATIVA: Record<Iniciativa, string> = {
  empregador: "Empregador",
  empregado: "Empregado",
  acordo: "Acordo entre as partes",
  termino_contrato: "Término de contrato",
};

export const MODALIDADES_AVISO = [
  "trabalhado",
  "indenizado",
  "dispensado",
  "nao_aplicavel",
] as const;

export type ModalidadeAviso = (typeof MODALIDADES_AVISO)[number];

export const ROTULOS_MODALIDADE_AVISO: Record<ModalidadeAviso, string> = {
  trabalhado: "Aviso trabalhado",
  indenizado: "Aviso indenizado",
  dispensado: "Cumprimento dispensado",
  nao_aplicavel: "Não aplicável",
};

// ------------------------------------------------------------------ verificação de estabilidades

export const TIPOS_ESTABILIDADE = [
  "acidentario",
  "cipeiro",
  "gestante",
  "pre_aposentadoria",
  "outra",
] as const;

export type TipoEstabilidade = (typeof TIPOS_ESTABILIDADE)[number];

export const ROTULOS_TIPO_ESTABILIDADE: Record<TipoEstabilidade, string> = {
  acidentario: "Acidentário (art. 118 da Lei 8.213/91)",
  cipeiro: "Cipeiro (art. 10, II, a, ADCT)",
  gestante: "Gestante (art. 10, II, b, ADCT)",
  pre_aposentadoria: "Pré-aposentadoria (convenção coletiva)",
  outra: "Outra estabilidade",
};

/** Estabilidades sem dado no sistema: declaração humana obrigatória no gate. */
export const TIPOS_DECLARACAO = [
  "gestante",
  "cipeiro",
  "pre_aposentadoria",
] as const;

export type TipoDeclaracao = (typeof TIPOS_DECLARACAO)[number];

export const RESULTADOS_ESTABILIDADE = [
  "livre",
  "condicionado",
  "bloqueado",
] as const;

export type ResultadoEstabilidade = (typeof RESULTADOS_ESTABILIDADE)[number];

export const ROTULOS_RESULTADO_ESTABILIDADE: Record<
  ResultadoEstabilidade,
  string
> = {
  livre: "Livre",
  condicionado: "Condicionado",
  bloqueado: "Bloqueado",
};

// ------------------------------------------------------------------ itens de devolução

/**
 * Categoria de item de devolução vem do CATÁLOGO (rh.categoria_devolucao),
 * nunca de lista fixa aqui. Até a 0054 eram sete valores chumbados na CHECK do
 * banco e num Record neste arquivo — e carro, desktop e tablet, que são ativos
 * reais da empresa, não cabiam em nenhum deles: caíam em "outro" e sumiam de
 * qualquer relatório por tipo. Categoria nova é ato de tela, não de deploy.
 */
export interface CategoriaDevolucao {
  id: number;
  /** Slug estável — é o que rh.item_devolucao.categoria grava. */
  chave: string;
  nome: string;
  ordem: number;
  ativa: boolean;
  /** Quantos itens de devolução já usam esta categoria (por isso não se apaga). */
  em_uso: number;
}

/** O mesmo formato que o banco impõe em rh.categoria_devolucao.chave. */
const FORMATO_CHAVE_CATEGORIA = /^[a-z][a-z0-9_]*$/;

export const esquemaChaveCategoria = z
  .string()
  .trim()
  .max(60, "Categoria inválida")
  .regex(FORMATO_CHAVE_CATEGORIA, "Categoria inválida");

/**
 * Nome digitado → chave estável ("Carro da frota" → "carro_da_frota").
 * A chave é derivada uma vez, na criação: renomear depois mexe só no nome, para
 * que o histórico já gravado continue apontando para a mesma linha.
 */
export function chaveDeNome(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/g, "");
  if (base === "") return "";
  return /^[a-z]/.test(base) ? base : `cat_${base}`;
}

export const STATUS_ITEM = [
  "pendente",
  "devolvido",
  "avariado",
  "extraviado",
] as const;

export type StatusItem = (typeof STATUS_ITEM)[number];

export const ROTULOS_STATUS_ITEM: Record<StatusItem, string> = {
  pendente: "Pendente",
  devolvido: "Devolvido",
  avariado: "Devolvido com avaria",
  extraviado: "Extraviado",
};

// ------------------------------------------------------------------ entrevista de desligamento

export const STATUS_ENTREVISTA = [
  "oferecida",
  "agendada",
  "realizada",
  "recusada",
  "nao_realizada",
] as const;

export type StatusEntrevista = (typeof STATUS_ENTREVISTA)[number];

export const ROTULOS_STATUS_ENTREVISTA: Record<StatusEntrevista, string> = {
  oferecida: "Oferecida",
  agendada: "Agendada",
  realizada: "Realizada",
  recusada: "Recusada",
  nao_realizada: "Não realizada",
};

/** A trava do KPI: o processo só encerra com a entrevista num destes estados. */
export const STATUS_TERMINAIS_ENTREVISTA: readonly StatusEntrevista[] = [
  "realizada",
  "recusada",
  "nao_realizada",
];

export interface PerguntaRoteiro {
  chave: string;
  texto: string;
  tipo: "texto" | "escala_1_5" | "sim_nao";
  opcional?: boolean;
}

export type Respostas = Record<string, string | number | boolean>;

/**
 * Valida as respostas contra o roteiro vigente da entrevista.
 * Retorna a mensagem do primeiro problema, ou null quando tudo confere.
 */
export function validarRespostas(
  perguntas: PerguntaRoteiro[],
  respostas: Respostas
): string | null {
  const conhecidas = new Set(perguntas.map((pergunta) => pergunta.chave));
  for (const chave of Object.keys(respostas)) {
    if (!conhecidas.has(chave)) {
      return `Resposta para pergunta fora do roteiro: "${chave}".`;
    }
  }
  for (const pergunta of perguntas) {
    const valor = respostas[pergunta.chave];
    if (valor === undefined) {
      if (pergunta.opcional) continue;
      return `Responda a pergunta obrigatória: "${pergunta.texto}"`;
    }
    if (pergunta.tipo === "texto") {
      if (typeof valor !== "string" || valor.trim() === "") {
        return `A resposta de "${pergunta.texto}" deve ser um texto.`;
      }
    } else if (pergunta.tipo === "escala_1_5") {
      if (
        typeof valor !== "number" ||
        !Number.isInteger(valor) ||
        valor < 1 ||
        valor > 5
      ) {
        return `A resposta de "${pergunta.texto}" deve ser uma nota de 1 a 5.`;
      }
    } else if (typeof valor !== "boolean") {
      return `A resposta de "${pergunta.texto}" deve ser sim ou não.`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ esquemas de entrada

// Data civil numa fonte só: recusa 30/02, mês 13 e afins ANTES de tocar o
// banco — senão o Postgres estoura ('date/time field value out of range') e
// vira 500 onde cabia 400. Era um regex-only local: a mesma fraqueza da
// pendência #7, mas nesta cópia do módulo, que a correção do compartilhado não
// alcançava. Cobre encerrar, iniciar, agendar e realizar entrevista.
const dataIso = esquemaData;

const esquemaDeclaracao = z
  .object({
    resultado: z.enum([...RESULTADOS_ESTABILIDADE]),
    justificativa: z
      .string()
      .trim()
      .max(2000, "Justificativa longa demais")
      .optional(),
  })
  .refine(
    (declaracao) =>
      declaracao.resultado === "livre" ||
      (declaracao.justificativa !== undefined &&
        declaracao.justificativa.length > 0),
    {
      message: "Justifique o resultado declarado",
      path: ["justificativa"],
    }
  );

export const esquemaIniciarProcesso = z
  .object({
    colaborador_id: z.number().int().positive(),
    tipo_versao_id: z.number().int().positive(),
    iniciativa: z.enum([...INICIATIVAS]),
    modalidade_aviso: z.enum([...MODALIDADES_AVISO]),
    data_comunicacao: dataIso,
    data_projetada_termino: dataIso,
    // RESTRITO: só quem tem desligamento.motivo.ver volta a ler este campo.
    motivo: z.string().trim().min(1).max(4000, "Motivo longo demais").optional(),
    declaracoes: z.object({
      gestante: esquemaDeclaracao,
      cipeiro: esquemaDeclaracao,
      pre_aposentadoria: esquemaDeclaracao,
    }),
    // Obrigatória quando alguma estabilidade resultou "bloqueado" (override auditado).
    override_justificativa: z
      .string()
      .trim()
      .min(1, "Justifique o prosseguimento")
      .max(2000, "Justificativa longa demais")
      .optional(),
  })
  .refine(
    (dados) => dados.data_projetada_termino >= dados.data_comunicacao,
    {
      message: "O término projetado não pode ser anterior à comunicação.",
      path: ["data_projetada_termino"],
    }
  );

export type IniciarProcesso = z.infer<typeof esquemaIniciarProcesso>;

export const esquemaEncerrar = z.object({
  data_termino_efetiva: dataIso,
});

export type CorpoEncerrar = z.infer<typeof esquemaEncerrar>;

export const esquemaMotivoAcao = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "O motivo é obrigatório")
    .max(4000, "Motivo longo demais"),
});

export type CorpoMotivoAcao = z.infer<typeof esquemaMotivoAcao>;

export const esquemaNovoItem = z.object({
  // A chave vem do catálogo; quem confere se ela existe e está ATIVA é o
  // serviço (e, por último, a FK + o trigger da 0054). Nunca um enum aqui.
  categoria: esquemaChaveCategoria,
  descricao: z
    .string()
    .trim()
    .min(1, "Descreva o item")
    .max(500, "Descrição longa demais"),
});

export type NovoItem = z.infer<typeof esquemaNovoItem>;

// ------------------------------------------------------------------ administração do catálogo de categorias

export const esquemaNomeCategoria = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome da categoria")
    .max(60, "Nome longo demais"),
});

export type NomeCategoria = z.infer<typeof esquemaNomeCategoria>;

/** Um verbo só: liga e desliga a categoria para uso NOVO. Nunca exclui. */
export const esquemaInativacaoCategoria = z.object({ inativa: z.boolean() });

export type InativacaoCategoria = z.infer<typeof esquemaInativacaoCategoria>;

export const esquemaStatusItem = z.object({
  status: z.enum([...STATUS_ITEM]),
});

export type CorpoStatusItem = z.infer<typeof esquemaStatusItem>;

export const esquemaAgendarEntrevista = z.object({
  data_agendada: dataIso,
});

export type CorpoAgendarEntrevista = z.infer<typeof esquemaAgendarEntrevista>;

export const esquemaRealizarEntrevista = z.object({
  respostas: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()])
  ),
  consentimento_uso_agregado: z.boolean().optional().default(false),
  data_realizacao: dataIso.optional(),
});

export type CorpoRealizarEntrevista = z.infer<
  typeof esquemaRealizarEntrevista
>;
