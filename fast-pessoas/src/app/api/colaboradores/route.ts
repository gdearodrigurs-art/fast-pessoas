import { type NextRequest } from "next/server";
import {
  esquemaCriacaoColaborador,
  esquemaFiltroColaboradores,
} from "@/dominios/colaboradores/esquemas";
import {
  criarColaborador,
  listarColaboradores,
} from "@/dominios/colaboradores/servico";
import { lerFiltroEstrutura } from "@/dominios/estrutura/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao, exigirSessao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    // Sem chave fixa: o alcance vem do escopo por sessão/papel no repositório
    // (funcionário vê só a própria ficha; gestor, a equipe vigente). "Sem chave"
    // não é "sem guarda": `exigirSessao` faz as mesmas duas checagens de
    // `exigirPermissao` — autenticado e 2FA concluído — e só dispensa a chave.
    const sessao = await exigirSessao();
    const parametros = request.nextUrl.searchParams;
    const analise = esquemaFiltroColaboradores.safeParse({
      busca: parametros.get("busca") || undefined,
      status: parametros.get("status") || undefined,
      // Registro, lotação e centro de custo: combináveis entre si e com os
      // dois acima. Ausente = não recorta por aquele campo.
      ...lerFiltroEstrutura(parametros),
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
