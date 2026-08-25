import {
  exigirSessaoRs,
  relatorioTempoPorEtapa,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";

/**
 * Tempo mediano por etapa do funil, por cargo × etapa do catálogo — agregado
 * operacional para quem vê o funil (rs.ver/rs.gerir); fechadas + abertas.
 */
export async function GET() {
  try {
    const { pode } = await exigirSessaoRs();
    const linhas = await relatorioTempoPorEtapa(pode);
    return Response.json({ linhas });
  } catch (erro) {
    return responderErro(erro);
  }
}
