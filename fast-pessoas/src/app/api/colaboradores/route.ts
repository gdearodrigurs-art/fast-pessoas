import { type NextRequest } from "next/server";
import {
  esquemaCriacaoColaborador,
  esquemaFiltroColaboradores,
} from "@/dominios/colaboradores/esquemas";
import {
  criarColaborador,
  listarColaboradores,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao, lerSessao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    // Sem chave fixa: o alcance vem do escopo por sessão/papel no repositório
    // (funcionário vê só a própria ficha; gestor, a equipe vigente).
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }
    const parametros = request.nextUrl.searchParams;
    const analise = esquemaFiltroColaboradores.safeParse({
      busca: parametros.get("busca") || undefined,
      status: parametros.get("status") || undefined,
    });
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    const resultado = await listarColaboradores(sessao, analise.data);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.colaborador.editar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoColaborador.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await criarColaborador(sessao, analise.data);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
