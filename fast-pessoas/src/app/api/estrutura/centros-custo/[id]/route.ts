import {
  esquemaInativacao,
  esquemaNovaVersaoCentroCusto,
} from "@/dominios/estrutura/esquemas";
import {
  criarVersaoCentroCusto,
  definirCentroCustoInativo,
  listarCentrosCustoAdministraveis,
} from "@/dominios/estrutura/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE = "rh.centro_custo.administrar";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/** Renomear: versão nova com vigência. O código não muda — é identidade contábil. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaVersaoCentroCusto.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarVersaoCentroCusto(sessao, idNumero, analise.data);
    const centros_custo = await listarCentrosCustoAdministraveis();
    return Response.json({ centros_custo }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaInativacao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await definirCentroCustoInativo(sessao, idNumero, analise.data.inativo);
    const centros_custo = await listarCentrosCustoAdministraveis();
    return Response.json({ centros_custo });
  } catch (erro) {
    return responderErro(erro);
  }
}
