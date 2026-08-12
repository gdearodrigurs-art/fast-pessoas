import {
  esquemaRemoverPar,
  esquemaSelecionarPares,
} from "@/dominios/avaliacao/esquemas";
import {
  listarGestaoPares,
  removerParDoCiclo,
  selecionarPares,
} from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../identificador";

/** Painel de gestão dos pares do ciclo (pares atuais + candidatos da equipe). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.par.gerir");
    const { id } = await params;
    const dados = await listarGestaoPares(sessao, idAvaliacao(id));
    return Response.json(dados);
  } catch (erro) {
    return responderErro(erro);
  }
}

/** O gestor SELECIONA pares (ids de colaboradores da equipe do avaliado). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.par.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaSelecionarPares.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await selecionarPares(sessao, idAvaliacao(id), analise.data.colaborador_ids);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Remove um par ainda em rascunho. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.par.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRemoverPar.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await removerParDoCiclo(sessao, idAvaliacao(id), analise.data.colaborador_id);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
