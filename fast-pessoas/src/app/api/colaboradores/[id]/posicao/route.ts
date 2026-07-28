import { esquemaCriacaoPosicao } from "@/dominios/colaboradores/esquemas";
import {
  obterPosicoes,
  registrarPosicao,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Salário é dado sensível: chave própria e leitura gravada na trilha.
    const sessao = await exigirPermissao("rh.posicao.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const resultado = await obterPosicoes(sessao, idNumero);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.posicao.editar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoPosicao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await registrarPosicao(sessao, idNumero, analise.data);
    const resultado = await obterPosicoes(sessao, idNumero);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
