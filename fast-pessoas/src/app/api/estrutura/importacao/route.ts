import { esquemaCarga } from "@/dominios/estrutura/esquemas";
import {
  importarEstrutura,
  listarLotesDeCarga,
} from "@/dominios/estrutura/importacao-servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE = "sistema.carga.importar";

/** Histórico dos lotes de carga de ESTRUTURA já importados. */
export async function GET() {
  try {
    await exigirPermissao(CHAVE);
    const lotes = await listarLotesDeCarga("estrutura");
    return Response.json({
      lotes: lotes.map((lote) => ({
        id: lote.id,
        arquivo: lote.arquivo,
        linhas_lidas: lote.linhas_lidas,
        linhas_aceitas: lote.linhas_aceitas,
        linhas_ja_existiam: lote.linhas_ja_existiam,
        linhas_rejeitadas: lote.linhas_rejeitadas,
        importado_em: lote.importado_em,
      })),
    });
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * CARGA INICIAL DE ESTRUTURA por planilha CSV — layout NOSSO (decisão F3/E4,
 * docs/20: nós definimos o layout e a origem exporta neste formato).
 *
 * 7 colunas, separador ; por padrão, com ou sem linha de cabeçalho:
 *
 *   empresa ; cnpj ; razao_social ; tipo ; estabelecimento ; cc_codigo ; cc_nome
 *
 *   empresa          nome fantasia da empresa do grupo (obrigatório)
 *   cnpj             14 dígitos com ou sem máscara; vazio = ainda sem CNPJ
 *   razao_social     opcional
 *   tipo             matriz | filial — só é exigido quando a linha CRIA a empresa
 *   estabelecimento  nome da unidade (LOTAÇÃO) — opcional por linha
 *   cc_codigo        código do centro de custo — opcional por linha
 *   cc_nome          nome do centro de custo (junto com cc_codigo)
 *
 * Aceita as duas formas do importador de ponto: `multipart/form-data` com o
 * campo `arquivo`, ou `application/json` com `conteudo` (texto puro ou base64
 * com `base64: true`). Validação LINHA A LINHA — uma linha ruim nunca aborta o
 * lote — e IDEMPOTENTE: o que já existe (mesmo CNPJ / nome / código no pai
 * certo) conta como "já existia", não como erro. A resposta é o relatório do
 * lote (rh.lote_carga), com o motivo individual de cada rejeição.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const bruto = await lerCorpo(request);
    const analise = esquemaCarga.safeParse(bruto);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path.join(".") || undefined,
        },
        { status: 400 }
      );
    }
    const relatorio = await importarEstrutura(sessao, analise.data);
    return Response.json(relatorio, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Mesmo leitor de corpo do importador de ponto (api/ponto/importacoes). */
async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) {
    const formulario = await request.formData();
    const arquivo = formulario.get("arquivo");
    const conteudo =
      arquivo instanceof File ? await arquivo.text() : String(arquivo ?? "");
    return {
      arquivo:
        arquivo instanceof File
          ? arquivo.name
          : String(formulario.get("nome") ?? "carga.csv"),
      conteudo,
      separador: formulario.get("separador") ?? ";",
    };
  }
  const corpo = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (corpo.base64 === true && typeof corpo.conteudo === "string") {
    return {
      ...corpo,
      conteudo: Buffer.from(corpo.conteudo, "base64").toString("utf8"),
    };
  }
  return corpo;
}
