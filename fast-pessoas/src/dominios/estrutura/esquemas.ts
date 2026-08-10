import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

// Estrutura do grupo: os catálogos administráveis por trás dos TRÊS campos que
// o dono separou (migration 0047).
//
//   REGISTRO        rh.empresa_grupo   — em qual empresa do grupo (CNPJ)
//   LOTAÇÃO         rh.estabelecimento — em que local físico (domínio colaboradores)
//   CENTRO DE CUSTO rh.centro_custo    — onde o custo cai
//
// Regra do dono: nada chumbado. Empresa e centro de custo se criam, se renomeiam
// e se inativam pela tela. Renomear é VERSÃO NOVA com vigência — o nome de
// fevereiro continua sendo o nome de fevereiro. Inativar tira dos seletores e
// não apaga nada: quem esteve registrado ali continua tendo passado.

/** CNPJ é opcional: a diretoria nomeia a empresa antes de o DP passar o número. */
const esquemaCnpjOpcional = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => valor === "" || /^\d{14}$/.test(valor), {
    message: "CNPJ deve ter 14 dígitos",
  })
  .transform((valor) => (valor === "" ? null : valor))
  .nullable()
  .optional();

export const TIPOS_EMPRESA = ["matriz", "filial"] as const;
export type TipoEmpresa = (typeof TIPOS_EMPRESA)[number];

export const ROTULOS_TIPO_EMPRESA: Record<TipoEmpresa, string> = {
  matriz: "Matriz",
  filial: "Filial",
};

// ------------------------------------------------------------------ empresa do grupo

const camposVersaoEmpresa = {
  razao_social: z.string().trim().max(200).optional(),
  nome_fantasia: z
    .string()
    .trim()
    .min(2, "Informe o nome da empresa")
    .max(120),
  tipo: z.enum(TIPOS_EMPRESA),
  inicio_vigencia: esquemaData,
};

export const esquemaCriacaoEmpresa = z.object({
  cnpj: esquemaCnpjOpcional,
  ...camposVersaoEmpresa,
});
export type CriacaoEmpresa = z.infer<typeof esquemaCriacaoEmpresa>;

/** Renomear = nova versão. A anterior é encerrada, nunca reescrita. */
export const esquemaNovaVersaoEmpresa = z.object({
  ...camposVersaoEmpresa,
  cnpj: esquemaCnpjOpcional,
});
export type NovaVersaoEmpresa = z.infer<typeof esquemaNovaVersaoEmpresa>;

// ------------------------------------------------------------------ centro de custo

export const esquemaCriacaoCentroCusto = z.object({
  empresa_id: z.number().int().positive(),
  codigo: z.string().trim().min(1, "Informe o código").max(30),
  nome: z.string().trim().min(2, "Informe o nome do centro de custo").max(120),
  inicio_vigencia: esquemaData,
});
export type CriacaoCentroCusto = z.infer<typeof esquemaCriacaoCentroCusto>;

export const esquemaNovaVersaoCentroCusto = z.object({
  nome: z.string().trim().min(2, "Informe o nome do centro de custo").max(120),
  inicio_vigencia: esquemaData,
});
export type NovaVersaoCentroCusto = z.infer<
  typeof esquemaNovaVersaoCentroCusto
>;

// ------------------------------------------------------------------ inativação
// Um único verbo para os três catálogos: liga e desliga para uso NOVO.

export const esquemaInativacao = z.object({ inativo: z.boolean() });
export type Inativacao = z.infer<typeof esquemaInativacao>;

// ------------------------------------------------------------------ filtro pelos três
// Os três campos são INDEPENDENTES e o filtro é COMBINÁVEL: os que vierem
// preenchidos entram todos juntos, em E. Ninguém é obrigatório e nenhum tem
// valor padrão — filtro em branco é "todo mundo", que é justamente a leitura
// que o sistema já dava antes desta onda.
//
// Este é o filtro de LEITURA, e por isso ele mora aqui e não em cada domínio:
// lista de colaboradores, relatórios, organograma e folha fazem a mesma
// pergunta ("quem está registrado em X, trabalhando em Y, custando em Z") e
// precisam responder igual.

export const esquemaFiltroEstrutura = z.object({
  /** REGISTRO — rh.empresa_grupo.id */
  empresa_id: z.coerce.number().int().positive().optional(),
  /** LOTAÇÃO — rh.estabelecimento.id (o local físico) */
  estabelecimento_id: z.coerce.number().int().positive().optional(),
  /** CENTRO DE CUSTO — rh.centro_custo.id */
  centro_custo_id: z.coerce.number().int().positive().optional(),
});

export type FiltroEstrutura = z.infer<typeof esquemaFiltroEstrutura>;

/** O que a rota entrega ao safeParse — undefined quando o parâmetro não veio. */
export function lerFiltroEstrutura(parametros: URLSearchParams): {
  empresa_id: string | undefined;
  estabelecimento_id: string | undefined;
  centro_custo_id: string | undefined;
} {
  return {
    empresa_id: parametros.get("empresa_id") || undefined,
    estabelecimento_id: parametros.get("estabelecimento_id") || undefined,
    centro_custo_id: parametros.get("centro_custo_id") || undefined,
  };
}

/** Opção de seletor: o catálogo já resolvido em nome legível. */
export interface OpcaoEstrutura {
  id: number;
  nome: string;
}

export interface OpcoesFiltroEstrutura {
  empresas: OpcaoEstrutura[];
  lotacoes: OpcaoEstrutura[];
  centros_custo: OpcaoEstrutura[];
}
