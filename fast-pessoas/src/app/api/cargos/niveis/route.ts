import { esquemaCriacaoNivelHierarquico } from "@/dominios/colaboradores/esquemas";
import {
  criarNivelHierarquico,
  obterNiveisHierarquicos,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao, exigirPermissao } from "@/lib/sessao";

/**
 * Catálogo de níveis hierárquicos (A6:a — administrável, eixo 9). Leitura em
 * dois níveis, como /api/cargos: quem administra vê TODOS (inclusive inativos,
 * para reativar); quem só lê cargo (`rh.cargo.ver`) vê os ativos — é o que o
 * seletor e a coluna da tabela precisam.
 */
export async function GET() {
  try {
    const { concedidas } = await exigirAlgumaPermissao([
      "rh.cargo.administrar",
      "rh.cargo.ver",
    ]);
    const apenasAtivos = !concedidas.has("rh.cargo.administrar");
    return Response.json(await obterNiveisHierarquicos(apenasAtivos));
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.cargo.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoNivelHierarquico.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    return Response.json(await criarNivelHierarquico(sessao, analise.data), {
      status: 201,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
