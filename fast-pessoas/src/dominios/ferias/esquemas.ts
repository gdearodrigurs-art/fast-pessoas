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

/**
 * LIMITES LEGAIS DO GOZO, em dias — e por que estes NÃO são cadastro.
 *
 * A regra do dono é que limite de negócio seja do usuário. Estes quatro não
 * são limite de negócio: são o texto da CLT. O mínimo de 5 dias por período
 * fracionado é o art. 134 §1º; o máximo de 30 por período aquisitivo é o
 * art. 130; o abono pecuniário de até 1/3 (10 dias de 30) é o art. 143.
 * Empresa nenhuma escolhe outro valor — quem escolhesse estaria gravando uma
 * programação que a lei não admite, e o CHECK de rh.programacao_ferias
 * (migration 0007) recusaria a linha de qualquer jeito.
 *
 * O que estava errado não era o valor: era estar escrito TRÊS vezes — no zod
 * abaixo, no CHECK do banco e no `min`/`max` do formulário de /ferias —, sem
 * nada que garantisse que as três cópias continuassem iguais. Agora o número
 * aparece uma vez, aqui, e a tela importa daqui.
 */
export const DIAS_GOZO_MINIMO = 5;
export const DIAS_GOZO_MAXIMO = 30;
export const ABONO_DIAS_MINIMO = 0;
export const ABONO_DIAS_MAXIMO = 10;

export const esquemaCriacaoProgramacao = z.object({
  periodo_aquisitivo_id: z
    .number("Escolha o período aquisitivo")
    .int("Período inválido")
    .positive("Período inválido"),
  inicio: esquemaData,
  dias: z
    .number("Informe os dias de gozo")
    .int("Dias inválidos")
    .min(
      DIAS_GOZO_MINIMO,
      `Mínimo de ${DIAS_GOZO_MINIMO} dias por período (art. 134 §1º)`
    )
    .max(DIAS_GOZO_MAXIMO, `Máximo de ${DIAS_GOZO_MAXIMO} dias`),
  // Ausência de abono é 0, e é AQUI que isso está dito — uma vez, com a
  // citação. A tela manda a chave ausente quando o campo fica em branco, em
  // vez de escrever um zero que ninguém escolheu no corpo do POST.
  abono_dias: z
    .number("Abono inválido")
    .int("Abono inválido")
    .min(ABONO_DIAS_MINIMO, "Abono inválido")
    .max(
      ABONO_DIAS_MAXIMO,
      `Abono pecuniário limitado a ${ABONO_DIAS_MAXIMO} dias (1/3 — art. 143)`
    )
    .default(ABONO_DIAS_MINIMO),
});

export type CriacaoProgramacao = z.infer<typeof esquemaCriacaoProgramacao>;

// ------------------------------------------------------------------ alerta de vencimento

/**
 * FAIXAS DE ANTECEDÊNCIA DO PAINEL DE VENCIMENTO — decisão escrita.
 *
 * A varredura de números de negócio parou aqui perguntando se 30/60/90 são
 * "limite" no sentido da regra do dono (limite é do usuário, não do código).
 * A resposta é NÃO, e a razão importa mais que o veredito:
 *
 * 1. O único prazo de férias que a lei fixa é o CONCESSIVO — art. 134/137: não
 *    concedidas no prazo, pagam em dobro. Esse prazo NÃO é literal nenhum
 *    aqui: é a data gravada em rh.periodo_aquisitivo.limite_concessivo, uma
 *    por pessoa e por período, e o teste que a usa é `diasAteLimite < 0`, isto
 *    é "a data já passou". Comparar com zero não é escolher número.
 *    (O número que DERIVA essa data — MESES_LIMITE_CONCESSIVO, em servico.ts —
 *    esse sim é limite chumbado, e está denunciado como tal.)
 *
 * 2. 30/60/90 não vêm do art. 137, apesar de a fama dizer que vêm. São uma
 *    escada de aviso antecipado. O critério que separa uma coisa da outra, e
 *    que vale para o sistema inteiro: um número é REGRA quando muda o
 *    resultado que o sistema afirma sobre a pessoa (direito, valor, prazo,
 *    permissão); é APRESENTAÇÃO quando só muda a cor, a ordem ou a palavra com
 *    que o MESMO resultado é mostrado. Trocar 60 por 45 aqui não adianta nem
 *    atrasa o vencimento de ninguém, não muda o dobro do art. 137 e não muda
 *    quantos dias a pessoa tem: muda quando a etiqueta fica amarela. A data
 *    exata e os dias até ela já aparecem, em algarismo, na mesma linha da
 *    tabela — a faixa é triagem visual em cima de um dado que está à vista.
 *
 * 3. Se algum dia o DP pedir outras faixas, a mudança certa NÃO é trocar estes
 *    números: é virar cadastro de faixas (nome + dias + cor), porque a regra
 *    do dono é adicionar, excluir e renomear livremente — e três slots fixos
 *    não fazem isso. Enquanto o pedido não existir, três slots fixos e
 *    honestos valem mais que um cadastro que ninguém vai usar.
 *
 * O que MUDOU: o número aparece uma vez só. Antes, `<= 30` e o rótulo
 * "Vence em até 30 dias" eram duas cópias que podiam se separar em silêncio, e
 * a tela ainda tinha uma terceira ("vencendo em até 30 dias", no cartão).
 */
export const FAIXAS_ALERTA_VENCIMENTO = {
  ate_30: 30,
  ate_60: 60,
  ate_90: 90,
} as const;

export type NivelAlerta =
  | "vencida"
  | keyof typeof FAIXAS_ALERTA_VENCIMENTO
  | null;

export function nivelAlerta(diasAteLimite: number): NivelAlerta {
  if (diasAteLimite < 0) return "vencida";
  for (const [nivel, dias] of Object.entries(FAIXAS_ALERTA_VENCIMENTO)) {
    if (diasAteLimite <= dias) {
      return nivel as keyof typeof FAIXAS_ALERTA_VENCIMENTO;
    }
  }
  return null;
}

export const ROTULOS_NIVEL_ALERTA: Record<Exclude<NivelAlerta, null>, string> =
  {
    vencida: "VENCIDA — dobro (art. 137)",
    ate_30: `Vence em até ${FAIXAS_ALERTA_VENCIMENTO.ate_30} dias`,
    ate_60: `Vence em até ${FAIXAS_ALERTA_VENCIMENTO.ate_60} dias`,
    ate_90: `Vence em até ${FAIXAS_ALERTA_VENCIMENTO.ate_90} dias`,
  };
