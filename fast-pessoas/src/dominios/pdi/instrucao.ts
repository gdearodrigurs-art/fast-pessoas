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

/** Uma divergência auto × líder — sem identidade, só a comparação de notas. */
export interface DivergenciaAnonima {
  competencia: string;
  /** Nota que o próprio colaborador se deu (1–5). */
  nota_colaborador: number;
  /** Nota que o líder deu (1–5). */
  nota_lider: number;
}

/** Média ANÔNIMA dos pares por competência (já passou o piso de anonimato). */
export interface ParAgregadoAnonimo {
  competencia: string;
  /** Média das notas dos pares (1–5). */
  media_pares: number;
  /** Quantos pares responderam a competência. */
  respostas: number;
}

export interface AvaliacaoAnonima {
  /** Contexto útil ao PDI, não identificador. Opcional em v1. */
  cargo?: string;
  modelo: string;
  percentual_final: number;
  faixa: string;
  recomendacao: string;
  competencias: CompetenciaAnonima[];
  /**
   * Divergências entre a autoavaliação do colaborador e a do líder (pontos
   * cegos). Ausente/vazio quando não houve autoavaliação — aí o PDI segue só
   * com a visão do líder, como antes.
   */
  divergencias_auto_lider?: DivergenciaAnonima[];
  /**
   * Visão dos PARES (360), agregada e anônima, por competência. Só vem quando o
   * número de pares que responderam atingiu o piso de anonimato — senão ausente.
   */
  pares_agregado?: ParAgregadoAnonimo[];
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
  "6. 'pontos_cegos': compare as perspectivas quando existirem. Se houver 'divergencias_auto_lider', escreva pontos cegos onde o colaborador se avaliou ACIMA do líder (pode superestimar; trate com evidência) ou ABAIXO (pode subestimar; reforce a confiança), citando a competência e as duas notas. Se houver 'pares_agregado' (média ANÔNIMA dos pares — jamais cite um par individual), some pontos cegos onde a média dos pares divergir do líder: é o olhar externo do 360. Escreva de 1 a 4 pontos cegos no total; se não houver nem auto nem pares, deixe 'pontos_cegos' VAZIO.",
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
