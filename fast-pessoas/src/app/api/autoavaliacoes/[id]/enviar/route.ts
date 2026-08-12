import { enviarAutoavaliacao } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idCiclo } from "../../identificador";

/**
 * ENVIA a própria autoavaliação: exige TODO indicador respondido (409 se faltar)
 * e tenta consolidar o ciclo — se o líder já enviou, este envio fecha o par.
 * Enviada é imutável.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.autoavaliar");
    const { id } = await params;
    await enviarAutoavaliacao(sessao, idCiclo(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
