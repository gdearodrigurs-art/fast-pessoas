import { montarVisaoParametros } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** Catálogo de rubricas e versões das tabelas legais (sem valores de pessoas). */
export async function GET() {
  try {
    await exigirPermissao("folha.parametros");
    return Response.json(await montarVisaoParametros());
  } catch (erro) {
    return responderErro(erro);
  }
}
