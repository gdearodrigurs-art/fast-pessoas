import {
  hojeLocal,
  listarColaboradoresAtivos,
  listarEscalasVigentes,
  listarFeriados,
  listarJornadas,
  listarRegrasBanco,
  opcoesDeEscopo,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Parâmetros do ponto: jornadas (versionadas), escalas vigentes, feriados da
 * janela e regras de banco de horas nos três níveis + o padrão da empresa.
 *
 * Tudo aqui é PARÂMETRO OPERACIONAL — dado versionado com vigência, nunca
 * constante no código. Nada de dado pessoal sensível: nomes e matrículas
 * existem porque a escala é de uma pessoa.
 */
export async function GET(request: Request) {
  try {
    await exigirPermissao("ponto.parametros");
    const busca = new URL(request.url).searchParams;
    const hoje = hojeLocal();
    const ano = Number(busca.get("ano") ?? hoje.slice(0, 4));
    const anoValido =
      Number.isInteger(ano) && ano >= 2020 && ano <= 2100
        ? ano
        : Number(hoje.slice(0, 4));

    const [jornadas, escalas, feriados, regras, escopos, colaboradores] =
      await Promise.all([
        listarJornadas(),
        listarEscalasVigentes(),
        listarFeriados(`${anoValido}-01-01`, `${anoValido}-12-31`),
        listarRegrasBanco(),
        opcoesDeEscopo(),
        listarColaboradoresAtivos(),
      ]);

    return Response.json({
      hoje,
      ano_feriados: anoValido,
      jornadas,
      escalas,
      feriados,
      regras,
      cargos: escopos.cargos,
      estabelecimentos: escopos.estabelecimentos,
      colaboradores,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
