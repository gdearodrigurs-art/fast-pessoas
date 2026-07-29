import { z } from "zod";

// ------------------------------------------------------------------ período aquisitivo

export const STATUS_PERIODO = [
  "em_aberto",
  "programado_parcial",
  "gozado",
  "vencido",
] as const;

export type StatusPeriodo = (typeof STATUS_PERIODO)[number];

export const ROTULOS_STATUS_PERIODO: Record<StatusPeriodo, string> = {
  em_aberto: "Em aberto",
  programado_parcial: "Programado parcial",
  gozado: "Gozado",
  vencido: "Vencido",
};

// ------------------------------------------------------------------ programação

export const STATUS_PROGRAMACAO = [
  "solicitada",
  "aprovada",
  "recusada",
  "em_gozo",
  "concluida",
  "cancelada",
] as const;

export type StatusProgramacao = (typeof STATUS_PROGRAMACAO)[number];

export const ROTULOS_STATUS_PROGRAMACAO: Record<StatusProgramacao, string> = {
  solicitada: "Aguardando aprovação",
  aprovada: "Aprovada",
  recusada: "Recusada",
  em_gozo: "Em gozo",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

export const esquemaCriacaoProgramacao = z.object({
  periodo_aquisitivo_id: z
    .number("Escolha o período aquisitivo")
    .int("Período inválido")
    .positive("Período inválido"),
  inicio: esquemaData,
  dias: z
    .number("Informe os dias de gozo")
    .int("Dias inválidos")
    .min(5, "Mínimo de 5 dias por período (art. 134 §1º)")
    .max(30, "Máximo de 30 dias"),
  abono_dias: z
    .number("Abono inválido")
    .int("Abono inválido")
    .min(0, "Abono inválido")
    .max(10, "Abono pecuniário limitado a 10 dias (1/3 — art. 143)")
    .default(0),
});

export type CriacaoProgramacao = z.infer<typeof esquemaCriacaoProgramacao>;

// ------------------------------------------------------------------ alerta de vencimento

/** Faixas do painel de vencimento (art. 137 — vencida = pagamento em dobro). */
export type NivelAlerta = "vencida" | "ate_30" | "ate_60" | "ate_90" | null;

export function nivelAlerta(diasAteLimite: number): NivelAlerta {
  if (diasAteLimite < 0) return "vencida";
  if (diasAteLimite <= 30) return "ate_30";
  if (diasAteLimite <= 60) return "ate_60";
  if (diasAteLimite <= 90) return "ate_90";
  return null;
}

export const ROTULOS_NIVEL_ALERTA: Record<Exclude<NivelAlerta, null>, string> =
  {
    vencida: "VENCIDA — dobro (art. 137)",
    ate_30: "Vence em até 30 dias",
    ate_60: "Vence em até 60 dias",
    ate_90: "Vence em até 90 dias",
  };
