import { esquemaModeloAdmissao } from "@/dominios/admissao/esquemas";
import {
  montarPainelModelos,
  salvarModeloAdmissao,
} from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("admissao.modelo.administrar");
    const painel = await montarPainelModelos(sessao);
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Salva uma nova versão ATIVA do modelo da família (o vínculo, ou geral). Encerra
 * a anterior no mesmo ato — o modelo é sempre versão nova, nunca edição da ativa.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("admissao.modelo.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaModeloAdmissao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const criado = await salvarModeloAdmissao(sessao, analise.data);
    return Response.json(criado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
