import { esquemaEnvioRespostas } from "@/dominios/pesquisas/esquemas";
import { obterFormulario, responder } from "@/dominios/pesquisas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/** Questionário da pesquisa aberta, com a marca de já respondida. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pesquisa.responder");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const formulario = await obterFormulario(sessao, idNumero);
    return Response.json(formulario);
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Envio das respostas. Anônimo: a resposta grava só a unidade; a participação
 * (que impede o envio duplicado) vai para tabela separada, na mesma transação.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pesquisa.responder");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEnvioRespostas.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await responder(sessao, idNumero, analise.data);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
