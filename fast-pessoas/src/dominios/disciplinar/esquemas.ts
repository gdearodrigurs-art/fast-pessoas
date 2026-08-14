import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

// ===========================================================================
// Domínio DISCIPLINAR (migration 0080). Registrar uma medida disciplinar
// (advertência, suspensão) sobre um colaborador, de forma TIPADA (catálogo
// administrável — eixo 9), AUDITÁVEL (trilha) e RESTRITA (só rh.disciplinar.ver;
// gestor NÃO vê). A suspensão abre janela (inicio/fim); a advertência é pontual.
//
// O `com_periodo` é atributo do TIPO, e o catálogo mora no banco: por isso a
// regra "suspensão exige inicio/fim, advertência não os tem" NÃO cabe no zod
// puro (o zod não conhece o catálogo). Ela é conferida no SERVIÇO, com a
// função pura `validarPeriodoDaMedida` deste arquivo — testável sem banco.
// ===========================================================================

// O mesmo formato que o banco impõe em rh.tipo_medida_disciplinar.chave.
const FORMATO_CHAVE = /^[a-z][a-z0-9_]*$/;

/**
 * Nome digitado → chave estável ("Comunicado formal" → "comunicado_formal").
 * Copiado do molde do catálogo de devolução (desligamento/esquemas.ts:149): a
 * chave é a identidade e é derivada UMA vez, na criação; renomear depois mexe
 * só no nome, para o histórico já gravado continuar apontando à mesma linha.
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
  return /^[a-z]/.test(base) ? base : `tipo_${base}`;
}

// ------------------------------------------------------------------ registro da medida

export const esquemaRegistroMedida = z
  .object({
    tipo_chave: z
      .string()
      .trim()
      .min(1, "Escolha o tipo da medida")
      .max(60)
      .regex(FORMATO_CHAVE, "Tipo inválido"),
    descricao: z.string().trim().min(3, "Descreva a medida").max(4000),
    impacto: z.string().trim().max(2000).optional(),
    acao_combinada: z.string().trim().max(2000).optional(),
    // A data do fato.
    aplicada_em: esquemaData,
    // Janela da suspensão (só os tipos com_periodo). O zod garante a coerência
    // ESTRUTURAL (fim exige inicio, fim não antecede inicio — espelha a CHECK
    // do banco); a EXIGÊNCIA por tipo é do serviço.
    inicio: esquemaData.optional(),
    fim: esquemaData.optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.fim && !dados.inicio) {
      contexto.addIssue({
        code: "custom",
        path: ["inicio"],
        message: "Informe o início do período.",
      });
    }
    if (dados.inicio && dados.fim && dados.fim < dados.inicio) {
      contexto.addIssue({
        code: "custom",
        path: ["fim"],
        message: "O fim não pode ser anterior ao início.",
      });
    }
  });

export type RegistroMedida = z.infer<typeof esquemaRegistroMedida>;

/**
 * Problema de período que a tela transforma em erro de campo. Devolvido em vez
 * de lançado para esta função continuar PURA (sem ErroHttp, que arrasta
 * next/headers e quebra o teste sem banco).
 */
export interface ProblemaPeriodo {
  campo: "inicio" | "fim";
  mensagem: string;
}

/**
 * A regra que o zod não pode saber sozinho: se o TIPO abre janela
 * (`com_periodo`), inicio E fim são obrigatórios; se não abre, os dois têm que
 * vir vazios. Além disso o fim nunca antecede o inicio. Pura de propósito — é o
 * caso que o teste sem banco cobre.
 */
export function validarPeriodoDaMedida(
  comPeriodo: boolean,
  dados: { inicio?: string | null; fim?: string | null }
): ProblemaPeriodo | null {
  const temInicio = Boolean(dados.inicio);
  const temFim = Boolean(dados.fim);
  if (comPeriodo) {
    if (!temInicio) {
      return { campo: "inicio", mensagem: "Este tipo exige a data de início." };
    }
    if (!temFim) {
      return { campo: "fim", mensagem: "Este tipo exige a data de fim." };
    }
  } else if (temInicio || temFim) {
    return {
      campo: "inicio",
      mensagem:
        "Este tipo de medida não tem período — deixe início e fim em branco.",
    };
  }
  if (dados.inicio && dados.fim && dados.fim < dados.inicio) {
    return { campo: "fim", mensagem: "O fim não pode ser anterior ao início." };
  }
  return null;
}

// ------------------------------------------------------------------ catálogo de tipos (administrável, molde 0054)

export const esquemaCriacaoTipoMedida = z.object({
  nome: z.string().trim().min(2, "Informe o nome do tipo").max(120),
  // Marca o tipo que abre janela de datas (a suspensão). Atributo do tipo, não
  // lista chumbada de "quais tipos têm período".
  com_periodo: z.boolean().optional().default(false),
});

export type CriacaoTipoMedida = z.infer<typeof esquemaCriacaoTipoMedida>;

export const esquemaInativacaoTipoMedida = z.object({ inativo: z.boolean() });

export type InativacaoTipoMedida = z.infer<typeof esquemaInativacaoTipoMedida>;
