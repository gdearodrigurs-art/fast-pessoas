import { esquemaAjustarPdi } from "@/dominios/pdi/esquemas";
import { ajustarPdi, verPdi } from "@/dominios/pdi/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

function idPdi(valor: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ErroHttp(400, "id de PDI inválido");
  }
  return n;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pdi.ver");
    const { id } = await params;
    const pdi = await verPdi(sessao, idPdi(id));
    return Response.json({ pdi });
  } catch (erro) {
    return responderErro(erro);
  }
}

// Ajuste do gestor: substitui o conteúdo (só enquanto rascunho).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pdi.gerar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAjustarPdi.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        { erro: problema?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await ajustarPdi(sessao, idPdi(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
