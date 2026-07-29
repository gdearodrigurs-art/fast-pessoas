import { removerVariavel } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../../identificador";

/** Remove variável lançada — edição = remover + lançar de novo (só em aberta). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; variavelId: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id, variavelId } = await params;
    const variaveis = await removerVariavel(
      sessao,
      idFolha(id),
      idFolha(variavelId)
    );
    return Response.json({ variaveis });
  } catch (erro) {
    return responderErro(erro);
  }
}
