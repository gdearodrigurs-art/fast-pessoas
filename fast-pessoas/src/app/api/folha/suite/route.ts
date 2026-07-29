import { executarSuite } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Roda a bateria de casos de teste (rh_folha.caso_teste_folha) contra o
 * motor com as versões VIGENTES — PASS/FAIL com diff por caso.
 */
export async function POST() {
  try {
    await exigirPermissao("folha.operar");
    const resultado = await executarSuite();
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
