import { baixarDocumento } from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissaoParaRegularizacao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * A porta continua sendo documento.ver, mas pela variante de REGULARIZAÇÃO
 * (A8): o bloqueado pelo gate de conduta precisa LER o documento até o fim
 * para poder dar a ciência que o destrava (B4/B5) — a tranca do
 * `ciencia_pendente` não pode fechar justamente o download.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissaoParaRegularizacao("documento.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const { metadados, conteudo } = await baixarDocumento(sessao, idNumero);
    // Fallback ASCII para clientes antigos; o nome real vai em filename* (RFC 5987).
    const nomeAscii = metadados.nome_arquivo
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    return new Response(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": metadados.mime,
        "Content-Length": String(conteudo.length),
        "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(metadados.nome_arquivo)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
