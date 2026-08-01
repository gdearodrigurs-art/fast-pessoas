import { aplicarEfeitoProgramado } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idDemanda } from "../../identificador";

// Escreve no cadastro o efeito de uma movimentação JÁ APROVADA cuja data
// pretendida chegou. É a segunda metade do par que a Onda I separou: a
// aprovação decide, esta rota executa — e ela nunca executa antes da data.
//
// A chave é `rh.posicao.editar`, a mesma que autoriza mexer em posição e
// alocação à mão, porque é exatamente isso que aplicar o efeito escreve. A
// transferência entre empresas exige, além dela, `movimentacao.transferir_empresa`
// — quem confere isso é o serviço, junto com a data, a cadeia e o estado do
// pedido.
//
// Não há agendador neste sistema, então quem chama é o DP, pela demanda que a
// aprovação já colocou na fila dele com os demais trâmites da data. Se um dia
// houver um, ele chama esta mesma rota.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.posicao.editar");
    const { id } = await params;
    const pedido = await aplicarEfeitoProgramado(sessao, idDemanda(id));
    return Response.json({ pedido });
  } catch (erro) {
    return responderErro(erro);
  }
}
