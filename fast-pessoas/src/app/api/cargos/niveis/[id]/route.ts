import { esquemaInativacaoNivelHierarquico } from "@/dominios/colaboradores/esquemas";
import { definirNivelHierarquicoInativo } from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/** Inativar/reativar um nível — o lugar da exclusão (o DELETE é barrado na 0085). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.cargo.administrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaInativacaoNivelHierarquico.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    return Response.json(
      await definirNivelHierarquicoInativo(sessao, idNumero, analise.data.inativo)
    );
  } catch (erro) {
    return responderErro(erro);
  }
}
