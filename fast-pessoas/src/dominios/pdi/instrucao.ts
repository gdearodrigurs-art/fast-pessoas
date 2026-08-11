import type { EntrevistaPdi } from "./esquemas";

/**
 * A INSTRUÇÃO da IA para escrever o PDI — o "playbook". Decisão do dono
 * (11/08/2026): v1 fica no código, num lugar só; depois vira catálogo versionado
 * administrável pelo RH (eixo 9). Quando isso acontecer, é só ler INSTRUCAO_PDI
 * do banco em vez daqui — o resto do fluxo não muda.
 *
 * A avaliação chega ANONIMIZADA (o serviço monta só campos não identificáveis;
 * nome/CPF/matrícula nunca entram). Os focos vêm da IA (nível 2) e o motor
 * genérico valida a sanidade depois.
 */

export interface CompetenciaAnonima {
  pilar: string;
  indicador: string;
  /** Nota 1–5. */
  nota: number;
}

export interface AvaliacaoAnonima {
  /** Contexto útil ao PDI, não identificador. Opcional em v1. */
  cargo?: string;
  modelo: string;
  percentual_final: number;
  faixa: string;
  recomendacao: string;
  competencias: CompetenciaAnonima[];
}

export const INSTRUCAO_PDI = [
  "Você é um business partner de RH sênior da Fast (distribuidora de materiais de construção).",
  "Escreve um Plano de Desenvolvimento Individual (PDI) em português do Brasil, claro e prático, na voz da empresa.",
  "",
  "Regras:",
  "1. Trabalhe SOMENTE com os dados fornecidos — nunca invente notas nem informações.",
  "2. Os dados vêm ANONIMIZADOS; refira-se sempre a 'o colaborador', nunca a um nome.",
  "3. Proponha de 1 a 4 focos de desenvolvimento, priorizando as competências de nota mais baixa (escala 1–5).",
  "4. Para cada foco: 'porque' ancorado nas notas, um 'objetivo' claro e de 1 a 3 'acoes' concretas, cada uma com um prazo dentro do horizonte informado.",
  "5. Se o contexto livre trouxer informação relevante, incorpore-a nas ações — sem repeti-la literalmente.",
  "6. 'pontos_cegos' fica VAZIO por enquanto (ainda não há autoavaliação para comparar).",
  "7. Escreva um 'resumo' curto (2 a 4 frases), em frases completas e bem pontuadas — sem emendas, repetições ou frases cortadas.",
  "8. Tom profissional e respeitoso; nada de julgamento pessoal, só desenvolvimento.",
].join("\n");

/** JSON Schema da saída (structured outputs). Sem min/maxLength (não suportado). */
export const ESQUEMA_SAIDA_PDI: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    focos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          competencia: { type: "string" },
          porque: { type: "string" },
          objetivo: { type: "string" },
          acoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                descricao: { type: "string" },
                prazo_sugerido: { type: "string" },
              },
              required: ["descricao", "prazo_sugerido"],
            },
          },
        },
        required: ["competencia", "porque", "objetivo", "acoes"],
      },
    },
    pontos_cegos: { type: "array", items: { type: "string" } },
    resumo: { type: "string" },
  },
  required: ["focos", "pontos_cegos", "resumo"],
};

/** Monta a mensagem do usuário: a avaliação anônima + os parâmetros da entrevista. */
export function montarPromptPdi(
  avaliacao: AvaliacaoAnonima,
  entrevista: EntrevistaPdi
): string {
  return [
    "Gere o PDI para esta avaliação (dados anonimizados):",
    "",
    "AVALIAÇÃO:",
    JSON.stringify(avaliacao, null, 2),
    "",
    "PARÂMETROS DA ENTREVISTA:",
    JSON.stringify(entrevista, null, 2),
  ].join("\n");
}
