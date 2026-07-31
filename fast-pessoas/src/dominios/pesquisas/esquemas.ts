import { z } from "zod";

/**
 * Pesquisa estruturada de clima — módulo PRÓPRIO, separado do check-in diário
 * (decisão do usuário 2026-07-29). O check-in dá tendência; a pesquisa dá
 * diagnóstico, eNPS e plano de ação. Ver o cabeçalho de
 * db/migrations/0022_pesquisas.sql para o modelo de privacidade.
 */

// ------------------------------------------------------------------ tipos de pesquisa

export const TIPOS_PESQUISA = ["anual", "pulse", "enps"] as const;

export type TipoPesquisa = (typeof TIPOS_PESQUISA)[number];

export const ROTULOS_TIPO_PESQUISA: Record<TipoPesquisa, string> = {
  anual: "Pesquisa anual",
  pulse: "Pulse survey",
  enps: "eNPS",
};

export const STATUS_PESQUISA = ["rascunho", "aberta", "encerrada"] as const;

export type StatusPesquisa = (typeof STATUS_PESQUISA)[number];

export const ROTULOS_STATUS_PESQUISA: Record<StatusPesquisa, string> = {
  rascunho: "Rascunho",
  aberta: "Aberta",
  encerrada: "Encerrada",
};

// ------------------------------------------------------------------ tipos de pergunta

export const TIPOS_PERGUNTA = [
  "escala_1_5",
  "nps_0_10",
  "texto_livre",
  "escolha_unica",
] as const;

export type TipoPergunta = (typeof TIPOS_PERGUNTA)[number];

export const ROTULOS_TIPO_PERGUNTA: Record<TipoPergunta, string> = {
  escala_1_5: "Escala de 1 a 5",
  nps_0_10: "Nota de 0 a 10 (eNPS)",
  texto_livre: "Texto livre",
  escolha_unica: "Escolha única",
};

/** Faixa numérica aceita por tipo; texto_livre e escolha_unica não têm nota. */
export const FAIXA_NUMERICA: Partial<
  Record<TipoPergunta, { minimo: number; maximo: number }>
> = {
  escala_1_5: { minimo: 1, maximo: 5 },
  nps_0_10: { minimo: 0, maximo: 10 },
};

export const ROTULOS_ESCALA_1_5: Record<number, string> = {
  1: "Discordo totalmente",
  2: "Discordo",
  3: "Neutro",
  4: "Concordo",
  5: "Concordo totalmente",
};

// ------------------------------------------------------------------ plano de ação

export const STATUS_PLANO = [
  "aberto",
  "em_andamento",
  "concluido",
  "cancelado",
] as const;

export type StatusPlano = (typeof STATUS_PLANO)[number];

export const ROTULOS_STATUS_PLANO: Record<StatusPlano, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

// ------------------------------------------------------------------ privacidade

/**
 * k-anonimato: nenhum recorte de resultado aparece com menos de k respostas.
 * Abaixo disso a média deixa de ser agregado e passa a ser dedução de quem
 * respondeu o quê — o oposto do que a pesquisa anônima promete.
 *
 * ESTE NÚMERO NÃO É A POLÍTICA — é o PADRÃO DE FÁBRICA dela, e só serve de
 * fallback quando a linha de sistema.parametro_privacidade não existe. A
 * política vigente é a MESMA dos relatórios agregados:
 * sistema.parametro_privacidade.minimo_por_recorte (migration 0044),
 * administrável em /relatorios por quem tem `privacidade.administrar`.
 *
 * POR QUE O MESMO PARÂMETRO, E NÃO UM SEGUNDO CAMPO SÓ PARA A PESQUISA
 * Porque os dois respondem à mesma pergunta: quantas PESSOAS precisam estar
 * por trás de um número para ele poder ser publicado. Um k separado só se
 * justificaria se as unidades de contagem fossem diferentes — e não são: o
 * recorte de diversidade conta pessoas do recorte, o agregado de clima conta
 * COUNT(DISTINCT colaborador_id) por unidade, e aqui cada resposta de uma
 * pergunta é de uma pessoa distinta (uma resposta por pessoa por pergunta).
 * Dois campos administráveis reproduziriam o defeito que a 0045 corrigiu: o
 * dono mexe em um, acredita ter mudado a política inteira, e metade dela
 * segue publicando o que ele acabou de mandar esconder.
 *
 * RESSALVA MEDIDA, registrada de propósito: em `recortesPorUnidade` a
 * contagem é de RESPOSTAS somadas por unidade, não de pessoas — numa pesquisa
 * com 2 perguntas de escala, 3 pessoas produzem 6 respostas e passam por um
 * piso de 5. Isso é defeito do DENOMINADOR, não do piso, e está descrito no
 * relatório desta frente; corrigi-lo muda o que a tela publica hoje e por isso
 * não foi embutido nesta mudança, que é de parametrização.
 */
export const MINIMO_AMOSTRA_PADRAO = 5;

export const TEXTO_AMOSTRA_INSUFICIENTE = "Amostra insuficiente";

/**
 * O aviso que o respondente lê ANTES de responder. Recebe o k vigente em vez
 * de citar uma constante: prometer "5 respostas ou mais" numa empresa que
 * configurou 20 seria mentir para a pessoa justamente na tela em que se pede
 * que ela confie no sistema.
 */
export function avisoAnonimato(minimoAmostra: number): string {
  return (
    "Suas respostas são anônimas: o sistema registra apenas que você participou " +
    "e a sua unidade, nunca o vínculo entre você e o que respondeu. Resultados " +
    `só aparecem em recortes com ${minimoAmostra} respostas ou mais.`
  );
}

// ------------------------------------------------------------------ entrada

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

export const esquemaPerguntaNova = z
  .object({
    enunciado: z
      .string()
      .trim()
      .min(1, "Informe o enunciado da pergunta")
      .max(500, "Enunciado longo demais (máx. 500 caracteres)"),
    tipo: z.enum(TIPOS_PERGUNTA),
    opcoes: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Opção não pode ser vazia")
          .max(120, "Opção longa demais (máx. 120 caracteres)")
      )
      .min(2, "Escolha única precisa de ao menos 2 opções")
      .max(12, "No máximo 12 opções por pergunta")
      .optional(),
    obrigatoria: z.boolean().optional().default(true),
  })
  .refine((dados) => (dados.tipo === "escolha_unica") === Boolean(dados.opcoes), {
    message: "Opções são exclusivas de perguntas de escolha única",
    path: ["opcoes"],
  });

export type PerguntaNova = z.infer<typeof esquemaPerguntaNova>;

export const esquemaCriacaoPesquisa = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(1, "Informe o título da pesquisa")
      .max(200, "Título longo demais (máx. 200 caracteres)"),
    tipo: z.enum(TIPOS_PESQUISA),
    descricao: z
      .string()
      .trim()
      .max(2000, "Descrição longa demais (máx. 2000 caracteres)")
      .optional()
      .transform((valor) => (valor ? valor : undefined)),
    inicio: esquemaData,
    fim: esquemaData,
    // O anonimato é o padrão — quem quiser o contrário precisa dizer.
    anonima: z.boolean().optional().default(true),
    perguntas: z
      .array(esquemaPerguntaNova)
      .min(1, "A pesquisa precisa de ao menos uma pergunta")
      .max(40, "No máximo 40 perguntas por pesquisa"),
  })
  .refine((dados) => dados.fim >= dados.inicio, {
    message: "O fim do período deve ser igual ou posterior ao início",
    path: ["fim"],
  })
  .refine(
    (dados) =>
      dados.tipo !== "enps" ||
      dados.perguntas.some((pergunta) => pergunta.tipo === "nps_0_10"),
    {
      message:
        "Pesquisa de eNPS precisa de ao menos uma pergunta de nota 0 a 10",
      path: ["perguntas"],
    }
  );

export type CriacaoPesquisa = z.infer<typeof esquemaCriacaoPesquisa>;

export const esquemaAcaoPesquisa = z.object({
  acao: z.enum(["abrir", "encerrar"]),
});

export type AcaoPesquisa = z.infer<typeof esquemaAcaoPesquisa>;

export const esquemaEnvioRespostas = z.object({
  respostas: z
    .array(
      z.object({
        pergunta_id: z
          .number("Pergunta inválida")
          .int("Pergunta inválida")
          .positive("Pergunta inválida"),
        // Faixa ampla aqui; o serviço confere a faixa exata do TIPO da pergunta.
        valor_numerico: z
          .number("Resposta inválida")
          .int("Resposta inválida")
          .min(0, "Resposta fora da faixa")
          .max(10, "Resposta fora da faixa")
          .nullish(),
        valor_texto: z
          .string()
          .trim()
          .max(2000, "Comentário longo demais (máx. 2000 caracteres)")
          .nullish(),
      })
    )
    .min(1, "Envie ao menos uma resposta")
    .max(60, "Lote grande demais"),
});

export type EnvioRespostas = z.infer<typeof esquemaEnvioRespostas>;

export const esquemaPlanoNovo = z.object({
  // NULL = plano da empresa; preenchido = plano de uma unidade.
  unidade_id: z
    .number("Unidade inválida")
    .int("Unidade inválida")
    .positive("Unidade inválida")
    .nullish(),
  titulo: z
    .string()
    .trim()
    .min(1, "Informe o título do plano")
    .max(200, "Título longo demais (máx. 200 caracteres)"),
  descricao: z
    .string()
    .trim()
    .max(2000, "Descrição longa demais (máx. 2000 caracteres)")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
  responsavel_usuario: z
    .number("Escolha o responsável")
    .int("Responsável inválido")
    .positive("Responsável inválido"),
  prazo: esquemaData,
});

export type PlanoNovo = z.infer<typeof esquemaPlanoNovo>;

export const esquemaAtualizacaoPlano = z.object({
  status: z.enum(STATUS_PLANO),
});

export type AtualizacaoPlano = z.infer<typeof esquemaAtualizacaoPlano>;
