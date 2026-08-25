import { minhaPosse } from "@/dominios/posse/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Posse de patrimônio do PRÓPRIO colaborador (titular) — sem chave de posse:
 * funcionário vê os próprios itens e dá ciência. A chave documento.ver é o
 * guarda-chuva mínimo de todo papel autenticado do app. Molde literal de
 * /api/sst/epis/entregas/minhas (pendência 16.1).
 */
export async function GET() {
  try {
    const sessao = await exigirPermissao("documento.ver");
    const itens = await minhaPosse(sessao);
    return Response.json({ itens });
  } catch (erro) {
    return responderErro(erro);
  }
}
