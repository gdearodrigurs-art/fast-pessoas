import { esquemaNovaFaixaSalarial } from "@/dominios/colaboradores/esquemas";
import {
  criarFaixaSalarial,
  listarCargosAdministraveis,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.cargo.administrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaFaixaSalarial.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarFaixaSalarial(sessao, idNumero, analise.data);
    const cargos = await listarCargosAdministraveis();
    return Response.json({ cargos }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
