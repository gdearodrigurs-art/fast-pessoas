import { NextResponse } from "next/server";
import { esquemaTrocaSenha } from "../../../../dominios/identidade/esquemas";
import { trocarSenha } from "../../../../dominios/identidade/servico";
import { responderErro } from "../../../../lib/http";
import { garantirUsuarioAtivo, lerSessao } from "../../../../lib/sessao";

/**
 * A guarda fica em lerSessao + garantirUsuarioAtivo (A7), e NÃO em
 * exigirSessao: esta rota precisa aceitar a sessão pendente_2fa (trocar a
 * senha temporária vem ANTES de configurar o 2FA — o proxy a lista em
 * ROTAS_PENDENTE_2FA). O que faltava era a reconferência de usuario.ativo:
 * um desativado seguia trocando a própria senha pelo JWT de até 8h.
 */
export async function POST(pedido: Request) {
  const sessao = await lerSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  try {
    await garantirUsuarioAtivo(sessao.usuario_id);
  } catch (erro) {
    return responderErro(erro);
  }

  const corpo = await pedido.json().catch(() => null);
  const analise = esquemaTrocaSenha.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json(
      { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }

  const resultado = await trocarSenha(sessao, analise.data);
  if (!resultado.ok) {
    return NextResponse.json({ erro: "Senha atual incorreta" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
