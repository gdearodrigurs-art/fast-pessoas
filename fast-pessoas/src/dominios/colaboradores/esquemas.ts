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

// ------------------------------------------------------------------ alocação: os três campos
// REGISTRO (empresa_id), LOTAÇÃO (estabelecimento_id) e CENTRO DE CUSTO
// (centro_custo_id) são independentes e escolhidos SEPARADAMENTE — não há
// derivação de um pelo outro. Os três entram numa única linha de vigência
// (migration 0047): mudar um encerra a linha e abre outra.
// O centro de custo deixou de ser texto livre: é id de catálogo. Digitar
// "CC-100" com um zero a menos criava um centro de custo novo em silêncio.

export const esquemaDefinicaoLotacao = z.object({
  empresa_id: z.number().int().positive(),
  estabelecimento_id: z.number().int().positive(),
  centro_custo_id: z.number().int().positive(),
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

// ------------------------------------------------------------------ estabelecimento = LOTAÇÃO (local físico)
// Desde a migration 0047 o local físico não tem CNPJ nem razão social próprios —
// quem tem é a empresa do grupo (esquemas do domínio "estrutura"). Os dois
// campos continuam aceitos, opcionais, para não perder o que já estava
// preenchido e para o caso de o DP querer anotar o estabelecimento do eSocial.

export const esquemaCnpj = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{14}$/.test(valor), {
    message: "CNPJ deve ter 14 dígitos",
  });

/** Campo de CNPJ que aceita vazio como "ainda não informado". */
export const esquemaCnpjOpcional = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => valor === "" || /^\d{14}$/.test(valor), {
    message: "CNPJ deve ter 14 dígitos",
  })
  .transform((valor) => (valor === "" ? null : valor))
  .nullable()
  .optional();

const camposVersaoEstabelecimento = {
  razao_social: z.string().trim().max(200).optional(),
  unidade: z.string().trim().min(2, "Informe o nome da unidade").max(120),
  endereco_resumido: z.string().trim().max(300).optional(),
  inicio_vigencia: esquemaData,
};

export const esquemaCriacaoEstabelecimento = z.object({
  cnpj: esquemaCnpjOpcional,
  ...camposVersaoEstabelecimento,
});

export const esquemaInativacaoEstabelecimento = z.object({
  inativo: z.boolean(),
});

export type InativacaoEstabelecimento = z.infer<
  typeof esquemaInativacaoEstabelecimento
>;

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
 *
 * ESTE NÚMERO NÃO É A POLÍTICA — é o PADRÃO DE FÁBRICA dela. A política vigente
 * mora em sistema.parametro_privacidade.minimo_por_recorte (migration 0044) e é
 * administrável pela tela, porque o k certo depende do tamanho do quadro: 5
 * numa empresa de 68 pessoas, 10 numa de 900. Quem calcula relatório lê o
 * parâmetro (`lerMinimoPorRecorte()` no repositório de colaboradores); esta
 * constante só serve de DEFAULT da coluna e de fallback documentado.
 */
export const MINIMO_POR_RECORTE_PADRAO = 5;

/** Limites do k aceitos pela tela e pelo CHECK do banco (migration 0044). */
export const MINIMO_POR_RECORTE_MIN = 2;
export const MINIMO_POR_RECORTE_MAX = 100;

export const esquemaParametroPrivacidade = z.object({
  minimo_por_recorte: z
    .number("Informe o piso de anonimato")
    .int("O piso de anonimato é um número inteiro de pessoas")
    .min(
      MINIMO_POR_RECORTE_MIN,
      `O piso mínimo é ${MINIMO_POR_RECORTE_MIN}: com 1 não haveria supressão nenhuma`
    )
    .max(
      MINIMO_POR_RECORTE_MAX,
      `O piso máximo é ${MINIMO_POR_RECORTE_MAX}: acima disso todo recorte sai suprimido`
    ),
});

export type ParametroPrivacidade = z.infer<typeof esquemaParametroPrivacidade>;

export const FAIXAS_IDADE = [
  { chave: "ate_24", rotulo: "Até 24 anos", min: 0, max: 24 },
  { chave: "25_34", rotulo: "25 a 34 anos", min: 25, max: 34 },
  { chave: "35_44", rotulo: "35 a 44 anos", min: 35, max: 44 },
  { chave: "45_54", rotulo: "45 a 54 anos", min: 45, max: 54 },
  { chave: "55_mais", rotulo: "55 anos ou mais", min: 55, max: 200 },
] as const;

export type FaixaIdade = (typeof FAIXAS_IDADE)[number]["chave"];

/**
 * Última idade que ainda conta como "criança" no relatório — limite INCLUSIVO.
 * O agregado usa `idade <= IDADE_LIMITE_CRIANCA` (ver
 * `agregarComposicaoFamiliar` no repositório) e a tela lê "crianças de até 12
 * anos": os três lados dizem a mesma coisa. Mexer no número aqui muda o
 * relatório e o rótulo juntos, sem tocar em SQL.
 */
export const IDADE_LIMITE_CRIANCA = 12;

export const esquemaFiltroAniversariantes = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  estabelecimento_id: z.coerce.number().int().positive().optional(),
});

export type FiltroAniversariantes = z.infer<
  typeof esquemaFiltroAniversariantes
>;
