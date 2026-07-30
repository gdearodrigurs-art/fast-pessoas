import { esquemaConsultaPortal } from "@/dominios/portais/esquemas";
import { montarPortalGestor } from "@/dominios/portais/servico";
import { ErroHttpCampo, responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Portal do gestor — leitura consolidada. A chave da porta é
 * `rh.colaborador.ver` (a mesma de "ver gente"); cada BLOCO reconfere a chave
 * do seu módulo dentro do serviço, e o alcance é sempre a relação
 * gestor→liderado vigente. `gestor_id` só é honrado para quem tem escopo
 * "todos" — o serviço ignora o parâmetro para o papel gestor.
 */
export async function GET(requisicao: Request): Promise<Response> {
  try {
    const sessao = await exigirPermissao("rh.colaborador.ver");
    const url = new URL(requisicao.url);
    const bruto = url.searchParams.get("gestor_id");
    const analise = esquemaConsultaPortal.safeParse(
      bruto === null || bruto === "" ? {} : { gestor_id: bruto }
    );
    if (!analise.success) {
      throw new ErroHttpCampo(400, "Gestor inválido.", "gestor_id");
    }
    return Response.json(await montarPortalGestor(sessao, analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
