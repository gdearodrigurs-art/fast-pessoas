import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

// ------------------------------------------------------------------ tipos de ciclo

export const TIPOS_CICLO = [
  "experiencia_45",
  "experiencia_90",
  "desempenho",
] as const;

export type TipoCiclo = (typeof TIPOS_CICLO)[number];

export const ROTULOS_TIPO_CICLO: Record<TipoCiclo, string> = {
  experiencia_45: "Experiência — dia 45",
  experiencia_90: "Experiência — dia 90",
  desempenho: "Desempenho",
};

// ------------------------------------------------------------------ status do ciclo

export const STATUS_CICLO = [
  "aberto",
  "em_avaliacao",
  "consolidado",
  "decidido",
  "cancelado",
] as const;

export type StatusCiclo = (typeof STATUS_CICLO)[number];

export const ROTULOS_STATUS_CICLO: Record<StatusCiclo, string> = {
  aberto: "Aberta",
  em_avaliacao: "Em avaliação",
  consolidado: "Aguardando decisão",
  decidido: "Decidida",
  cancelado: "Cancelada",
};

// ------------------------------------------------------------------ recomendação (flag) e decisão humana

export const RECOMENDACOES = [
  "recuperar",
  "atencao",
  "desenvolver",
  "sucessao",
] as const;

export type Recomendacao = (typeof RECOMENDACOES)[number];

export const ROTULOS_RECOMENDACAO: Record<Recomendacao, string> = {
  recuperar: "Plano de recuperação",
  atencao: "Atenção e acompanhamento",
  desenvolver: "Desenvolver para liderança",
  sucessao: "Alto desempenho — sucessão",
};

export const DECISOES = [
  "manter",
  "desenvolver",
  "renovar",
  "nao_renovar",
  "desligar",
] as const;

export type Decisao = (typeof DECISOES)[number];

export const ROTULOS_DECISAO: Record<Decisao, string> = {
  manter: "Manter na função",
  desenvolver: "Plano de desenvolvimento",
  renovar: "Renovar contrato de experiência",
  nao_renovar: "Não renovar contrato de experiência",
  desligar: "Encaminhar desligamento",
};

/**
 * Decisões ALINHADAS a cada recomendação de faixa. Fora da lista = decisão
 * divergente → justificativa OBRIGATÓRIA (erro 5 da auditoria btime: botões
 * de decisão sem captura de justificativa/divergência). Mapa conservador:
 * na dúvida, diverge — divergência força registro do porquê, nunca o contrário.
 */
export const DECISOES_ALINHADAS: Record<Recomendacao, readonly Decisao[]> = {
  recuperar: ["desenvolver", "nao_renovar", "desligar"],
  atencao: ["manter", "desenvolver", "renovar"],
  desenvolver: ["manter", "desenvolver", "renovar"],
  sucessao: ["manter", "desenvolver", "renovar"],
};

export function decisaoDiverge(
  recomendacao: Recomendacao,
  decisao: Decisao
): boolean {
  return !DECISOES_ALINHADAS[recomendacao].includes(decisao);
}

// ------------------------------------------------------------------ escala

export const NOTA_MINIMA = 1;
export const NOTA_MAXIMA = 5;

/** Alerta visual quando faltam este nº de dias (ou menos) para o prazo. */
export const DIAS_ALERTA_PRAZO = 10;

// ------------------------------------------------------------------ validação de entrada

/**
 * Uma resposta é nota 1–5 OU não observado — nunca os dois, nunca nenhum
 * (o XOR também é CHECK no banco). Item sem resposta jamais vira zero.
 */
const esquemaResposta = z
  .object({
    indicador_id: z.number().int().positive(),
    nota: z
      .number()
      .int()
      .min(NOTA_MINIMA, `Nota entre ${NOTA_MINIMA} e ${NOTA_MAXIMA}`)
      .max(NOTA_MAXIMA, `Nota entre ${NOTA_MINIMA} e ${NOTA_MAXIMA}`)
      .nullable(),
    nao_observado: z.boolean(),
  })
  .refine((r) => (r.nota !== null) !== r.nao_observado, {
    message: "Cada resposta é nota 1–5 OU não observado",
  });

export type RespostaEntrada = z.infer<typeof esquemaResposta>;

/** Salvamento de rascunho: aceita subconjunto — envio é que exige tudo. */
export const esquemaSalvarRespostas = z.object({
  respostas: z
    .array(esquemaResposta)
    .min(1, "Informe ao menos uma resposta")
    .max(300, "Respostas demais")
    .refine(
      (lista) =>
        new Set(lista.map((r) => r.indicador_id)).size === lista.length,
      { message: "Resposta duplicada para o mesmo indicador" }
    ),
});

export type SalvarRespostas = z.infer<typeof esquemaSalvarRespostas>;

export const esquemaDecisao = z.object({
  decisao: z.enum(DECISOES),
  justificativa: z
    .string()
    .trim()
    .max(4000, "Justificativa longa demais")
    .optional(),
});

export type EntradaDecisao = z.infer<typeof esquemaDecisao>;

export const esquemaLoteDesempenho = z.object({
  prazo: esquemaData,
});

export type EntradaLote = z.infer<typeof esquemaLoteDesempenho>;

/** Seleção de pares pelo gestor (ids de colaboradores; o serviço valida a equipe). */
export const esquemaSelecionarPares = z.object({
  colaborador_ids: z
    .array(z.number().int().positive())
    .min(1, "Selecione ao menos um par")
    .max(50, "Pares demais")
    .refine((l) => new Set(l).size === l.length, {
      message: "Par repetido na seleção",
    }),
});

export type SelecionarPares = z.infer<typeof esquemaSelecionarPares>;

export const esquemaRemoverPar = z.object({
  colaborador_id: z.number().int().positive(),
});

export type RemoverPar = z.infer<typeof esquemaRemoverPar>;

export const esquemaCancelamento = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "Informe o motivo do cancelamento")
    .max(1000, "Motivo longo demais"),
});

export type EntradaCancelamento = z.infer<typeof esquemaCancelamento>;

// ------------------------------------------------------------------ administração do modelo

const esquemaIndicadorEntrada = z.object({
  nome: z.string().trim().min(1, "Nome do indicador é obrigatório").max(160),
  descricao: z
    .string()
    .trim()
    .min(1, "Descrição (régua) do indicador é obrigatória")
    .max(2000),
  peso: z.number().int().min(1, "Peso mínimo 1").max(100, "Peso máximo 100"),
});

const esquemaPilarEntrada = z.object({
  nome: z.string().trim().min(1, "Nome do pilar é obrigatório").max(120),
  peso: z.number().int().min(1, "Peso mínimo 1").max(100, "Peso máximo 100"),
  indicadores: z
    .array(esquemaIndicadorEntrada)
    .min(1, "Todo pilar precisa de ao menos um indicador")
    .max(50, "Indicadores demais no pilar")
    .refine(
      (lista) => new Set(lista.map((i) => i.nome)).size === lista.length,
      { message: "Indicador repetido dentro do pilar" }
    ),
});

const esquemaFaixaEntrada = z.object({
  minimo: z.number().min(0).max(100),
  maximo: z.number().min(0).max(100),
  rotulo: z.string().trim().min(1, "Rótulo da faixa é obrigatório").max(120),
  recomendacao: z.enum(RECOMENDACOES),
});

export const esquemaEstruturaModelo = z.object({
  nome: z.string().trim().min(1, "Nome do modelo é obrigatório").max(200),
  pilares: z
    .array(esquemaPilarEntrada)
    .min(1, "O modelo precisa de ao menos um pilar")
    .max(10, "Pilares demais")
    .refine(
      (lista) => new Set(lista.map((p) => p.nome)).size === lista.length,
      { message: "Pilar repetido no modelo" }
    ),
  faixas: z
    .array(esquemaFaixaEntrada)
    .min(1, "O modelo precisa de ao menos uma faixa")
    .max(10, "Faixas demais")
    .refine(
      (lista) => lista.every((f) => f.minimo < f.maximo),
      { message: "Toda faixa exige mínimo menor que máximo" }
    )
    .refine(
      (lista) => new Set(lista.map((f) => f.minimo)).size === lista.length,
      { message: "Duas faixas com o mesmo mínimo" }
    ),
});

export type EstruturaModeloEntrada = z.infer<typeof esquemaEstruturaModelo>;

// ------------------------------------------------------------------ validações de ativação (única fonte — usada no serviço e ao vivo na tela)

export interface ProblemaAtivacao {
  campo: string;
  mensagem: string;
}

/**
 * Regras de ativação (erros 2/3 da btime corrigidos): somas de pesos = 100
 * (entre pilares e dentro de cada pilar) e faixas contíguas cobrindo 0–100
 * sem furo nem sobreposição. Lista vazia = pode ativar.
 */
export function validarAtivacao(
  estrutura: EstruturaModeloEntrada
): ProblemaAtivacao[] {
  const problemas: ProblemaAtivacao[] = [];
  const somaPilares = estrutura.pilares.reduce((s, p) => s + p.peso, 0);
  if (somaPilares !== 100) {
    problemas.push({
      campo: "pilares",
      mensagem: `A soma dos pesos dos pilares deve ser 100 (está em ${somaPilares}).`,
    });
  }
  for (const pilar of estrutura.pilares) {
    const soma = pilar.indicadores.reduce((s, i) => s + i.peso, 0);
    if (soma !== 100) {
      problemas.push({
        campo: `pilar:${pilar.nome}`,
        mensagem: `Os indicadores do pilar "${pilar.nome}" devem somar 100 (estão em ${soma}).`,
      });
    }
  }
  const faixas = [...estrutura.faixas].sort((a, b) => a.minimo - b.minimo);
  if (faixas.length > 0) {
    if (faixas[0].minimo !== 0) {
      problemas.push({
        campo: "faixas",
        mensagem: "A primeira faixa deve começar em 0.",
      });
    }
    if (faixas[faixas.length - 1].maximo !== 100) {
      problemas.push({
        campo: "faixas",
        mensagem: "A última faixa deve terminar em 100.",
      });
    }
    for (let i = 1; i < faixas.length; i++) {
      if (faixas[i].minimo !== faixas[i - 1].maximo) {
        problemas.push({
          campo: "faixas",
          mensagem: `Faixas com furo ou sobreposição entre ${faixas[i - 1].maximo} e ${faixas[i].minimo}.`,
        });
      }
    }
  }
  return problemas;
}
