import { ativarVersaoModelo } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../../identificador";

/**
 * Ativa o rascunho: valida somas = 100 e faixas contíguas 0–100, encerra a
 * versão anterior. Vale só para ciclos abertos DEPOIS — sem recálculo.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.configurar");
    const { id } = await params;
    await ativarVersaoModelo(sessao, idAvaliacao(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
