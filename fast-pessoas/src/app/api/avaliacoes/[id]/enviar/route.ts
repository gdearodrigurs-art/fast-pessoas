import { enviarAvaliacao } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../identificador";

/**
 * ENVIO + consolidação: exige TODA pergunta com nota OU não observado
 * (parcial continua rascunho — 409). Após o envio, respostas imutáveis.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.responder");
    const { id } = await params;
    await enviarAvaliacao(sessao, idAvaliacao(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
