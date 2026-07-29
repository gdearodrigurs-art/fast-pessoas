import { esquemaLancarVariavel } from "@/dominios/folha/esquemas";
import { lancarVariavel } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/** Lança variável manual — só com a competência aberta. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaLancarVariavel.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const variaveis = await lancarVariavel(sessao, idFolha(id), analise.data);
    return Response.json({ variaveis }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
