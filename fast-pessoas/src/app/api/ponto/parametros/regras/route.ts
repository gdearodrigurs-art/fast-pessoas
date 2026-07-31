import { esquemaNovaRegraBanco } from "@/dominios/ponto/esquemas";
import { criarVersaoRegraBanco } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Nova VERSÃO de regra de banco de horas em um dos escopos: sem nenhum id =
 * padrão da empresa; unidade; cargo; pessoa. A resolução na apuração é do mais
 * específico para o mais geral (pessoa → cargo → unidade → empresa).
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.parametros");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaRegraBanco.safeParse(corpo);
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
    const id = await criarVersaoRegraBanco(sessao, analise.data);
    return Response.json({ regra_versao_id: id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
