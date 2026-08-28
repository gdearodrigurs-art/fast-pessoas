import { type NextRequest } from "next/server";
import { calcularPreviaFerias } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

/**
 * Prévia de valores de UMA programação de férias — GET, só leitura, nada é
 * gravado em folha: `?programacao=<id>`. Payload com VALORES (salário na
 * memória de cálculo) — a leitura grava audit.leitura_sensivel, e a chave é a
 * MESMA que a folha já usa para leitura (`folha.ver`).
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirPermissao("folha.ver");
    const parametro = request.nextUrl.searchParams.get("programacao");
    const programacaoId = Number(parametro);
    if (
      parametro === null ||
      !Number.isInteger(programacaoId) ||
      programacaoId <= 0
    ) {
      throw new ErroHttp(
        400,
        "Informe a programação de férias: ?programacao=<id>"
      );
    }
    return Response.json(await calcularPreviaFerias(sessao, programacaoId));
  } catch (erro) {
    return responderErro(erro);
  }
}
