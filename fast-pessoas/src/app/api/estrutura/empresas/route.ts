import { esquemaCriacaoEmpresa } from "@/dominios/estrutura/esquemas";
import {
  criarEmpresa,
  listarEmpresasAdministraveis,
} from "@/dominios/estrutura/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE = "rh.empresa.administrar";

export async function GET() {
  try {
    await exigirPermissao(CHAVE);
    const empresas = await listarEmpresasAdministraveis();
    return Response.json({ empresas });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoEmpresa.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarEmpresa(sessao, analise.data);
    const empresas = await listarEmpresasAdministraveis();
    return Response.json({ empresas }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
