import { relatorioComposicaoFamiliar } from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("relatorio.ver");
    // Fonte é rh.dependente (dado de TERCEIRO): só contagem sai, nunca nome
    // de dependente; leitura registrada em audit.leitura_sensivel.
    return Response.json(await relatorioComposicaoFamiliar(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}
