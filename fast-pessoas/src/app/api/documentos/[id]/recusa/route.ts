import { esquemaRecusa } from "@/dominios/documentos/esquemas";
import { registrarRecusa } from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissaoParaRegularizacao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Recusa de ciência pelo PRÓPRIO usuário (B2/B6): "li e não aceito", com o
 * hash da versão recusada. A porta continua sendo documento.ver — recusar é
 * um desfecho do mesmo ciclo, não um privilégio — mas pela variante de
 * REGULARIZAÇÃO (A8): o bloqueado precisa poder recusar. Recusar NÃO
 * desbloqueia: o destrave é ciência ou liberação explícita (rh.conduta.liberar).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissaoParaRegularizacao("documento.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => ({}));
    const analise = esquemaRecusa.safeParse(corpo ?? {});
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const recusa = await registrarRecusa(
      sessao,
      idNumero,
      analise.data.motivo ?? null
    );
    return Response.json({ recusa }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
