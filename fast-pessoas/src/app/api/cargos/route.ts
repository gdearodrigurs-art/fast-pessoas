import { esquemaCriacaoCargo } from "@/dominios/colaboradores/esquemas";
import {
  criarCargo,
  listarCargosAdministraveis,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("rh.cargo.administrar");
    const cargos = await listarCargosAdministraveis();
    return Response.json({ cargos });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.cargo.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoCargo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarCargo(sessao, analise.data);
    const cargos = await listarCargosAdministraveis();
    return Response.json({ cargos }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
