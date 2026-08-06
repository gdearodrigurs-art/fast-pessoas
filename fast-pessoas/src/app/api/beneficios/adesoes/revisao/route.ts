import { z } from "zod";
import { solicitarRevisaoValor } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * O colaborador pede revisão do valor de um benefício que ele JÁ TEM (H3).
 *
 * Terceira voz dele no módulo, ao lado do cancelamento — a adesão em si virou
 * ato do DP na H1. O valor aqui é PROPOSTA: quem decide é o DP, em
 * PATCH /api/beneficios/adesoes/revisao/[demandaId].
 */
const esquemaPedido = z.object({
  adesao_id: z.number().int().positive("Informe a adesão"),
  // Dinheiro em campo próprio, nunca no texto: valor em descrição livre não se
  // compara com o concedido nem se barra negativo.
  valor_pedido: z
    .number("Informe o valor que você está pedindo")
    .nonnegative("O valor não pode ser negativo")
    .max(1_000_000, "Valor fora de faixa"),
  motivo: z
    .string()
    .trim()
    .min(10, "Explique o motivo em pelo menos 10 caracteres")
    .max(2000, "Motivo longo demais"),
});

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("adesao.solicitar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaPedido.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path.join(".") || undefined,
        },
        { status: 400 }
      );
    }
    const solicitacao = await solicitarRevisaoValor(
      sessao,
      analise.data.adesao_id,
      analise.data.valor_pedido,
      analise.data.motivo
    );
    return Response.json({ solicitacao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
