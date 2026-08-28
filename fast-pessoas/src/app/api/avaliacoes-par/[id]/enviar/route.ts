import { enviarAvaliacaoDePar } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idCiclo } from "../../identificador";

/**
 * ENVIA a própria avaliação de par: exige TODO indicador respondido (409 se
 * faltar). NÃO consolida nada — os pares são opcionais. Enviada é imutável.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.avaliar_par");
    const { id } = await params;
    await enviarAvaliacaoDePar(sessao, idCiclo(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
