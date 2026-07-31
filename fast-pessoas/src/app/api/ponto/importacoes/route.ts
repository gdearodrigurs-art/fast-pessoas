import { esquemaImportacao } from "@/dominios/ponto/esquemas";
import { importarMarcacoes, listarLotes } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** Histórico dos lotes já importados (sem o relatório linha a linha). */
export async function GET() {
  try {
    await exigirPermissao("ponto.importar");
    const lotes = await listarLotes();
    return Response.json({
      lotes: lotes.map((lote) => ({
        id: lote.id,
        arquivo: lote.arquivo,
        ano: lote.competencia_ano,
        mes: lote.competencia_mes,
        linhas_lidas: lote.linhas_lidas,
        linhas_aceitas: lote.linhas_aceitas,
        linhas_rejeitadas: lote.linhas_rejeitadas,
        importado_em: lote.importado_em,
      })),
    });
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Importa a planilha de marcações. Aceita as duas formas que o DP tem em mãos:
 *
 * - `multipart/form-data` com o campo `arquivo` (arrastar o CSV do relógio);
 * - `application/json` com `conteudo` em texto puro ou em base64 (`base64: true`),
 *   que é como um integrador manda.
 *
 * O corpo vira sempre o mesmo `EntradaImportacao` antes de tocar o domínio, e
 * a resposta é o RELATÓRIO DO LOTE: quantas linhas entraram e o motivo
 * individual de cada rejeição. Um arquivo com erro não some — ele é aceito em
 * parte, e o DP vê exatamente o que ficou de fora.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.importar");
    const bruto = await lerCorpo(request);
    const analise = esquemaImportacao.safeParse(bruto);
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
    const relatorio = await importarMarcacoes(sessao, analise.data);
    return Response.json(relatorio, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

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
          : String(formulario.get("nome") ?? "importacao.csv"),
      ano: Number(formulario.get("ano")),
      mes: Number(formulario.get("mes")),
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
