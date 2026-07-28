import { esquemaCriacaoMeta } from "@/dominios/indicadores/esquemas";
import { definirMeta, historicoDeMetas } from "@/dominios/indicadores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function analisarId(id: string): number | null {
  const numero = Number(id);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await exigirPermissao("indicador.ver");
    const { id } = await params;
    const idNumero = analisarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const historico = await historicoDeMetas(idNumero);
    return Response.json(historico);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("indicador.administrar");
    const { id } = await params;
    const idNumero = analisarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoMeta.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const meta = await definirMeta(sessao, idNumero, analise.data);
    return Response.json({ meta }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
