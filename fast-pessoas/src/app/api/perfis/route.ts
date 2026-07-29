import { montarPainelPerfis } from "@/dominios/usuarios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("perfil.administrar");
    const painel = await montarPainelPerfis();
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}
