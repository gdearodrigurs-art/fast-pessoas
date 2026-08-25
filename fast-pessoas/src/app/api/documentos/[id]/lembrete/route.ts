import {
  CHAVE_CONDUTA_GERIR,
  enviarLembrete,
} from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Lembrete manual aos PENDENTES da versão vigente (B1): aviso neutro via
 * notificação. Ato de gestão do DP (rh.conduta.gerir) — o projeto não tem
 * agendador, e lembrete fantasma de cron não presta contas a ninguém.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE_CONDUTA_GERIR);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const resultado = await enviarLembrete(sessao, idNumero);
    return Response.json({ lembrete: resultado });
  } catch (erro) {
    return responderErro(erro);
  }
}
