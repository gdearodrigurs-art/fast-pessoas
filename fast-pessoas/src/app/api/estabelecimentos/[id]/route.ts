import { esquemaInativacaoEstabelecimento } from "@/dominios/colaboradores/esquemas";
import {
  definirEstabelecimentoInativo,
  listarEstabelecimentosAdministraveis,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Inativar/reativar a LOTAÇÃO (local físico). Excluir não existe: quem já
 * trabalhou ali continua tendo passado, e a FK do banco é a rede de segurança.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.estabelecimento.administrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaInativacaoEstabelecimento.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await definirEstabelecimentoInativo(sessao, idNumero, analise.data.inativo);
    const estabelecimentos = await listarEstabelecimentosAdministraveis();
    return Response.json({ estabelecimentos });
  } catch (erro) {
    return responderErro(erro);
  }
}
