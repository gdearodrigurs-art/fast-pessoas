import { esquemaCriacaoAcao } from "@/dominios/colaboradores/esquemas";
import {
  criarAcao,
  listarAcoesColaborador,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao, lerSessao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const acoes = await listarAcoesColaborador(sessao, idNumero);
    return Response.json({ acoes });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Mesma chave do feedback: gestor/rh/dp registram acompanhamento; o
    // serviço restringe o gestor à equipe vigente.
    const sessao = await exigirPermissao("rh.feedback.registrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoAcao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const acoes = await criarAcao(sessao, idNumero, analise.data);
    return Response.json({ acoes }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
