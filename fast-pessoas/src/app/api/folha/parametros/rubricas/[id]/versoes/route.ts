import { esquemaNovaVersaoRubrica } from "@/dominios/folha/esquemas";
import { criarVersaoRubrica } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../../../identificador";

/** Nova versão da rubrica com vigência — a anterior encerra, nunca é editada. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaVersaoRubrica.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarVersaoRubrica(sessao, idFolha(id), analise.data);
    return Response.json({ ok: true }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
