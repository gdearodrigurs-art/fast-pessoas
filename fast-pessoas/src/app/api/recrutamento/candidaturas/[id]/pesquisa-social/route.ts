import { esquemaPesquisaSocial } from "@/dominios/recrutamento/esquemas";
import { registrarPesquisaSocial } from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idRecrutamento } from "../../../identificador";

/**
 * Desfecho da pesquisa social (#13c, G3:a) — rs.gerir. Anexo opcional pelo
 * caminho JSON base64 (molde api/documentos POST); ele vai para o GED
 * (rh.documento, categoria própria e oculta 'pesquisa_social', sensível — A2)
 * na mesma transação do desfecho.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rs.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaPesquisaSocial.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await registrarPesquisaSocial(sessao, idRecrutamento(id), analise.data);
    return Response.json({ ok: true }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
