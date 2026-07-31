import {
  alterarParametroPrivacidade,
  obterParametroPrivacidade,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao, exigirPermissao } from "@/lib/sessao";

/**
 * O piso de anonimato (k) dos relatórios agregados — migration 0044.
 *
 * LER é para quem já vê os relatórios: o número aparece na tela junto com a
 * supressão que ele causa, e sem ele a legenda "recorte suprimido" fica sem
 * explicação. Quem administra também lê, para abrir o formulário.
 * ALTERAR exige `privacidade.administrar`, e só ela: baixar o k publica recorte
 * que hoje está suprimido.
 */
export async function GET() {
  try {
    await exigirAlgumaPermissao(["relatorio.ver", "privacidade.administrar"]);
    return Response.json(await obterParametroPrivacidade());
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function PUT(request: Request) {
  try {
    const sessao = await exigirPermissao("privacidade.administrar");
    const corpo = await request.json().catch(() => null);
    return Response.json(await alterarParametroPrivacidade(sessao, corpo));
  } catch (erro) {
    return responderErro(erro);
  }
}
