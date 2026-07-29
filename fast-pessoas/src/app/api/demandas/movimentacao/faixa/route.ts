import { faixaDoCargoDestino } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

// Faixa vigente do cargo destino — o controle de enquadramento na tela. Dado de
// remuneração: a leitura grava audit.leitura_sensivel no serviço.
export async function GET(request: Request) {
  try {
    const sessao = await exigirPermissao("movimentacao.solicitar");
    const { searchParams } = new URL(request.url);
    const cargoId = Number(searchParams.get("cargo_id"));
    if (!Number.isInteger(cargoId) || cargoId <= 0) {
      throw new ErroHttp(400, "Cargo inválido");
    }
    const faixa = await faixaDoCargoDestino(sessao, cargoId);
    return Response.json({ faixa });
  } catch (erro) {
    return responderErro(erro);
  }
}
