import { type NextRequest } from "next/server";
import {
  esquemaEnvioBase64,
  esquemaEnvioMultipart,
  TAMANHO_MAXIMO_BYTES,
} from "@/dominios/documentos/esquemas";
import {
  enviarDocumento,
  listarDocumentos,
} from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirPermissao("documento.ver");
    const incluirSensiveis =
      request.nextUrl.searchParams.get("sensivel") === "true";
    const documentos = await listarDocumentos(sessao, incluirSensiveis);
    return Response.json({ documentos });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("documento.enviar");
    const tipoConteudo = request.headers.get("content-type") ?? "";

    if (tipoConteudo.includes("multipart/form-data")) {
      const formulario = await request.formData().catch(() => null);
      if (!formulario) {
        return Response.json({ erro: "Formulário inválido" }, { status: 400 });
      }
      const arquivo = formulario.get("arquivo");
      if (!(arquivo instanceof File)) {
        return Response.json(
          { erro: "Selecione o arquivo do documento", campo: "arquivo" },
          { status: 400 }
        );
      }
      if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
        return Response.json(
          { erro: "Arquivo excede o limite de 10 MB", campo: "arquivo" },
          { status: 413 }
        );
      }
      const analise = esquemaEnvioMultipart.safeParse({
        categoria: formulario.get("categoria"),
        titulo: formulario.get("titulo"),
        sensivel: formulario.get("sensivel") ?? "false",
        colaborador_id: formulario.get("colaborador_id") || undefined,
        exige_ciencia: formulario.get("exige_ciencia") ?? "false",
        bloqueante: formulario.get("bloqueante") ?? "false",
        prazo_ciencia_dias: formulario.get("prazo_ciencia_dias") || undefined,
        substitui_documento_id:
          formulario.get("substitui_documento_id") || undefined,
      });
      if (!analise.success) {
        return Response.json(
          { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
          { status: 400 }
        );
      }
      const documento = await enviarDocumento(
        sessao,
        {
          categoria: analise.data.categoria,
          titulo: analise.data.titulo,
          sensivel: analise.data.sensivel,
          colaborador_id: analise.data.colaborador_id ?? null,
          exige_ciencia: analise.data.exige_ciencia,
          bloqueante: analise.data.bloqueante,
          prazo_ciencia_dias: analise.data.prazo_ciencia_dias ?? null,
          substitui_documento_id:
            analise.data.substitui_documento_id ?? null,
        },
        {
          nome: arquivo.name || "documento",
          mime: arquivo.type || "application/octet-stream",
          conteudo: Buffer.from(await arquivo.arrayBuffer()),
        }
      );
      return Response.json({ documento }, { status: 201 });
    }

    const corpo = await request.json().catch(() => null);
    const analise = esquemaEnvioBase64.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const documento = await enviarDocumento(
      sessao,
      {
        categoria: analise.data.categoria,
        titulo: analise.data.titulo,
        sensivel: analise.data.sensivel,
        colaborador_id: analise.data.colaborador_id ?? null,
        exige_ciencia: analise.data.exige_ciencia,
        bloqueante: analise.data.bloqueante,
        prazo_ciencia_dias: analise.data.prazo_ciencia_dias ?? null,
        substitui_documento_id: analise.data.substitui_documento_id ?? null,
      },
      {
        nome: analise.data.nome_arquivo,
        mime: analise.data.mime,
        conteudo: Buffer.from(analise.data.conteudo_base64, "base64"),
      }
    );
    return Response.json({ documento }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
