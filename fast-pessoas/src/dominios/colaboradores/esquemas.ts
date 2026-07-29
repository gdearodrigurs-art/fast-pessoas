import { z } from "zod";

export const TIPOS_VINCULO = [
  "clt",
  "estagiario",
  "aprendiz",
  "pj",
  "temporario",
] as const;

export type TipoVinculo = (typeof TIPOS_VINCULO)[number];

export const STATUS_COLABORADOR = ["ativo", "afastado", "desligado"] as const;

export type StatusColaborador = (typeof STATUS_COLABORADOR)[number];

export const ROTULOS_VINCULO: Record<TipoVinculo, string> = {
  clt: "CLT",
  estagiario: "Estagiário",
  aprendiz: "Aprendiz",
  pj: "PJ",
  temporario: "Temporário",
};

export const ROTULOS_STATUS: Record<StatusColaborador, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

// Gênero é AUTODECLARADO. LGPD (migration 0020): entra em relatório AGREGADO
// com supressão de recorte pequeno e nunca sai do backend em payload
// individual — nem na ficha, nem em listagem, nem como filtro de busca.
// Consequência de desenho: o formulário de edição é "cego" (grava o que a
// pessoa declarou sem exibir o valor guardado).
export const GENEROS = [
  "feminino",
  "masculino",
  "outro",
  "nao_informado",
] as const;

export type Genero = (typeof GENEROS)[number];

export const ROTULOS_GENERO: Record<Genero, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
  outro: "Outro",
  nao_informado: "Não informado",
};

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) return false;
  }
  return true;
}

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

const esquemaCpf = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{11}$/.test(valor), {
    message: "CPF deve ter 11 dígitos",
  })
  .refine(cpfValido, { message: "CPF inválido" });

export const esquemaCriacaoColaborador = z
  .object({
    email: z.email("E-mail inválido").max(254),
    matricula: z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, "Matrícula deve conter apenas números"),
    cpf: esquemaCpf,
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(200),
    tipo_vinculo: z.enum(TIPOS_VINCULO),
    data_admissao: esquemaData,
    // Obrigatória para NOVOS (a coluna é nullable por causa do legado do
    // Nasajon — ver a decisão documentada na migration 0020).
    data_nascimento: esquemaData,
    genero: z.enum(GENEROS).optional().default("nao_informado"),
    retrato: z.string().trim().max(2000).optional(),
    contexto: z.string().trim().max(4000).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.data_nascimento >= dados.data_admissao) {
      contexto.addIssue({
        code: "custom",
        path: ["data_nascimento"],
        message: "Data de nascimento deve ser anterior à admissão",
      });
    }
  });

export type CriacaoColaborador = z.infer<typeof esquemaCriacaoColaborador>;

export const esquemaAtualizacaoColaborador = z
  .object({
    nome_completo: z
      .string()
      .trim()
      .min(3, "Informe o nome completo")
      .max(200)
      .optional(),
    retrato: z.string().trim().max(2000).nullable().optional(),
    contexto: z.string().trim().max(4000).nullable().optional(),
    tipo_vinculo: z.enum(TIPOS_VINCULO).optional(),
    status: z.enum(STATUS_COLABORADOR).optional(),
    data_desligamento: esquemaData.optional(),
    data_nascimento: esquemaData.optional(),
    genero: z.enum(GENEROS).optional(),
  })
  .superRefine((dados, contexto) => {
    if (Object.values(dados).every((valor) => valor === undefined)) {
      contexto.addIssue({
        code: "custom",
        message: "Informe ao menos um campo para atualizar",
      });
    }
    if (dados.status === "desligado" && !dados.data_desligamento) {
      contexto.addIssue({
        code: "custom",
        path: ["data_desligamento"],
        message: "Informe a data de desligamento",
      });
    }
    if (dados.data_desligamento && dados.status !== "desligado") {
      contexto.addIssue({
        code: "custom",
        path: ["data_desligamento"],
        message: "Data de desligamento só se aplica ao status desligado",
      });
    }
  });

export type AtualizacaoColaborador = z.infer<
  typeof esquemaAtualizacaoColaborador
>;

export const esquemaFiltroColaboradores = z.object({
  busca: z.string().trim().min(1).max(100).optional(),
  status: z.enum(STATUS_COLABORADOR).optional(),
});

export type FiltroColaboradores = z.infer<typeof esquemaFiltroColaboradores>;

// ------------------------------------------------------------------ ocorrência

export const TIPOS_OCORRENCIA = [
  "positivo",
  "negativo",
  "neutro",
  "alerta",
] as const;

export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

export const ROTULOS_OCORRENCIA: Record<TipoOcorrencia, string> = {
  positivo: "Positivo",
  negativo: "Negativo",
  neutro: "Neutro",
  alerta: "Alerta",
};

export const esquemaCriacaoOcorrencia = z.object({
  tipo: z.enum(TIPOS_OCORRENCIA),
  restrita: z.boolean().optional().default(false),
  descricao: z.string().trim().min(3, "Descreva a ocorrência").max(4000),
  impacto: z.string().trim().max(2000).optional(),
  acao_combinada: z.string().trim().max(2000).optional(),
  ocorrida_em: esquemaData,
});

export type CriacaoOcorrencia = z.infer<typeof esquemaCriacaoOcorrencia>;

// ------------------------------------------------------------------ feedback formal

export const CADENCIA_FEEDBACK_DIAS = 90;

export const esquemaCriacaoFeedback = z.object({
  realizado_em: esquemaData,
  resumo: z.string().trim().min(3, "Resuma a conversa").max(4000),
});

export type CriacaoFeedback = z.infer<typeof esquemaCriacaoFeedback>;

// ------------------------------------------------------------------ ação aberta

export const STATUS_ACAO = ["aberta", "concluida", "cancelada"] as const;

export type StatusAcao = (typeof STATUS_ACAO)[number];

export const ROTULOS_STATUS_ACAO: Record<StatusAcao, string> = {
  aberta: "Aberta",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const esquemaCriacaoAcao = z.object({
  descricao: z.string().trim().min(3, "Descreva a ação").max(2000),
  prazo: esquemaData,
});

export type CriacaoAcao = z.infer<typeof esquemaCriacaoAcao>;

export const esquemaAtualizacaoAcao = z
  .object({
    descricao: z.string().trim().min(3).max(2000).optional(),
    prazo: esquemaData.optional(),
    status: z.enum(["concluida", "cancelada"]).optional(),
  })
  .refine(
    (dados) => Object.values(dados).some((valor) => valor !== undefined),
    { message: "Informe ao menos um campo para atualizar" }
  );

export type AtualizacaoAcao = z.infer<typeof esquemaAtualizacaoAcao>;

// ------------------------------------------------------------------ posição (cargo + salário — sensível)

export const MOTIVOS_POSICAO = [
  "admissao",
  "promocao",
  "merito",
  "reajuste",
  "enquadramento",
  "transferencia",
] as const;

export type MotivoPosicao = (typeof MOTIVOS_POSICAO)[number];

export const ROTULOS_MOTIVO_POSICAO: Record<MotivoPosicao, string> = {
  admissao: "Admissão",
  promocao: "Promoção",
  merito: "Mérito",
  reajuste: "Reajuste",
  enquadramento: "Enquadramento",
  transferencia: "Transferência",
};

const esquemaSalario = z
  .number()
  .min(0, "Salário não pode ser negativo")
  .max(9_999_999, "Salário acima do limite")
  .transform((valor) => Math.round(valor * 100) / 100);

export const esquemaCriacaoPosicao = z.object({
  cargo_id: z.number().int().positive(),
  salario: esquemaSalario,
  inicio_vigencia: esquemaData,
  motivo: z.enum(MOTIVOS_POSICAO),
});

export type CriacaoPosicao = z.infer<typeof esquemaCriacaoPosicao>;

// ------------------------------------------------------------------ relação gestor → liderado

export const esquemaDefinicaoGestor = z.object({
  gestor_colaborador_id: z.number().int().positive().nullable(),
  inicio_vigencia: esquemaData,
});

export type DefinicaoGestor = z.infer<typeof esquemaDefinicaoGestor>;

// ------------------------------------------------------------------ lotação

export const esquemaDefinicaoLotacao = z.object({
  estabelecimento_id: z.number().int().positive(),
  centro_custo: z.string().trim().min(1, "Informe o centro de custo").max(30),
  inicio_vigencia: esquemaData,
});

export type DefinicaoLotacao = z.infer<typeof esquemaDefinicaoLotacao>;

// ------------------------------------------------------------------ cargo + RCF + faixa salarial
// RCF = Responsabilidade Chave da Função, o descritivo de cargo oficial da Fast
// (referencias/rcf-modelo-descritivo-de-cargos.md). Ordem do documento:
// Cargo · Setor · Líder Direto · Tipo de contrato · Missão · Atividades ·
// CHA em três colunas · Observações. O CHA é uma PARTE do RCF, não o todo.

export const esquemaCha = z.object({
  conhecimentos: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  habilidades: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  atitudes: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

export type Cha = z.infer<typeof esquemaCha>;

/** Lista ORDENADA — a ordem das atividades é informação no documento. */
export const esquemaAtividades = z
  .array(z.string().trim().min(1).max(300))
  .max(60, "Máximo de 60 atividades");

const camposVersaoCargo = {
  nome: z.string().trim().min(2, "Informe o nome do cargo").max(120),
  setor: z.string().trim().max(120).optional(),
  /** Cargo do "Líder Direto" do documento — estrutura, não pessoa. */
  cargo_lider_id: z.number().int().positive().nullable().optional(),
  tipo_contrato_previsto: z.enum(TIPOS_VINCULO).optional(),
  missao: z.string().trim().max(4000).optional(),
  atividades: esquemaAtividades.optional(),
  cha: esquemaCha.optional(),
  observacoes: z.string().trim().max(4000).optional(),
  descricao: z.string().trim().max(4000).optional(),
  inicio_vigencia: esquemaData,
};

export const esquemaCriacaoCargo = z
  .object({
    ...camposVersaoCargo,
    faixa_min: esquemaSalario.optional(),
    faixa_max: esquemaSalario.optional(),
  })
  .superRefine((dados, contexto) => {
    const temMin = dados.faixa_min !== undefined;
    const temMax = dados.faixa_max !== undefined;
    if (temMin !== temMax) {
      contexto.addIssue({
        code: "custom",
        path: [temMin ? "faixa_max" : "faixa_min"],
        message: "Informe a faixa completa (mínimo e máximo)",
      });
    }
    if (
      dados.faixa_min !== undefined &&
      dados.faixa_max !== undefined &&
      dados.faixa_max < dados.faixa_min
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["faixa_max"],
        message: "Faixa máxima deve ser maior ou igual à mínima",
      });
    }
  });

export type CriacaoCargo = z.infer<typeof esquemaCriacaoCargo>;

export const esquemaNovaVersaoCargo = z.object(camposVersaoCargo);

export type NovaVersaoCargo = z.infer<typeof esquemaNovaVersaoCargo>;

export const esquemaNovaFaixaSalarial = z
  .object({
    faixa_min: esquemaSalario,
    faixa_max: esquemaSalario,
    inicio_vigencia: esquemaData,
  })
  .refine((dados) => dados.faixa_max >= dados.faixa_min, {
    path: ["faixa_max"],
    message: "Faixa máxima deve ser maior ou igual à mínima",
  });

export type NovaFaixaSalarial = z.infer<typeof esquemaNovaFaixaSalarial>;

// ------------------------------------------------------------------ estabelecimento

const esquemaCnpj = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{14}$/.test(valor), {
    message: "CNPJ deve ter 14 dígitos",
  });

const camposVersaoEstabelecimento = {
  razao_social: z.string().trim().min(2, "Informe a razão social").max(200),
  unidade: z.string().trim().min(2, "Informe o nome da unidade").max(120),
  endereco_resumido: z.string().trim().max(300).optional(),
  inicio_vigencia: esquemaData,
};

export const esquemaCriacaoEstabelecimento = z.object({
  cnpj: esquemaCnpj,
  ...camposVersaoEstabelecimento,
});

export type CriacaoEstabelecimento = z.infer<
  typeof esquemaCriacaoEstabelecimento
>;

export const esquemaNovaVersaoEstabelecimento = z.object(
  camposVersaoEstabelecimento
);

export type NovaVersaoEstabelecimento = z.infer<
  typeof esquemaNovaVersaoEstabelecimento
>;

// ------------------------------------------------------------------ relatórios (chave relatorio.ver)

/**
 * Piso de anonimato dos recortes que cruzam dado autodeclarado ou de terceiro
 * (gênero, faixa de idade, composição familiar): recorte com menos que isto é
 * SUPRIMIDO — devolvemos null em vez do número, porque num quadro de 68 pessoas
 * "1 pessoa de gênero outro na Loja Centro" identifica alguém.
 */
export const MINIMO_POR_RECORTE = 5;

export const FAIXAS_IDADE = [
  { chave: "ate_24", rotulo: "Até 24 anos", min: 0, max: 24 },
  { chave: "25_34", rotulo: "25 a 34 anos", min: 25, max: 34 },
  { chave: "35_44", rotulo: "35 a 44 anos", min: 35, max: 44 },
  { chave: "45_54", rotulo: "45 a 54 anos", min: 45, max: 54 },
  { chave: "55_mais", rotulo: "55 anos ou mais", min: 55, max: 200 },
] as const;

export type FaixaIdade = (typeof FAIXAS_IDADE)[number]["chave"];

/** Idade em que a criança deixa de contar como "criança" no relatório. */
export const IDADE_LIMITE_CRIANCA = 12;

export const esquemaFiltroAniversariantes = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  estabelecimento_id: z.coerce.number().int().positive().optional(),
});

export type FiltroAniversariantes = z.infer<
  typeof esquemaFiltroAniversariantes
>;
