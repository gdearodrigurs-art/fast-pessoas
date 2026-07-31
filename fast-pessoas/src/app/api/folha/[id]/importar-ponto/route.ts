import { importarVariaveisDoPonto } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/**
 * F5 — ligação ponto → folha. Traz a apuração de ponto da MESMA competência
 * (rh.apuracao_ponto) como variáveis de origem 'ponto': HE 50%, HE 100%,
 * adicional noturno e faltas. Reimportar substitui o lote anterior desta
 * origem e não toca no que foi lançado à mão.
 *
 * A chave é `folha.operar`, a mesma do lançamento manual: quem importa está
 * lançando insumo de folha. Ler o ponto não exige chave de ponto porque o que
 * atravessa a fronteira é AGREGADO da competência (minutos), não espelho nem
 * marcação — e o resultado já é dado de folha, com a trilha da folha.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id } = await params;
    // Fila de ponto aberta devolve 409; o corpo com
    // `confirmar_intercorrencias_abertas: true` é o "sim, importe assim mesmo"
    // do DP, e ele vai para a trilha da importação.
    const corpo = await request.json().catch(() => null);
    const resultado = await importarVariaveisDoPonto(sessao, idFolha(id), {
      confirmar_intercorrencias_abertas:
        corpo?.confirmar_intercorrencias_abertas === true,
    });
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
