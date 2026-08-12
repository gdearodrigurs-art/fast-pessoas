import { esquemaSalvarRespostas } from "@/dominios/avaliacao/esquemas";
import {
  obterAutoavaliacao,
  salvarRascunhoAutoavaliacao,
} from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idCiclo } from "../identificador";

/**
 * A própria autoavaliação para responder — CEGA: o serviço nunca devolve a
 * avaliação do líder nem o resultado. Escopo pelo usuário da sessão.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.autoavaliar");
    const { id } = await params;
    const dados = await obterAutoavaliacao(sessao, idCiclo(id));
    return Response.json(dados);
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Salva o RASCUNHO da própria autoavaliação (envio é que exige tudo). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.autoavaliar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaSalvarRespostas.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await salvarRascunhoAutoavaliacao(sessao, idCiclo(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
