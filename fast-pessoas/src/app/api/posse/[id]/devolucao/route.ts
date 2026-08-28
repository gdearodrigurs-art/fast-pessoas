import { esquemaDevolucao } from "@/dominios/posse/esquemas";
import { registrarDevolucaoPosse } from "@/dominios/posse/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/** Devolução do patrimônio: momento do servidor (now()), uma única vez. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.posse.registrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    // Corpo vazio ou objeto — a devolução não carrega dados do cliente.
    const corpo = await request.json().catch(() => ({}));
    const analise = esquemaDevolucao.safeParse(corpo ?? {});
    if (!analise.success) {
      return Response.json({ erro: "Dados inválidos" }, { status: 400 });
    }
    const devolucao = await registrarDevolucaoPosse(sessao, idNumero);
    return Response.json({ devolucao });
  } catch (erro) {
    return responderErro(erro);
  }
}
