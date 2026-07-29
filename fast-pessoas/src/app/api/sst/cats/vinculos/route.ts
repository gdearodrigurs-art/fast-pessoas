import { listarVinculosCat } from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Afastamentos de acidente de trabalho disponíveis para vincular à CAT.
 * Exige sst.gerir; sem afastamento.saude.ver o serviço devolve lista VAZIA
 * (o tipo do afastamento é dado de saúde — ausência, não máscara).
 */
export async function GET() {
  try {
    const sessao = await exigirPermissao("sst.gerir");
    const afastamentos = await listarVinculosCat(sessao);
    return Response.json({ afastamentos });
  } catch (erro) {
    return responderErro(erro);
  }
}
