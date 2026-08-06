import { esquemaMeuDependenteNovo } from "@/dominios/portais/colaborador-esquemas";
import {
  criarMeuDependente,
  listarMeusDependentes,
} from "@/dominios/portais/colaborador-servico";
import { responderErro } from "@/lib/http";

/**
 * Os dependentes DO PRÓPRIO colaborador (onda H5).
 *
 * Nenhuma das duas operações aceita `colaborador_id`: o titular sai da sessão,
 * dentro do serviço. É a mesma forma do portal inteiro — o furo clássico
 * "?colaborador_id=999" não tem por onde nascer, porque não há id de entrada.
 * A chave `dependente.proprio.manter` é conferida em `exigirTitular`.
 *
 * O DP continua com o caminho dele em /api/beneficios/dependentes, intacto.
 */
export async function GET() {
  try {
    return Response.json(await listarMeusDependentes());
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMeuDependenteNovo.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path.join(".") || undefined,
        },
        { status: 400 }
      );
    }
    return Response.json(await criarMeuDependente(analise.data), {
      status: 201,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
