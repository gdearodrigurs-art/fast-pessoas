import { esquemaMeuDependenteEdicao } from "@/dominios/portais/colaborador-esquemas";
import {
  atualizarMeuDependente,
  removerMeuDependente,
} from "@/dominios/portais/colaborador-servico";
import { responderErro } from "@/lib/http";
import { idNumerico } from "@/app/api/beneficios/identificador";

/**
 * Alterar e remover um dependente PRÓPRIO (onda H5).
 *
 * Aqui existe um id na entrada — PATCH e DELETE precisam nomear a linha —, e é
 * exatamente por isso que o serviço reconfere o titular DENTRO da transação,
 * com a linha travada (`linhaDoTitular`). Id de dependente de outra pessoa
 * responde o mesmo 404 de id inexistente: quem sonda não descobre nem que a
 * linha existe.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMeuDependenteEdicao.safeParse(corpo);
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
    return Response.json(
      await atualizarMeuDependente(idNumerico(id), analise.data)
    );
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await removerMeuDependente(idNumerico(id));
    return new Response(null, { status: 204 });
  } catch (erro) {
    return responderErro(erro);
  }
}
