import { z } from "zod";
import { cpfValido, TIPOS_VINCULO, TipoVinculo } from "../colaboradores/esquemas";

// ------------------------------------------------------------------ benefício

export const CATEGORIAS_BENEFICIO = [
  "vt",
  "vr_va",
  "saude",
  "odonto",
  "convenio",
  "outro",
] as const;

export type CategoriaBeneficio = (typeof CATEGORIAS_BENEFICIO)[number];

export const ROTULOS_CATEGORIA: Record<CategoriaBeneficio, string> = {
  vt: "Vale-transporte",
  vr_va: "VR/VA",
  saude: "Plano de saúde",
  odonto: "Plano odontológico",
  convenio: "Convênio/parceria",
  outro: "Outro",
};

export const STATUS_ADESAO = ["ativa", "suspensa", "cancelada"] as const;

export type StatusAdesao = (typeof STATUS_ADESAO)[number];

export const ROTULOS_STATUS_ADESAO: Record<StatusAdesao, string> = {
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
};

export const PARENTESCOS = ["filho", "conjuge", "outro"] as const;

export type Parentesco = (typeof PARENTESCOS)[number];

export const ROTULOS_PARENTESCO: Record<Parentesco, string> = {
  filho: "Filho(a)",
  conjuge: "Cônjuge",
  outro: "Outro",
};

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

const esquemaValor = z
  .number()
  .min(0, "Valor não pode ser negativo")
  .max(9_999_999, "Valor acima do limite")
  .transform((valor) => Math.round(valor * 100) / 100);

const esquemaCpf = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{11}$/.test(valor), {
    message: "CPF deve ter 11 dígitos",
  })
  .refine(cpfValido, { message: "CPF inválido" });

export const esquemaCriacaoBeneficio = z.object({
  chave: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z][a-z0-9_]{1,39}$/,
      "Chave: minúsculas, números e _ (2 a 40 caracteres)"
    ),
  nome: z.string().trim().min(2, "Informe o nome do benefício").max(120),
  categoria: z.enum(CATEGORIAS_BENEFICIO),
});

export type CriacaoBeneficio = z.infer<typeof esquemaCriacaoBeneficio>;

export const esquemaAtualizacaoBeneficio = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome do benefício").max(120).optional(),
    categoria: z.enum(CATEGORIAS_BENEFICIO).optional(),
    ativo: z.boolean().optional(),
  })
  .refine(
    (dados) => Object.values(dados).some((valor) => valor !== undefined),
    { message: "Informe ao menos um campo para atualizar" }
  );

export type AtualizacaoBeneficio = z.infer<typeof esquemaAtualizacaoBeneficio>;

// ------------------------------------------------------------------ regra de elegibilidade

// Critério simples do MVP: tipos de vínculo e/ou unidades (estabelecimentos).
// Lista ausente/vazia = sem restrição naquela dimensão.
export const esquemaCriterio = z.strictObject({
  tipos_vinculo: z.array(z.enum(TIPOS_VINCULO)).max(TIPOS_VINCULO.length).optional(),
  unidades: z.array(z.number().int().positive()).max(100).optional(),
});

export type Criterio = z.infer<typeof esquemaCriterio>;

export function atendeCriterio(
  criterio: Criterio,
  perfil: { tipo_vinculo: TipoVinculo; estabelecimento_id: number | null }
): boolean {
  if (
    criterio.tipos_vinculo &&
    criterio.tipos_vinculo.length > 0 &&
    !criterio.tipos_vinculo.includes(perfil.tipo_vinculo)
  ) {
    return false;
  }
  if (criterio.unidades && criterio.unidades.length > 0) {
    if (perfil.estabelecimento_id === null) return false;
    if (!criterio.unidades.includes(perfil.estabelecimento_id)) return false;
  }
  return true;
}

/** Frase legível do critério (para tela e para o diff da auditoria). */
export function descreverCriterio(
  criterio: Criterio,
  rotulosVinculo: Record<TipoVinculo, string>,
  nomesUnidades?: Map<number, string>
): string {
  const partes: string[] = [];
  if (criterio.tipos_vinculo && criterio.tipos_vinculo.length > 0) {
    partes.push(
      `Vínculos: ${criterio.tipos_vinculo.map((t) => rotulosVinculo[t]).join(", ")}`
    );
  }
  if (criterio.unidades && criterio.unidades.length > 0) {
    partes.push(
      `Unidades: ${criterio.unidades
        .map((id) => nomesUnidades?.get(id) ?? `#${id}`)
        .join(", ")}`
    );
  }
  return partes.length > 0 ? partes.join(" · ") : "Todos os colaboradores";
}

export const esquemaNovaRegra = z.object({
  criterio: esquemaCriterio.optional().default({}),
  valor_padrao: esquemaValor.nullable().optional(),
  desconto_padrao: esquemaValor.nullable().optional(),
  inicio_vigencia: esquemaData,
});

export type NovaRegra = z.infer<typeof esquemaNovaRegra>;

// ------------------------------------------------------------------ adesão

export const esquemaSolicitacaoAdesao = z.object({
  beneficio_id: z.number().int().positive(),
  observacao: z.string().trim().max(2000, "Observação longa demais").optional(),
});

export type SolicitacaoAdesao = z.infer<typeof esquemaSolicitacaoAdesao>;

export const esquemaSolicitacaoCancelamento = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "Informe o motivo do cancelamento")
    .max(2000, "Motivo longo demais"),
});

export type SolicitacaoCancelamento = z.infer<
  typeof esquemaSolicitacaoCancelamento
>;

export const esquemaEfetivacaoAdesao = z.object({
  colaborador_id: z.number().int().positive(),
  beneficio_id: z.number().int().positive(),
  inicio: esquemaData,
  valor: esquemaValor.optional(),
  desconto: esquemaValor.optional(),
  demanda_id: z.number().int().positive().optional(),
});

export type EfetivacaoAdesao = z.infer<typeof esquemaEfetivacaoAdesao>;

export const esquemaCancelamentoAdesao = z.object({
  fim: esquemaData,
  motivo: z.string().trim().max(2000, "Motivo longo demais").optional(),
  demanda_id: z.number().int().positive().optional(),
});

export type CancelamentoAdesao = z.infer<typeof esquemaCancelamentoAdesao>;

export const esquemaNegativaSolicitacao = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "Informe o motivo da negativa")
    .max(2000, "Motivo longo demais"),
});

export type NegativaSolicitacao = z.infer<typeof esquemaNegativaSolicitacao>;

// ------------------------------------------------------------------ dependente (dado de terceiro — cadastro mínimo)

export const esquemaCriacaoDependente = z.object({
  colaborador_id: z.number().int().positive(),
  nome: z.string().trim().min(3, "Informe o nome do dependente").max(200),
  nascimento: esquemaData,
  parentesco: z.enum(PARENTESCOS),
  cpf: esquemaCpf.optional(),
});

export type CriacaoDependente = z.infer<typeof esquemaCriacaoDependente>;

export const esquemaAtualizacaoDependente = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome do dependente").max(200).optional(),
    nascimento: esquemaData.optional(),
    parentesco: z.enum(PARENTESCOS).optional(),
    cpf: esquemaCpf.nullable().optional(),
  })
  .refine(
    (dados) => Object.values(dados).some((valor) => valor !== undefined),
    { message: "Informe ao menos um campo para atualizar" }
  );

export type AtualizacaoDependente = z.infer<typeof esquemaAtualizacaoDependente>;

// ------------------------------------------------------------------ ponte com o motor de demandas

export const CHAVE_TIPO_DEMANDA_BENEFICIO = "adesao_beneficio";

export type NaturezaSolicitacao = "adesao" | "cancelamento";

export const ROTULOS_NATUREZA: Record<NaturezaSolicitacao, string> = {
  adesao: "Adesão",
  cancelamento: "Cancelamento",
};

const PREFIXOS: Record<NaturezaSolicitacao, string> = {
  adesao: "Adesão ao benefício",
  cancelamento: "Cancelamento do benefício",
};

/** Descrição estruturada da demanda — a chave do benefício viaja no texto. */
export function montarDescricaoSolicitacao(
  natureza: NaturezaSolicitacao,
  nome: string,
  chave: string,
  complemento?: string
): string {
  const base = `${PREFIXOS[natureza]} "${nome}" (chave: ${chave}).`;
  if (!complemento) return base;
  const rotulo = natureza === "adesao" ? "Observações" : "Motivo";
  return `${base}\n\n${rotulo}: ${complemento}`;
}

const PADRAO_SOLICITACAO =
  /^(Adesão ao benefício|Cancelamento do benefício) ".*" \(chave: ([a-z][a-z0-9_]{1,39})\)\./;

/** Lê natureza e chave do benefício de uma descrição gerada por este domínio. */
export function interpretarDescricaoSolicitacao(
  descricao: string
): { natureza: NaturezaSolicitacao; chave: string } | null {
  const resultado = PADRAO_SOLICITACAO.exec(descricao);
  if (!resultado) return null;
  return {
    natureza: resultado[1] === PREFIXOS.adesao ? "adesao" : "cancelamento",
    chave: resultado[2],
  };
}

export function formatarMoeda(valor: number | null): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}
