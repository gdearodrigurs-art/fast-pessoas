import { aposentarPergunta } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idClima } from "../../../identificador";

/** Aposentar: encerra a pergunta sem substituta — ela sai do check-in. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("clima.pergunta.administrar");
    const { id } = await params;
    await aposentarPergunta(sessao, idClima(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
