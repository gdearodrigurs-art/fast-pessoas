import { type NextRequest } from "next/server";
import { calcularPreviaDecimo } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

/**
 * Prévia de UMA parcela do 13º de um colaborador — GET, só leitura, nada é
 * gravado em folha: `?colaborador=<id>&ano=<aaaa>&parcela=<1|2>`. Payload com
 * VALORES (salário na memória de cálculo) — a leitura grava
 * audit.leitura_sensivel, e a chave é a MESMA que a folha já usa para leitura
 * (`folha.ver`). Molde exato de ferias-previa.
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirPermissao("folha.ver");
    const parametros = request.nextUrl.searchParams;

    const colaboradorBruto = parametros.get("colaborador");
    const colaboradorId = Number(colaboradorBruto);
    if (
      colaboradorBruto === null ||
      !Number.isInteger(colaboradorId) ||
      colaboradorId <= 0
    ) {
      throw new ErroHttp(400, "Informe o colaborador: ?colaborador=<id>");
    }

    const anoBruto = parametros.get("ano");
    const ano = Number(anoBruto);
    // A mesma régua da competência (esquemaAbrirCompetencia): fora dela é
    // digitação, não pedido.
    if (anoBruto === null || !Number.isInteger(ano) || ano < 2020 || ano > 2100) {
      throw new ErroHttp(400, "Informe o ano do 13º: &ano=<aaaa> (2020–2100)");
    }

    const parcelaBruta = parametros.get("parcela");
    const parcela = Number(parcelaBruta);
    if (parcelaBruta === null || (parcela !== 1 && parcela !== 2)) {
      throw new ErroHttp(
        400,
        "Informe a parcela do 13º: &parcela=1 (adiantamento) ou &parcela=2 (quitação)"
      );
    }

    return Response.json(
      await calcularPreviaDecimo(sessao, colaboradorId, ano, parcela)
    );
  } catch (erro) {
    return responderErro(erro);
  }
}
