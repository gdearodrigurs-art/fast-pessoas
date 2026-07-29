import { apurarValoresIndicadores } from "@/dominios/indicadores/valores";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("indicador.ver");
    const valores = await apurarValoresIndicadores();
    return Response.json({ valores });
  } catch (erro) {
    return responderErro(erro);
  }
}
