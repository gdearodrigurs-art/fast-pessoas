import { esquemaCriacaoEstabelecimento } from "@/dominios/colaboradores/esquemas";
import {
  criarEstabelecimento,
  listarEstabelecimentosAdministraveis,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("rh.estabelecimento.administrar");
    const estabelecimentos = await listarEstabelecimentosAdministraveis();
    return Response.json({ estabelecimentos });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.estabelecimento.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoEstabelecimento.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarEstabelecimento(sessao, analise.data);
    const estabelecimentos = await listarEstabelecimentosAdministraveis();
    return Response.json({ estabelecimentos }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
