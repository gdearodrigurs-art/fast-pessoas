import { esquemaEstruturaModelo } from "@/dominios/avaliacao/esquemas";
import { atualizarRascunhoModelo } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../identificador";

/** Atualiza a estrutura de um RASCUNHO (versão ativada é imutável). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.configurar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEstruturaModelo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await atualizarRascunhoModelo(sessao, idAvaliacao(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
