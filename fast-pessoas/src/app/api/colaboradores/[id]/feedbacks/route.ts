import { esquemaCriacaoFeedback } from "@/dominios/colaboradores/esquemas";
import {
  listarFeedbacksColaborador,
  registrarFeedback,
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
    const resultado = await listarFeedbacksColaborador(sessao, idNumero);
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
    // Gestor tem a chave, mas o serviço restringe ao escopo (equipe vigente).
    const sessao = await exigirPermissao("rh.feedback.registrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoFeedback.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const feedback = await registrarFeedback(sessao, idNumero, analise.data);
    return Response.json({ feedback }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
