import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

export const NOTAS = [1, 2, 3, 4, 5] as const;

export type Nota = (typeof NOTAS)[number];

// Escala decidida em docs (06-clima.md): chorando (1) … sorrindo com estrelas (5).
export const EMOJIS_NOTA: Record<Nota, string> = {
  1: "😢",
  2: "🙁",
  3: "😐",
  4: "😄",
  5: "🤩",
};

export const ROTULOS_NOTA: Record<Nota, string> = {
  1: "Chorando",
  2: "Triste",
  3: "Neutro",
  4: "Sorrindo",
  5: "Sorrindo com estrelas",
};

// Texto fixo de transparência da tela do check-in (modelo confidencial com
// acesso restrito — decisão do usuário 2026-07-27).
export const AVISO_TRANSPARENCIA =
  "Suas respostas individuais são visíveis apenas à Diretoria de Pessoas; " +
  "seu gestor vê somente médias agregadas.";

export const esquemaRespostaCheckin = z.object({
  pergunta_versao_id: z.number().int().positive(),
  nota: z
    .number()
    .int()
    .min(1, "Nota deve estar entre 1 e 5")
    .max(5, "Nota deve estar entre 1 e 5"),
  comentario: z
    .string()
    .trim()
    .min(1, "Comentário não pode ser vazio")
    .max(2000, "Comentário deve ter no máximo 2000 caracteres")
    .optional(),
});

export type RespostaCheckin = z.infer<typeof esquemaRespostaCheckin>;

export const esquemaFiltroIndividual = z
  .object({
    inicio: esquemaData.optional(),
    fim: esquemaData.optional(),
    colaborador_id: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (dados) => !dados.inicio || !dados.fim || dados.inicio <= dados.fim,
    { message: "Início do período deve ser anterior ao fim", path: ["inicio"] }
  );

export type FiltroIndividual = z.infer<typeof esquemaFiltroIndividual>;
