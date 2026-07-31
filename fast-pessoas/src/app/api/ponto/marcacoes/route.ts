import { esquemaAjusteMarcacao } from "@/dominios/ponto/esquemas";
import { ajustarMarcacao } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Correção de ponto. NUNCA edita a batida anterior: grava uma marcação nova
 * com origem `ajuste_manual`, justificativa obrigatória e o ponteiro para a
 * que ela substitui (ou `anular: true` para tirar da apuração uma batida
 * indevida). A tabela rh.marcacao é append-only no banco — o trigger recusa
 * UPDATE mesmo que alguém tente por fora.
 *
 * Depois de ajustar, reapure a competência: o motor volta a rodar sobre as
 * marcações válidas e o banco de horas recebe estorno + novo lançamento.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.ajustar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAjusteMarcacao.safeParse(corpo);
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
    const id = await ajustarMarcacao(sessao, analise.data);
    return Response.json({ marcacao_id: id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
