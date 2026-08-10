import { z } from "zod";
import { aprovarRevisaoValor } from "@/dominios/beneficios/servico";
import { esquemaData } from "@/lib/data-civil";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../../identificador";

/**
 * O DP decide a revisão (H4). O valor que vale é o DELE, não o pedido — os dois
 * ficam na trilha lado a lado.
 *
 * Aprovar encerra a adesão vigente e abre outra com o valor novo, na mesma
 * transação: a cadeia de adesões é o histórico. Negar é a rota de recusa que já
 * existe para solicitação de benefício.
 */
const esquemaDecisao = z.object({
  valor: z
    .number("Informe o valor concedido")
    .nonnegative("O valor não pode ser negativo")
    .max(1_000_000, "Valor fora de faixa"),
  desconto: z
    .number("Informe o desconto")
    .nonnegative("O desconto não pode ser negativo")
    .max(1_000_000, "Desconto fora de faixa"),
  // Nasce vazia na tela: a data decide de quando a folha usa o valor novo, e
  // o serviço recusa data dentro de competência já fechada. `esquemaData` (a
  // fonte única) já faz o ida-e-volta que recusa 30/02 sem estourar no Postgres.
  inicio: esquemaData,
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaDecisao.safeParse(corpo);
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
    const adesao = await aprovarRevisaoValor(
      sessao,
      idNumerico(id),
      analise.data
    );
    return Response.json({ adesao });
  } catch (erro) {
    return responderErro(erro);
  }
}
