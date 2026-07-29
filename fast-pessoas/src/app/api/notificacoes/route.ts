import { esquemaListagem } from "@/dominios/notificacoes/esquemas";
import {
  exigirSessaoNotificacoes,
  listarMinhas,
} from "@/dominios/notificacoes/servico";
import { responderErro } from "@/lib/http";

// Sem chave de permissão DE PROPÓSITO: a listagem é SEMPRE do usuário da
// sessão (filtro no SQL do repositório) — não existe "ver notificação alheia".
export async function GET(request: Request) {
  try {
    const sessao = await exigirSessaoNotificacoes();
    const { searchParams } = new URL(request.url);
    const analise = esquemaListagem.safeParse({
      antes_de: searchParams.get("antes_de") ?? undefined,
    });
    if (!analise.success) {
      return Response.json(
        { erro: "Parâmetro antes_de inválido" },
        { status: 400 }
      );
    }
    const visao = await listarMinhas(sessao, analise.data.antes_de);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}
