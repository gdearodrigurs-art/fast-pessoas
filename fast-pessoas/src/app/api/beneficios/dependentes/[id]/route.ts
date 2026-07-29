import { esquemaAtualizacaoDependente } from "@/dominios/beneficios/esquemas";
import {
  atualizarDependente,
  removerDependente,
} from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../identificador";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAtualizacaoDependente.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const dependente = await atualizarDependente(
      sessao,
      idNumerico(id),
      analise.data
    );
    return Response.json({ dependente });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const { id } = await params;
    await removerDependente(sessao, idNumerico(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
