import Anthropic from "@anthropic-ai/sdk";

import { ErroHttp } from "./sessao";

/**
 * Único ponto de chamada à IA (Claude) do app — a PRIMEIRA saída de rede que este
 * projeto faz para fora do banco. Genérico: recebe um system, um user e um esquema
 * JSON (structured outputs) e devolve o texto validado no formato pedido. A chave
 * vem de ANTHROPIC_API_KEY (env, nunca no banco). Quem for enviar dado sensível
 * desidentifica ANTES (src/lib/desidentificar.ts) e grava a trilha de leitura.
 */

export const MODELO_IA = "claude-opus-5";

export interface RespostaEstruturada {
  texto: string;
  modelo: string;
  tokens: { entrada: number; saida: number };
}

/** A IA está configurada (há chave)? Serviço decide se degrada ou barra. */
export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function chamarClaudeEstruturado(opcoes: {
  system: string;
  user: string;
  /** JSON Schema do formato de saída (additionalProperties:false, required). */
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<RespostaEstruturada> {
  if (!iaConfigurada()) {
    throw new ErroHttp(
      503,
      "IA não configurada: defina ANTHROPIC_API_KEY no ambiente para gerar por IA."
    );
  }

  const cliente = new Anthropic();
  const resposta = await cliente.messages.create({
    model: MODELO_IA,
    max_tokens: opcoes.maxTokens ?? 12000,
    thinking: { type: "adaptive" },
    system: opcoes.system,
    messages: [{ role: "user", content: opcoes.user }],
    output_config: {
      format: { type: "json_schema", schema: opcoes.schema },
    },
  });

  if (resposta.stop_reason === "refusal") {
    throw new ErroHttp(422, "A IA recusou a solicitação por política de segurança.");
  }

  const bloco = resposta.content.find((parte) => parte.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new ErroHttp(502, "A IA não devolveu conteúdo de texto.");
  }

  return {
    texto: bloco.text,
    modelo: resposta.model,
    tokens: {
      entrada: resposta.usage.input_tokens,
      saida: resposta.usage.output_tokens,
    },
  };
}
