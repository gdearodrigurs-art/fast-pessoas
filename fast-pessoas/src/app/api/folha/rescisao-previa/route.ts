import { type NextRequest } from "next/server";
import { calcularPreviaRescisao } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

/**
 * Prévia de valores da RESCISÃO de um processo de desligamento — GET, só
 * leitura, nada é gravado em folha: `?desligamento=<id>`. Payload com VALORES
 * (salário na memória de cálculo) — a leitura grava audit.leitura_sensivel, e
 * a chave é a MESMA que a folha já usa para leitura (`folha.ver`). Molde exato
 * de ferias-previa / decimo-previa.
 *
 * `&fgts_centavos=<inteiro ≥ 0>` é OPCIONAL: o saldo da conta vinculada do
 * FGTS é dado EXTERNO (extrato da Caixa) — sem ele a multa rescisória sai
 * ZERADA e a resposta AVISA (decisão registrada no motor de rescisão).
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirPermissao("folha.ver");
    const parametros = request.nextUrl.searchParams;

    const desligamentoBruto = parametros.get("desligamento");
    const desligamentoId = Number(desligamentoBruto);
    if (
      desligamentoBruto === null ||
      !Number.isInteger(desligamentoId) ||
      desligamentoId <= 0
    ) {
      throw new ErroHttp(
        400,
        "Informe o processo de desligamento: ?desligamento=<id>"
      );
    }

    // Dinheiro trafega em CENTAVOS INTEIROS na borda (regra da casa) — reais
    // com vírgula aqui seria convite a centavo perdido.
    const fgtsBruto = parametros.get("fgts_centavos");
    let saldoFgtsCentavos: number | null = null;
    if (fgtsBruto !== null) {
      saldoFgtsCentavos = Number(fgtsBruto);
      if (!Number.isInteger(saldoFgtsCentavos) || saldoFgtsCentavos < 0) {
        throw new ErroHttp(
          400,
          "Saldo do FGTS inválido: &fgts_centavos=<centavos inteiros ≥ 0> (dado externo — extrato da Caixa); omita para a prévia sair sem a multa, com aviso"
        );
      }
    }

    return Response.json(
      await calcularPreviaRescisao(sessao, desligamentoId, saldoFgtsCentavos)
    );
  } catch (erro) {
    return responderErro(erro);
  }
}
