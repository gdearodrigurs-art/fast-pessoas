import { NextResponse } from "next/server";
import { esquemaTrocaSenha } from "../../../../dominios/identidade/esquemas";
import { trocarSenha } from "../../../../dominios/identidade/servico";
import { lerSessao } from "../../../../lib/sessao";

export async function POST(pedido: Request) {
  const sessao = await lerSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
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
