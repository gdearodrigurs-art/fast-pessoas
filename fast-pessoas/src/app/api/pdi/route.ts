import { listarPainel } from "@/dominios/pdi/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

// Painel do PDI: os PDIs no alcance + os ciclos consolidados que dá para gerar.
export async function GET() {
  try {
    const sessao = await exigirPermissao("pdi.ver");
    const painel = await listarPainel(sessao);
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}
