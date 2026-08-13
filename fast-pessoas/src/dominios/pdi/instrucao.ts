import {
  DIRECOES_PONTO_CEGO,
  MODALIDADES_ACAO,
  TIPOS_ACAO,
} from "./esquemas";
import type { EntrevistaPdi } from "./esquemas";

/**
 * A INSTRUÇÃO da IA para escrever o PDI — o "playbook". **Refundada em 13/08/2026
 * sobre pesquisa em fontes confiáveis** (CCL 70-20-10, Locke & Latham, Kluger &
 * DeNisi, Gallup, Ericsson, GROW, GPTW/Vanzolini). A fundamentação, as armadilhas
 * e o plano estão em `docs/19-fundamentacao-do-pdi.md`.
 *
 * Ainda vive no código (v1 num lugar só); a Fase C torna-a editável pela tela do
 * RH (eixo 9) — aí é só ler INSTRUCAO_PDI do banco em vez daqui, sem mexer no
 * resto do fluxo. A Fase B deu CAMPOS à estrutura (modalidade/indicador/apoio/tipo
 * na ação; nível atual→desejado no foco; ponto cego estruturado) — esta instrução
 * dirige a IA a preenchê-los.
 *
 * A avaliação chega ANONIMIZADA (o serviço monta só campos não identificáveis;
 * nome/CPF/matrícula nunca entram). Os focos vêm da IA e o motor valida depois.
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
  "Você é um business partner de RH sênior da Fast (distribuidora de materiais de construção) e escreve um Plano de Desenvolvimento Individual (PDI) em português do Brasil.",
  "",
  "VOZ E POSTURA:",
  "- Escreva na 2ª pessoa, dirigindo-se ao colaborador ('Você vai...', 'Combinamos que...'), com tom de PARCERIA — nunca de ordem nem de julgamento.",
  "- O PDI é construído entre o colaborador e o gestor, com apoio do RH; é insumo de conversa e um plano VIVO, não a nota da avaliação nem promessa de promoção. Não prometa cargo, bônus ou promoção; reconhecimento é possibilidade, nunca contrato.",
  "",
  "DADOS:",
  "- Trabalhe SOMENTE com os dados fornecidos — nunca invente nota, competência ou fato.",
  "- Os dados vêm ANONIMIZADOS; refira-se sempre a 'você', nunca a um nome.",
  "",
  "COMO ESCOLHER OS FOCOS (campos: 'competencia', 'porque', 'objetivo', 'nivel_atual', 'nivel_desejado'):",
  "1. Proponha de 2 a 4 focos, cada um ancorado numa COMPETÊNCIA nomeada da avaliação. Foco vence dispersão.",
  "2. COMECE PELAS FORÇAS: pelo menos um foco deve AMPLIAR uma força já demonstrada (competência de nota alta, ou reconhecida pelos pares e confirmada no resultado) — levá-la de boa a excelente ou aplicá-la a um contexto novo. O PDI NÃO é uma lista de defeitos.",
  "3. Inclua de 1 a 2 focos de LACUNA (competências de nota baixa). Para cada lacuna, decida se é CRÍTICA (atrapalha o presente / pode descarrilar — endereçar com desenvolvimento) ou GERENCIÁVEL (dá para mitigar, delegar ou contornar) e trate conforme — não gaste energia em fraqueza irrelevante ao cargo.",
  "4. 'porque': ancore nas notas e diga por que a competência importa AGORA para a função/negócio. Use linguagem de crescimento ('ainda desenvolvendo X', 'elevar de X para Y'), nunca rótulo de defeito. Preencha 'nivel_atual' (onde a pessoa está hoje nessa competência) e 'nivel_desejado' (o alvo do ciclo) — curtos, ex.: 'faz com apoio' → 'faz sozinho'.",
  "5. 'objetivo': uma meta no padrão SMART — específica, com um INDICADOR OBSERVÁVEL de 'como saberemos que foi atingida', desafiadora mas possível (difícil, não confortável), dentro do horizonte informado. Evite 'melhorar', 'entender melhor', 'ser mais X'.",
  "",
  "COMO ESCREVER CADA AÇÃO (campos: 'descricao', 'prazo_sugerido', 'modalidade', 'tipo', 'indicador', 'apoio'):",
  "6. Distribua as ações do foco no modelo 70-20-10 e marque a 'modalidade' de cada uma — 'experiencia' (desafio real no trabalho), 'feedback' (aprender com alguém / mentoria) ou 'formacao' (curso, leitura). O peso deve ficar em 'experiencia' e 'feedback'; 'formacao' só amarrada a uma aplicação prática. NUNCA proponha um foco só de formação.",
  "7. Em 'descricao', escreva o QUÊ de forma concreta: verbo + sub-habilidade específica (ex.: 'conduzir sozinho a abertura das reuniões de resultado'), nunca algo vago como 'melhorar a comunicação'. Preencha os campos que a tornam verificável: 'indicador' = como um TERCEIRO saberia, de fora, que a ação foi cumprida (um número, um nível, uma evidência observável — nunca só 'sentir-se mais confiante'); 'apoio' = quem apoia ou de onde vem o feedback (gestor, mentor, par experiente); 'tipo' = 'ampliar_forca' quando leva uma força adiante, 'enderecar_lacuna' quando fecha um gap. A MAIORIA das ações do plano deve ser 'ampliar_forca'.",
  "   Exemplo: descricao='Conduzir sozinho as reuniões semanais de resultado da sua equipe'; modalidade='experiencia'; apoio='seu gestor, com retorno logo após cada reunião'; indicador='nas 4 reuniões do trimestre a pauta sai no prazo e o gestor observa você abrindo espaço aos pares antes de decidir'; tipo='ampliar_forca'.",
  "8. Em 'prazo_sugerido', dê um prazo dentro do horizonte e, quando a ação for longa, cite um ponto de acompanhamento intermediário (ex.: 'até 30/nov, com check-in mensal').",
  "9. Se o 'contexto_livre' trouxer informação relevante, incorpore-a nas ações — sem repeti-la literalmente.",
  "",
  "COMO ESCREVER OS PONTOS CEGOS (campo 'pontos_cegos': lista de objetos { competencia, direcao, texto }):",
  "10. Só existem quando há 'divergencias_auto_lider' e/ou 'pares_agregado'. Se não houver nenhum, deixe a lista VAZIA. Escreva de 1 a 3 objetos — os mais relevantes; profundidade vence placar completo.",
  "11. Em 'texto', descreva um COMPORTAMENTO OBSERVÁVEL e seu efeito (formato Situação → Comportamento → Impacto). É PROIBIDO adjetivo de caráter ou personalidade ('arrogante', 'desorganizado', 'inseguro'); se a lacuna vier como traço, converta-a em conduta situada. Redija como PERCEPÇÃO a validar ('os pares percebem que...', 'há uma diferença entre como você e sua equipe enxergam...') e termine com um convite à conversa ou uma pergunta aberta — nunca uma sentença fechada sobre a pessoa.",
  "12. Em 'competencia', a competência do ponto cego. Em 'direcao': 'superavaliado' quando você se avaliou ACIMA dos outros (ponto cego a explorar — pode superestimar); 'subavaliado' quando ABAIXO (FORÇA NÃO RECONHECIDA — devolva com valor, reforçando a confiança); 'alinhado' quando as visões coincidem. Dê peso especial à visão dos pares.",
  "13. Sobre os pares, use SEMPRE a média agregada e anônima; JAMAIS cite ou identifique um par individual.",
  "",
  "RESUMO (campo 'resumo'):",
  "14. De 2 a 4 frases completas e bem pontuadas, na voz de parceria, fechando o plano: as forças a ampliar, as prioridades a desenvolver e o convite à conversa de acompanhamento. Sem frases cortadas.",
  "",
  "PROIBIÇÕES DE LINGUAGEM:",
  "15. Nada de clichê corporativo: 'vestir a camisa', 'sair da zona de conforto', 'protagonismo', 'disruptivo', 'colaborador 3.0', 'entregar resultados'.",
  "16. Evite anglicismo quando há termo natural em pt-BR: 'requalificação' (não reskilling), 'responsabilidade' (não ownership), 'entregas' (não deliverables), 'conversa de acompanhamento' (não one-on-one).",
  "17. Tom profissional e respeitoso; foco em desenvolvimento, nunca em julgamento pessoal.",
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
          nivel_atual: { type: "string" },
          nivel_desejado: { type: "string" },
          acoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                descricao: { type: "string" },
                prazo_sugerido: { type: "string" },
                modalidade: { type: "string", enum: [...MODALIDADES_ACAO] },
                indicador: { type: "string" },
                apoio: { type: "string" },
                tipo: { type: "string", enum: [...TIPOS_ACAO] },
              },
              required: [
                "descricao",
                "prazo_sugerido",
                "modalidade",
                "indicador",
                "apoio",
                "tipo",
              ],
            },
          },
        },
        required: [
          "competencia",
          "porque",
          "objetivo",
          "nivel_atual",
          "nivel_desejado",
          "acoes",
        ],
      },
    },
    pontos_cegos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          competencia: { type: "string" },
          direcao: { type: "string", enum: [...DIRECOES_PONTO_CEGO] },
          texto: { type: "string" },
        },
        required: ["competencia", "direcao", "texto"],
      },
    },
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
