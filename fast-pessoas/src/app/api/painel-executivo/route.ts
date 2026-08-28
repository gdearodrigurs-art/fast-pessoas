import { montarPainelExecutivo } from "@/dominios/painel-executivo/servico";
import { CHAVE_PAINEL } from "@/dominios/painel-executivo/esquemas";
import {
  esquemaFiltroEstrutura,
  lerFiltroEstrutura,
} from "@/dominios/estrutura/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Dashboard Executivo — tudo em uma chamada, porque a diretoria abre a tela
 * para ver o conjunto, não um card de cada vez.
 *
 * A guarda é `painel.executivo.ver` e só ela: o card de CUSTO DE PESSOAL é
 * condicionado a `folha.ver` DENTRO do serviço, que confere a chave no banco e
 * devolve o card bloqueado (sem campo de valor) para quem não a tem. Fazer isso
 * no serviço, e não aqui, garante que qualquer outro consumidor futuro desta
 * função herde o mesmo bloqueio.
 *
 * O recorte por registro / lotação / centro de custo vem na query string, com o
 * MESMO esquema da lista de colaboradores (esquemaFiltroEstrutura). Ausente =
 * empresa inteira. Mesmo padrão de app/api/colaboradores/route.ts.
 */
export async function GET(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE_PAINEL);
    const parametros = new URL(request.url).searchParams;
    const analise = esquemaFiltroEstrutura.safeParse(
      lerFiltroEstrutura(parametros)
    );
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    return Response.json(await montarPainelExecutivo(sessao, analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
