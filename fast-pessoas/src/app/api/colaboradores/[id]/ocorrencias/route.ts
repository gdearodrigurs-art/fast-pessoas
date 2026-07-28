import { esquemaCriacaoOcorrencia } from "@/dominios/colaboradores/esquemas";
import {
  listarOcorrenciasColaborador,
  registrarOcorrencia,
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
    const resultado = await listarOcorrenciasColaborador(sessao, idNumero);
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
    const sessao = await exigirPermissao("rh.ocorrencia.registrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoOcorrencia.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const ocorrencia = await registrarOcorrencia(sessao, idNumero, analise.data);
    return Response.json({ ocorrencia }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
