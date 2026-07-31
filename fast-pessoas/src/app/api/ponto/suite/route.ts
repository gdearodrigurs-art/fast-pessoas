import { executarSuitePonto } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Roda a bateria de casos de teste do motor de ponto (rh.caso_teste_ponto),
 * versionada no banco pela migration 0042 — PASS/FAIL com a diferença de cada
 * campo, em minutos.
 *
 * Permissão de PARÂMETROS, não de apuração: quem confere o motor é quem
 * administra jornada, escala e regra de banco — e a bateria vive na tela dele.
 * Nada aqui escreve no banco; o caso é lido e rodado em memória.
 */
export async function POST() {
  try {
    await exigirPermissao("ponto.parametros");
    return Response.json(await executarSuitePonto());
  } catch (erro) {
    return responderErro(erro);
  }
}
