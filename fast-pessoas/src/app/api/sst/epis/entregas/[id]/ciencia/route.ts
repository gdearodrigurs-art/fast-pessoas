import { darCienciaEntregaEpi } from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Ciência do TITULAR sobre a entrega de EPI: o serviço confere que o usuário
 * é o colaborador da entrega e reusa a ciência do GED sobre o termo.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("documento.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const ciencia = await darCienciaEntregaEpi(sessao, idNumero);
    return Response.json({ ciencia }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
