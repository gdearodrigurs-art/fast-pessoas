import { z } from "zod";
import {
  cpfValido,
  hojeNaOperacao,
  TIPOS_VINCULO,
  TipoVinculo,
} from "../colaboradores/esquemas";

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

/**
 * Dinheiro na borda. A frase entra por parâmetro porque a mensagem que importa
 * é a do campo AUSENTE: sem ela o DP recebe "expected number, received
 * undefined" quando esquece o valor da pessoa, e não há tela que traduza isso.
 */
function esquemaDinheiro(frase: string) {
  return z
    .number({ error: frase })
    .min(0, "Valor não pode ser negativo")
    .max(9_999_999, "Valor acima do limite")
    .transform((valor) => Math.round(valor * 100) / 100);
}

const esquemaValor = esquemaDinheiro("Informe um valor em reais");

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

// A regra de elegibilidade é lida por STATUS, não por data: o `LEFT JOIN` de
// `SELECT_BENEFICIO` (repositorio.ts) casa por `r.status = 'ativa'`, e é esse
// mesmo join que alimenta o catálogo do colaborador, o valor sugerido em
// `efetivarAdesao` e o critério que decide o que atravessa a transferência
// entre CNPJs. Logo, versão gravada hoje com início em 2027 passa a mandar
// HOJE — e ainda encerra a versão que de fato vale com `fim_vigencia` em
// 2026-12-31, abrindo um buraco de meses na leitura por data.
//
// A guarda que vale é a do serviço (`exigirVigenciaNaoFutura`, dentro da mesma
// transação da escrita, lendo o "hoje" do banco no fuso da operação). Esta
// aqui é a borda: recusa antes de abrir transação e dá o campo ao formulário.
const esquemaInicioVigencia = esquemaData.refine(
  (valor) => valor <= hojeNaOperacao(),
  {
    message:
      "O início da vigência não pode ser no futuro: a versão nova passa a " +
      "valer assim que é gravada, e o sistema não tem regra agendada.",
  }
);

export const esquemaNovaRegra = z.object({
  criterio: esquemaCriterio.optional().default({}),
  valor_padrao: esquemaValor.nullable().optional(),
  desconto_padrao: esquemaValor.nullable().optional(),
  inicio_vigencia: esquemaInicioVigencia,
});

export type NovaRegra = z.infer<typeof esquemaNovaRegra>;

// ------------------------------------------------------------------ adesão

// A ADESÃO NÃO SE PEDE. Decisão da Diretora de Pessoas ("benefícios sem
// candidatura, só reajuste", docs/11 §3; onda H1 em docs/10): a pessoa já entra
// com direito e quem concede é o DP. Por isso não existe mais um
// `esquemaSolicitacaoAdesao` — a única porta de entrada de adesão é
// `esquemaEfetivacaoAdesao`, abaixo, e ela exige o valor DAQUELA pessoa.
// O cancelamento continua sendo pedido pelo titular: o que a diretora tirou foi
// a candidatura, não a voz de quem quer sair.

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

// CONCESSÃO PELO DP — o valor é DAQUELA PESSOA, e alguém tem de escolhê-lo.
//
// `valor` e `desconto` eram opcionais, e o serviço caía no `valor_padrao` da
// regra vigente quando vinham em branco. Isso é o defeito conhecido deste
// projeto — campo que nasce escolhido pelo sistema sem ninguém escolher: o DP
// dava Enter e o VT daquela pessoa virava o R$ 264,00 da tabela, sem que nada
// na tela dissesse que uma escolha tinha sido feita. Mediu-se em 06/08/2026, no
// banco de desenvolvimento: em 4 dos 6 benefícios TODAS as adesões tinham o
// mesmo valor (VR: 69 adesões, 1 valor; VA: 59, 1; farmácia: 62, 1). A onda H2
// é literalmente "valor individual por pessoa (VT de R$ 600 para um, R$ 720
// para outro)"; com o preenchimento silencioso, todo mundo recebia o mesmo.
//
// Agora os dois são OBRIGATÓRIOS. A regra vigente continua existindo e continua
// dando o número — mas como SUGESTÃO que a tela preenche e marca como sugestão,
// não como preenchimento invisível do servidor. Sem desconto é `0`, digitado;
// zero escolhido e ausência de escolha deixam de ser a mesma coisa.
export const esquemaEfetivacaoAdesao = z.object({
  colaborador_id: z.number().int().positive(),
  beneficio_id: z.number().int().positive(),
  inicio: esquemaData,
  valor: esquemaDinheiro("Informe o valor do benefício para esta pessoa"),
  desconto: esquemaDinheiro(
    "Informe o desconto em folha para esta pessoa (0 se não há desconto)"
  ),
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
/** Onda H3 — pedido de revisão de valor, migration 0057. */
export const CHAVE_TIPO_DEMANDA_REVISAO = "revisao_valor_beneficio";

export type NaturezaSolicitacao = "adesao" | "cancelamento";

export const ROTULOS_NATUREZA: Record<NaturezaSolicitacao, string> = {
  adesao: "Adesão",
  cancelamento: "Cancelamento",
};

const PREFIXOS: Record<NaturezaSolicitacao, string> = {
  adesao: "Adesão ao benefício",
  cancelamento: "Cancelamento do benefício",
};

/**
 * Descrição estruturada da demanda — a chave do benefício viaja no texto.
 *
 * `adesao` continua no tipo e no prefixo porque ainda é preciso LER as demandas
 * de adesão abertas antes de a candidatura acabar; ninguém mais as ESCREVE.
 */
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
