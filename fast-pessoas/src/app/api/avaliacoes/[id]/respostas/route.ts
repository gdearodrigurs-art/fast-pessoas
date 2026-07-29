import { esquemaSalvarRespostas } from "@/dominios/avaliacao/esquemas";
import { salvarRascunho } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../identificador";

/** Salva o RASCUNHO do avaliador (subconjunto permitido; envio exige tudo). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.responder");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaSalvarRespostas.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await salvarRascunho(sessao, idAvaliacao(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
