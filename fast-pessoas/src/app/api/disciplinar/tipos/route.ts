import {
  esquemaCriacaoTipoMedida,
  esquemaInativacaoTipoMedida,
} from "@/dominios/disciplinar/esquemas";
import {
  criarTipoMedida,
  definirTipoInativo,
  obterCatalogoTipos,
} from "@/dominios/disciplinar/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE_ADMIN = "rh.disciplinar.tipo.administrar";

/** Catálogo de tipos de medida disciplinar (administrável — eixo 9). */
export async function GET() {
  try {
    await exigirPermissao(CHAVE_ADMIN);
    return Response.json(await obterCatalogoTipos());
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE_ADMIN);
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoTipoMedida.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const tipos = await criarTipoMedida(sessao, analise.data);
    return Response.json({ tipos }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Inativar/reativar. Não existe DELETE: o trigger da 0080 barra a exclusão. */
export async function PATCH(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE_ADMIN);
    const corpo = await request.json().catch(() => null);
    const id = Number((corpo as { id?: unknown })?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const analise = esquemaInativacaoTipoMedida.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const tipos = await definirTipoInativo(sessao, id, analise.data.inativo);
    return Response.json({ tipos });
  } catch (erro) {
    return responderErro(erro);
  }
}
