import {
  exigirSessaoNotificacoes,
  marcarTodasComoLidas,
} from "@/dominios/notificacoes/servico";
import { responderErro } from "@/lib/http";

export async function POST() {
  try {
    const sessao = await exigirSessaoNotificacoes();
    const resultado = await marcarTodasComoLidas(sessao);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
