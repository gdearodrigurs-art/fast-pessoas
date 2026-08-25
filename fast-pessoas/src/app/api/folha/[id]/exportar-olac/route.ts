import { exportarOlac } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/**
 * EXPORTAÇÃO OLAC — o arquivo da folha para a contabilidade, no layout NOSSO
 * (decisão E4 do docs/20: nós definimos, a OLAC se adapta; o MESMO layout vale
 * na volta, em POST importar-olac). Fonte completa do layout:
 * docs/anexos/layout-olac.md e src/dominios/folha/olac.ts.
 *
 *   CSV UTF-8, separador ';', 1 linha de cabeçalho, uma linha por
 *   colaborador × rubrica:
 *     competencia;empresa_cnpj;matricula;colaborador;rubrica;rubrica_nome;
 *     natureza;conta_contabil;valor
 *   competencia MM/AAAA · cnpj 14 dígitos (vazio = sem apropriação) ·
 *   rubrica = código de 4 dígitos do nosso catálogo · conta_contabil do
 *   de-para vigente na competência (E3:a; vazio = sem de-para) · valor em
 *   reais "3500,00" (vírgula, 2 casas, sem milhar, sempre positivo — o sinal
 *   é da natureza).
 *
 * Registra o lote (rh_folha.lote_olac, direção 'exportacao') e a leitura
 * sensível — o arquivo carrega valor por pessoa. Download em attachment,
 * molde api/documentos/[id]/download.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id } = await params;
    const arquivo = await exportarOlac(sessao, idFolha(id));
    const conteudo = Buffer.from(arquivo.conteudo, "utf8");
    return new Response(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Length": String(conteudo.length),
        // Nome é ASCII por construção (olac-folha-AAAA-MM.csv).
        "Content-Disposition": `attachment; filename="${arquivo.nome_arquivo}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
