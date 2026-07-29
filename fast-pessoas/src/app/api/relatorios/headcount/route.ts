import { relatorioHeadcount } from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("relatorio.ver");
    return Response.json(await relatorioHeadcount());
  } catch (erro) {
    return responderErro(erro);
  }
}
