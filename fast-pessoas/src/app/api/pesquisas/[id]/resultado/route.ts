import { obterResultado } from "@/dominios/pesquisas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Resultado agregado. O serviço aplica o k-anonimato de 5 em TODO recorte:
 * abaixo do mínimo o payload sai sem valor e sem contagem — só o rótulo
 * "amostra insuficiente". Comentários de texto livre nunca carregam pessoa nem
 * unidade e só chegam a quem tem esta chave.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pesquisa.resultado.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const resultado = await obterResultado(sessao, idNumero);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
