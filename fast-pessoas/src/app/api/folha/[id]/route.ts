import { montarVisaoCompetencia } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../identificador";

/**
 * Painel da competência: estado, impedidos, variáveis, folhas com itens e
 * memória. Payload com VALORES — a leitura grava audit.leitura_sensivel.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.ver");
    const { id } = await params;
    const visao = await montarVisaoCompetencia(sessao, idFolha(id));
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}
