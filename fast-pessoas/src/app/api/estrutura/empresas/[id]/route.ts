import {
  esquemaInativacao,
  esquemaNovaVersaoEmpresa,
} from "@/dominios/estrutura/esquemas";
import {
  criarVersaoEmpresa,
  definirEmpresaInativa,
  listarEmpresasAdministraveis,
} from "@/dominios/estrutura/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE = "rh.empresa.administrar";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/** Renomear/reclassificar: versão nova com vigência, a anterior é encerrada. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaVersaoEmpresa.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarVersaoEmpresa(sessao, idNumero, analise.data);
    const empresas = await listarEmpresasAdministraveis();
    return Response.json({ empresas }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Inativar/reativar. Excluir não existe: quem tem vínculo apontando fica. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaInativacao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await definirEmpresaInativa(sessao, idNumero, analise.data.inativo);
    const empresas = await listarEmpresasAdministraveis();
    return Response.json({ empresas });
  } catch (erro) {
    return responderErro(erro);
  }
}
