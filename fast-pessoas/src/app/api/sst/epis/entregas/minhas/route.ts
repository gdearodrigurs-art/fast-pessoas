import { minhasEntregasEpi } from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Entregas de EPI do PRÓPRIO colaborador (titular) — sem chave de SST:
 * funcionário vê os próprios termos e dá ciência. A chave documento.ver é o
 * guarda-chuva mínimo de todo papel autenticado do app.
 */
export async function GET() {
  try {
    const sessao = await exigirPermissao("documento.ver");
    const entregas = await minhasEntregasEpi(sessao);
    return Response.json({ entregas });
  } catch (erro) {
    return responderErro(erro);
  }
}
