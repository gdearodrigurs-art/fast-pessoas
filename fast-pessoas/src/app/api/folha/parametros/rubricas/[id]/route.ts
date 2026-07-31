import { esquemaEncerrarRubrica } from "@/dominios/folha/esquemas";
import { encerrarRubrica } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../../identificador";

/**
 * ENCERRA a rubrica por vigência — não existe DELETE (a versão encerrada é
 * imutável no banco e o holerite já calculado aponta para ela). A versão
 * vigente ganha fim de vigência e a rubrica sai do seletor de lançamento.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEncerrarRubrica.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await encerrarRubrica(sessao, idFolha(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
