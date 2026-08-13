import { esquemaRegistrarAndamento } from "@/dominios/portais/colaborador-esquemas";
import { registrarAndamentoMeuPdi } from "@/dominios/portais/colaborador-servico";
import { responderErro } from "@/lib/http";
import { idNumerico } from "@/app/api/beneficios/identificador";

/**
 * Registro de andamento numa ação PRÓPRIA do PDI: um texto (o log) e, opcional,
 * o novo estado (pendente/em andamento/concluída). O id é o da ação; o titular
 * sai da sessão e o serviço confere que a ação é dele (404 se não for).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRegistrarAndamento.safeParse(corpo);
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
    await registrarAndamentoMeuPdi(idNumerico(id), analise.data);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return responderErro(erro);
  }
}
