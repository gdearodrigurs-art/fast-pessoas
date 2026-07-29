import {
  valorIndicadorAdesaoPesquisa,
  valorIndicadorEnps,
} from "@/dominios/pesquisas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Valores que este módulo publica para a Central de Metas (chaves
 * `adesao_pesquisa` e `enps` do catálogo criado na 0022). A Central consome as
 * FUNÇÕES diretamente pelo registry de src/dominios/indicadores/valores.ts —
 * esta rota existe para conferência/observabilidade e para que a apuração possa
 * ser verificada sem abrir o banco. Só agregado: percentual e pontos, nunca
 * resposta nem pessoa.
 */
export async function GET() {
  try {
    await exigirPermissao("pesquisa.resultado.ver");
    const [adesao_pesquisa, enps] = await Promise.all([
      valorIndicadorAdesaoPesquisa(),
      valorIndicadorEnps(),
    ]);
    return Response.json({ adesao_pesquisa, enps });
  } catch (erro) {
    return responderErro(erro);
  }
}
