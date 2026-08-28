import { darCiencia } from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirSessaoParaRegularizacao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * A5: a porta é a SESSÃO, não mais exigirPermissao("documento.ver") — a chave
 * é revogável, e perfil sem ela ficava em lockout sem cura quando o documento
 * bloqueante pedia ciência. A autorização fina mora no serviço (darCiencia):
 * documento do ciclo dispensa chave (a pendência é do próprio usuário);
 * documento fora do ciclo continua exigindo documento.ver. A variante de
 * REGULARIZAÇÃO (A8) mantém a rota aberta ao bloqueado — dar ciência é como
 * ele sai do bloqueio.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirSessaoParaRegularizacao();
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const ciencia = await darCiencia(sessao, idNumero);
    return Response.json({ ciencia }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
