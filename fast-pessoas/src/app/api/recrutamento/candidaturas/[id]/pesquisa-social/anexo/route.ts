import {
  baixarAnexoPesquisaSocial,
  exigirSessaoRs,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { idRecrutamento } from "../../../../identificador";

/**
 * Anexo da pesquisa social — SÓ rs.gerir, com trilha de leitura sensível
 * (G3:a). Cabeçalhos no molde de api/documentos/[id]/download.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sessao, pode } = await exigirSessaoRs();
    const { id } = await params;
    const anexo = await baixarAnexoPesquisaSocial(
      sessao,
      pode,
      idRecrutamento(id)
    );
    // Fallback ASCII para clientes antigos; o nome real vai em filename* (RFC 5987).
    const nomeAscii = anexo.nome_arquivo
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    return new Response(new Uint8Array(anexo.conteudo), {
      status: 200,
      headers: {
        "Content-Type": anexo.mime,
        "Content-Length": String(anexo.conteudo.length),
        "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(anexo.nome_arquivo)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
