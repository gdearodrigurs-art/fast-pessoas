import {
  esquemaInativacaoCategoria,
  esquemaNomeCategoria,
} from "@/dominios/desligamento/esquemas";
import {
  definirCategoriaInativa,
  renomearCategoria,
} from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE_ADMIN = "desligamento.categoria.administrar";

function idCategoria(valor: string): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Renomear: mexe no rótulo, nunca na chave — o histórico segue na chave. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE_ADMIN);
    const { id } = await params;
    const idNumero = idCategoria(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNomeCategoria.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const categorias = await renomearCategoria(sessao, idNumero, analise.data);
    return Response.json({ categorias });
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Inativar/reativar. Não existe DELETE aqui: o trigger da 0054 barra exclusão. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE_ADMIN);
    const { id } = await params;
    const idNumero = idCategoria(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaInativacaoCategoria.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const categorias = await definirCategoriaInativa(
      sessao,
      idNumero,
      analise.data.inativa
    );
    return Response.json({ categorias });
  } catch (erro) {
    return responderErro(erro);
  }
}
