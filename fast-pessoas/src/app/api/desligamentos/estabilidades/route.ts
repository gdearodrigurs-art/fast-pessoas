import { NextRequest } from "next/server";
import { previaEstabilidades } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Prévia do gate de estabilidades para o wizard: só a verificação automática
 * (afastamento acidentário — o fato, nunca o conteúdo de saúde). As demais
 * estabilidades são declaração humana obrigatória no próprio wizard.
 */
export async function GET(request: NextRequest) {
  try {
    await exigirPermissao("desligamento.iniciar");
    const valor = Number(request.nextUrl.searchParams.get("colaborador_id"));
    if (!Number.isInteger(valor) || valor <= 0) {
      return Response.json(
        { erro: "Informe um colaborador válido." },
        { status: 400 }
      );
    }
    const previa = await previaEstabilidades(valor);
    return Response.json(previa);
  } catch (erro) {
    return responderErro(erro);
  }
}
