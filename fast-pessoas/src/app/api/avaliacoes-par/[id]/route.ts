import { esquemaSalvarRespostas } from "@/dominios/avaliacao/esquemas";
import {
  obterAvaliacaoDePar,
  salvarRascunhoDePar,
} from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idCiclo } from "../identificador";

/**
 * A própria avaliação de par para responder — CEGA: o serviço nunca devolve o
 * líder, a auto nem o resultado. O par VÊ o nome do avaliado (precisa saber quem
 * avalia); a resposta dele é que é anônima na agregação.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.avaliar_par");
    const { id } = await params;
    const dados = await obterAvaliacaoDePar(sessao, idCiclo(id));
    return Response.json(dados);
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Salva o RASCUNHO da própria avaliação de par. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.avaliar_par");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaSalvarRespostas.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await salvarRascunhoDePar(sessao, idCiclo(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
