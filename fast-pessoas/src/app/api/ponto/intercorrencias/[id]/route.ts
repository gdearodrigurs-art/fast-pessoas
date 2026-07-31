import { esquemaTratarIntercorrencia } from "@/dominios/ponto/esquemas";
import { tratarIntercorrencia } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idPonto } from "../../identificador";

/**
 * Fecha a intercorrência: corrigida, justificada ou ignorada. Justificar ou
 * ignorar EXIGE observação — é o texto que a fiscalização lê. Corrigir de
 * verdade é outra coisa: a marcação nova entra por POST /api/ponto/marcacoes e
 * a intercorrência é fechada aqui, na sequência.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("ponto.administrar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaTratarIntercorrencia.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path.join(".") || undefined,
        },
        { status: 400 }
      );
    }
    await tratarIntercorrencia(sessao, idPonto(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
