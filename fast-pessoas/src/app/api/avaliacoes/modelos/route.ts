import { esquemaEstruturaModelo } from "@/dominios/avaliacao/esquemas";
import {
  criarRascunhoModelo,
  montarPainelModelos,
} from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("avaliacao.configurar");
    const painel = await montarPainelModelos();
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Cria uma NOVA versão em rascunho (a ativa é imutável — sempre versão nova). */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("avaliacao.configurar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEstruturaModelo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const criado = await criarRascunhoModelo(sessao, analise.data);
    return Response.json(criado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
