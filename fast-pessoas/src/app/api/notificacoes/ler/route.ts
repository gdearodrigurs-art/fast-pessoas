import { esquemaMarcarLidas } from "@/dominios/notificacoes/esquemas";
import {
  exigirSessaoNotificacoes,
  marcarComoLidas,
} from "@/dominios/notificacoes/servico";
import { responderErro } from "@/lib/http";

// Marca lida SOMENTE nas próprias notificações: o UPDATE filtra por
// usuario_id da sessão — id alheio na lista simplesmente não afeta nada.
export async function POST(request: Request) {
  try {
    const sessao = await exigirSessaoNotificacoes();
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMarcarLidas.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await marcarComoLidas(sessao, analise.data.ids);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
