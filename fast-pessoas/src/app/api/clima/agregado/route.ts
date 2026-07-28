import { obterAgregado } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("clima.agregado.ver");
    const resultado = await obterAgregado();
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
