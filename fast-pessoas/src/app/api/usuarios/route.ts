import { esquemaCriacaoUsuario } from "@/dominios/usuarios/esquemas";
import { criarUsuario, listarUsuarios } from "@/dominios/usuarios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("usuario.administrar");
    const usuarios = await listarUsuarios();
    return Response.json({ usuarios });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("usuario.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoUsuario.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await criarUsuario(sessao, analise.data);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
