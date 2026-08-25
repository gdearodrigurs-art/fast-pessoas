import { lideradosDaSubArvore } from "./esquemas";
import { listarPessoasDoQuadro } from "./repositorio";

/**
 * A SUB-ÁRVORE de liderados de um colaborador, carregada do quadro vigente
 * (decisão A2:a — "minha equipe" é a sub-árvore inteira, uma semântica só).
 *
 * Reusa `listarPessoasDoQuadro` — a MESMA leitura plana do organograma: quadro
 * = status <> 'desligado', gestor = relação vigente (rg.fim_vigencia IS NULL).
 * A caminhada em si é a função pura de organograma/esquemas.ts (visitados +
 * teto de profundidade; ciclo não trava). Devolve só os LIDERADOS (a raiz fica
 * de fora — "eu" entra no escopo pela cláusula de pessoa).
 *
 * Mora num módulo próprio, e não no serviço do organograma, para o domínio de
 * colaboradores poder importá-la sem ciclo: organograma/servico importa
 * colaboradores/servico (resolverEscopo), e este arquivo só depende do
 * repositório e dos esquemas.
 */
export async function carregarLideradosDaSubArvore(
  colaboradorId: number
): Promise<number[]> {
  const pessoas = await listarPessoasDoQuadro();
  return lideradosDaSubArvore(colaboradorId, pessoas);
}
