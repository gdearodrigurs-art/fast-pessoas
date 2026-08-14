import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";
import { esquemaFiltroEstrutura } from "../estrutura/esquemas";

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
 * A RESSALVA QUE ESTAVA AQUI FOI CORRIGIDA (ver `pessoasDoRecorte` abaixo).
 * O piso era aplicado sobre a SOMA das respostas do recorte: 3 pessoas em 2
 * perguntas produziam 6 respostas e passavam por um piso de 5. Agora o piso
 * recebe a MENOR contagem por pergunta do recorte, que é contagem de gente.
 */
export const MINIMO_AMOSTRA_PADRAO = 5;

/**
 * Quantas PESSOAS sustentam um agregado que mistura várias perguntas — o
 * número que vai ao piso de anonimato, e nunca a soma das respostas.
 *
 * POR QUE A MENOR. Uma pessoa responde uma pergunta no máximo uma vez (a trava
 * `participacao_pesquisa_unica_por_pessoa` da 0052 e a recusa de pergunta
 * repetida em `prepararRespostas`), então a contagem de UMA pergunta já é
 * contagem de gente. O agregado do recorte — a média da unidade, o eNPS da
 * pesquisa — mistura as perguntas, então ele vale o elo mais fraco: se a
 * pergunta B foi respondida por 3, publicar a média porque a A teve 40 é
 * publicar um número que 3 pessoas conseguem desfazer entre si.
 *
 * SOMAR ERA O DEFEITO. Com a soma, o piso é alcançado por
 * `k / nº de perguntas` pessoas: numa pesquisa de 20 perguntas, k=5 vira UMA
 * pessoa — o anonimato prometido ao respondente valendo menos que o número
 * anunciado a ele em `avisoAnonimato`.
 *
 * POR QUE NÃO `COUNT(DISTINCT pessoa_id)`, que seria exato: porque
 * `rh_clima.resposta_pesquisa` NÃO TEM pessoa, de propósito (0022) — não
 * existe caminho de volta da resposta para quem respondeu. Criar a coluna
 * daria o número exato destruindo justamente o segredo que o piso existe para
 * defender: cada resposta passaria a ser atribuível a uma pessoa com nome por
 * qualquer um com SELECT na tabela. A menor contagem por pergunta é um limite
 * INFERIOR do número de pessoas do recorte — erra sempre para o lado de
 * esconder, que é o lado certo de errar.
 *
 * Recorte sem nenhuma pergunta respondida vale 0, não `Math.min()` vazio:
 * Infinity passaria por qualquer piso e publicaria o vazio.
 */
export function pessoasDoRecorte(respostasPorPergunta: number[]): number {
  if (respostasPorPergunta.length === 0) return 0;
  return Math.min(...respostasPorPergunta);
}

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

// ------------------------------------------------------------------ público-alvo
//
// A pesquisa pode MIRAR um recorte CONJUNTIVO (E) de até quatro dimensões
// (migration 0079): registro (empresa), lotação (estabelecimento), centro de
// custo e cargo. As quatro AUSENTES = empresa toda = comportamento de sempre;
// qualquer uma preenchida estreita em E. O alvo guarda CRITÉRIO (ids), não a
// lista de pessoas — a elegibilidade se resolve ao vivo pela lotação/cargo
// VIGENTE de cada um (eixo 10). Identidade por id, nunca por nome (eixo 2);
// cargo_id aponta para rh.cargo (identidade estável), não para a versão.

export const esquemaAlvoPesquisa = esquemaFiltroEstrutura.extend({
  /** CARGO — rh.cargo.id (a identidade estável, não rh.cargo_versao). */
  cargo_id: z.coerce.number().int().positive().optional(),
});

export type AlvoPesquisa = z.infer<typeof esquemaAlvoPesquisa>;

/**
 * As quatro colunas de alvo já resolvidas (linha da pesquisa) OU o recorte
 * VIGENTE de uma pessoa: mesma forma, `null` = ausente. É a forma com que o
 * gate de elegibilidade compara os dois lados.
 */
export interface RecorteAlvo {
  empresa_id: number | null;
  estabelecimento_id: number | null;
  centro_custo_id: number | null;
  cargo_id: number | null;
}

/** A pesquisa mira um público quando ao menos uma dimensão do alvo vem preenchida. */
export function pesquisaTemAlvo(alvo: RecorteAlvo): boolean {
  return (
    alvo.empresa_id !== null ||
    alvo.estabelecimento_id !== null ||
    alvo.centro_custo_id !== null ||
    alvo.cargo_id !== null
  );
}

/**
 * O recorte VIGENTE da pessoa casa o alvo da pesquisa? Dimensão do alvo em
 * `null` casa qualquer pessoa (não estreita); preenchida exige igualdade — e
 * quem não tem aquele atributo vigente (recorte `null`) NÃO casa uma dimensão
 * exigida. É o mesmo E conjuntivo do gate de listagem, em TypeScript, para o
 * servidor barrar responder/ver formulário fora do alvo (eixo 7).
 */
export function recorteCasaAlvo(
  alvo: RecorteAlvo,
  recorte: RecorteAlvo
): boolean {
  return (
    (alvo.empresa_id === null || alvo.empresa_id === recorte.empresa_id) &&
    (alvo.estabelecimento_id === null ||
      alvo.estabelecimento_id === recorte.estabelecimento_id) &&
    (alvo.centro_custo_id === null ||
      alvo.centro_custo_id === recorte.centro_custo_id) &&
    (alvo.cargo_id === null || alvo.cargo_id === recorte.cargo_id)
  );
}

/**
 * O alvo do formulário tem alguma dimensão preenchida? (esquema, `undefined`).
 * Type predicate: dentro do `if` o alvo passa a ser AlvoPesquisa não-nulo.
 */
export function alvoPreenchido(
  alvo: AlvoPesquisa | undefined
): alvo is AlvoPesquisa {
  return (
    alvo !== undefined &&
    (alvo.empresa_id !== undefined ||
      alvo.estabelecimento_id !== undefined ||
      alvo.centro_custo_id !== undefined ||
      alvo.cargo_id !== undefined)
  );
}

/** A linha da pesquisa (colunas nuláveis) relida como filtro de contarElegiveis. */
export function alvoDaLinha(linha: RecorteAlvo): AlvoPesquisa {
  return {
    empresa_id: linha.empresa_id ?? undefined,
    estabelecimento_id: linha.estabelecimento_id ?? undefined,
    centro_custo_id: linha.centro_custo_id ?? undefined,
    cargo_id: linha.cargo_id ?? undefined,
  };
}

// ------------------------------------------------------------------ entrada

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
    // Público-alvo (0079): ausente = empresa toda. O gate de piso k mora no
    // serviço (criarPesquisa), não aqui — o esquema só valida a forma dos ids.
    alvo: esquemaAlvoPesquisa.optional(),
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
