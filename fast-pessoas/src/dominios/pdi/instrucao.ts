import type { EntrevistaPdi } from "./esquemas";

/**
 * A INSTRUÇÃO da IA para escrever o PDI — o "playbook". **Refundada em 13/08/2026
 * sobre pesquisa em fontes confiáveis** (CCL 70-20-10, Locke & Latham, Kluger &
 * DeNisi, Gallup, Ericsson, GROW, GPTW/Vanzolini). A fundamentação, as armadilhas
 * e o plano estão em `docs/19-fundamentacao-do-pdi.md`.
 *
 * Ainda vive no código (v1 num lugar só); a Fase C torna-a editável pela tela do
 * RH (eixo 9) — aí é só ler INSTRUCAO_PDI do banco em vez daqui, sem mexer no
 * resto do fluxo. A Fase B enriquece o schema (modalidade/indicador/apoio na
 * ação); enquanto isso, esta instrução embute essa riqueza no TEXTO dos campos.
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
  "COMO ESCOLHER OS FOCOS (campo 'competencia' + 'porque' + 'objetivo'):",
  "1. Proponha de 2 a 4 focos, cada um ancorado numa COMPETÊNCIA nomeada da avaliação. Foco vence dispersão.",
  "2. COMECE PELAS FORÇAS: pelo menos um foco deve AMPLIAR uma força já demonstrada (competência de nota alta, ou reconhecida pelos pares e confirmada no resultado) — levá-la de boa a excelente ou aplicá-la a um contexto novo. O PDI NÃO é uma lista de defeitos.",
  "3. Inclua de 1 a 2 focos de LACUNA (competências de nota baixa). Para cada lacuna, decida se é CRÍTICA (atrapalha o presente / pode descarrilar — endereçar com desenvolvimento) ou GERENCIÁVEL (dá para mitigar, delegar ou contornar) e trate conforme — não gaste energia em fraqueza irrelevante ao cargo.",
  "4. 'porque': ancore nas notas e diga por que a competência importa AGORA para a função/negócio; nomeie o nível atual e, quando fizer sentido, o nível-alvo. Use linguagem de crescimento ('ainda desenvolvendo X', 'elevar de X para Y'), nunca rótulo de defeito.",
  "5. 'objetivo': uma meta no padrão SMART — específica, com um INDICADOR OBSERVÁVEL de 'como saberemos que foi atingida', desafiadora mas possível (difícil, não confortável), dentro do horizonte informado. Evite 'melhorar', 'entender melhor', 'ser mais X'.",
  "",
  "COMO ESCREVER CADA AÇÃO (campo 'acoes': 'descricao' + 'prazo_sugerido'):",
  "6. Distribua as ações do foco no modelo 70-20-10, com o peso no FAZER: a maioria deve ser experiência real no trabalho (70) e aprender com outros / feedback (20); curso ou leitura (10) só quando amarrado a uma aplicação prática. NUNCA proponha um foco só de curso.",
  "7. Em 'descricao', escreva a ação de forma concreta e verificável, contendo em linguagem natural: (a) o QUÊ, com verbo concreto e a sub-habilidade específica; (b) a MODALIDADE — sinalize se é experiência no trabalho, aprender com alguém/feedback ou formação; (c) o INDICADOR de sucesso, observável por um TERCEIRO (um número, um nível de proficiência, uma evidência que dá para ver de fora — nunca só 'sentir-se mais confiante'); (d) QUEM APOIA / de onde vem o feedback (gestor, mentor, par experiente). Prefira uma ação bem-feita a várias vagas.",
  "   Exemplo bom: 'Conduzir sozinho as reuniões semanais de resultado da sua equipe (experiência no trabalho), com o seu gestor te dando retorno logo após cada uma (feedback); sucesso = nas 4 reuniões do trimestre a pauta sai no prazo e o gestor observa você abrindo espaço aos pares antes de decidir.' Em vez de: 'Melhorar a comunicação.'",
  "8. Em 'prazo_sugerido', dê um prazo dentro do horizonte e, quando a ação for longa, cite um ponto de acompanhamento intermediário (ex.: 'até 30/nov, com check-in mensal').",
  "9. Se o 'contexto_livre' trouxer informação relevante, incorpore-a nas ações — sem repeti-la literalmente.",
  "",
  "COMO ESCREVER OS PONTOS CEGOS (campo 'pontos_cegos': lista de frases):",
  "10. Só existem quando há 'divergencias_auto_lider' e/ou 'pares_agregado'. Se não houver nenhum, deixe a lista VAZIA. Escreva de 1 a 3 — os mais relevantes; profundidade vence placar completo.",
  "11. Cada ponto cego descreve um COMPORTAMENTO OBSERVÁVEL e seu efeito (formato Situação → Comportamento → Impacto). É PROIBIDO adjetivo de caráter ou personalidade ('arrogante', 'desorganizado', 'inseguro'); se a lacuna vier como traço, converta-a em conduta situada.",
  "12. Redija como PERCEPÇÃO a validar, não veredito: 'os pares percebem que...', 'há uma diferença entre como você e sua equipe enxergam...'. Termine com um convite à conversa com o líder ou uma pergunta aberta ('o que pode explicar essa diferença?'). Nunca conclua com sentença fechada sobre a pessoa.",
  "13. Classifique pela DIREÇÃO: onde você se avaliou ACIMA dos outros, é um ponto cego a explorar (pode superestimar); onde ABAIXO, é uma FORÇA NÃO RECONHECIDA — devolva com valor, reforçando a confiança. Dê peso especial à visão dos pares. Sobre os pares, use SEMPRE a média agregada e anônima; JAMAIS cite ou identifique um par individual.",
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
