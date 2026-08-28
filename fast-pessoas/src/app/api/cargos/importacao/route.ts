import { esquemaCarga } from "@/dominios/estrutura/esquemas";
import {
  importarCargos,
  listarLotesDeCarga,
} from "@/dominios/estrutura/importacao-servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE = "sistema.carga.importar";

/** Histórico dos lotes de carga de CARGOS já importados. */
export async function GET() {
  try {
    await exigirPermissao(CHAVE);
    const lotes = await listarLotesDeCarga("cargos");
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
 * CARGA INICIAL DE CARGOS/RCF por planilha CSV — layout NOSSO (decisão F3/E4,
 * docs/20: nós definimos o layout e a origem exporta neste formato).
 *
 * 4 colunas, separador ; por padrão, com ou sem linha de cabeçalho:
 *
 *   cargo ; nivel ; faixa_min ; faixa_max
 *
 *   cargo      nome do cargo (obrigatório)
 *   nivel      nome do nível hierárquico no catálogo administrável (opcional;
 *              a carga NÃO cria nível — nome fora do catálogo rejeita a linha)
 *   faixa_*    salário em REAIS com vírgula ("3.500,00") — convertido para
 *              centavos inteiros na análise; os dois juntos ou nenhum
 *
 * O RCF completo (missão, atividades, CHA, setor, líder) NÃO entra pela carga:
 * é documento que se escreve na tela de cargos, cargo a cargo — a carga cria a
 * versão inicial com nome, nível e faixa (F1:a — só a posição atual).
 *
 * Aceita `multipart/form-data` (campo `arquivo`) ou `application/json` com
 * `conteudo` (texto puro ou base64 com `base64: true`). Validação LINHA A
 * LINHA e IDEMPOTENTE: cargo cujo nome já existe (versão ativa, normalizado)
 * conta como "já existia". A resposta é o relatório do lote (rh.lote_carga).
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
    const relatorio = await importarCargos(sessao, analise.data);
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
