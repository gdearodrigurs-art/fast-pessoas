import { esquemaAtualizacaoUsuario } from "@/dominios/usuarios/esquemas";
import { atualizarUsuario } from "@/dominios/usuarios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("usuario.administrar");
    const { id } = await params;
    const idNumero = Number(id);
    if (!Number.isInteger(idNumero) || idNumero <= 0) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAtualizacaoUsuario.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const usuario = await atualizarUsuario(sessao, idNumero, analise.data);
    return Response.json({ usuario });
  } catch (erro) {
    return responderErro(erro);
  }
}
