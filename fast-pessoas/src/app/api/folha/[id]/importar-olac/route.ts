import { importarOlac } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/**
 * IMPORTAÇÃO OLAC — o retorno da contabilidade, no MESMO layout da exportação
 * (decisão E4: layout NOSSO, ida e volta iguais — cabeçalho documentado em
 * GET exportar-olac e em docs/anexos/layout-olac.md). O que importa na volta
 * são as CHAVES (competencia, empresa_cnpj, matricula, rubrica) e o valor.
 *
 * Grava o ESPELHO de conciliação (E1:a/E2:a — somente-leitura, nunca vira item
 * de folha), com a situação linha a linha: casada | sem_rubrica |
 * sem_colaborador. Linha ruim vira rejeição com motivo no relatório e NUNCA
 * aborta o lote. Reimportar a mesma competência+empresa substitui o espelho
 * anterior.
 *
 * Aceita as duas formas (molde api/ponto/importacoes):
 * - `multipart/form-data` com o campo `arquivo`;
 * - `application/json` com `conteudo` em texto puro ou base64 (`base64: true`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id } = await params;
    const corpo = await lerCorpo(request);
    if (typeof corpo.conteudo !== "string" || corpo.conteudo === "") {
      return Response.json(
        { erro: "Envie o arquivo de retorno da OLAC.", campo: "conteudo" },
        { status: 400 }
      );
    }
    const relatorio = await importarOlac(sessao, idFolha(id), {
      arquivo:
        typeof corpo.arquivo === "string" && corpo.arquivo.trim() !== ""
          ? corpo.arquivo
          : "retorno-olac.csv",
      conteudo: corpo.conteudo,
    });
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
          : String(formulario.get("nome") ?? "retorno-olac.csv"),
      conteudo,
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
