import { z } from "zod";
import { autenticarDemo } from "@/dominios/identidade/servico";
import { modoDemoLigado, PERSONAS_DEMO } from "@/lib/modo-demo";
import { criarSessao } from "@/lib/sessao";

// Vitrine (MODO_DEMO=1): a tela /entrar pergunta aqui se mostra os botões de
// persona. Com o modo desligado, GET diz "não" e POST é 404 — a rota some.

export async function GET() {
  if (!modoDemoLigado()) return Response.json({ ligado: false, personas: [] });
  return Response.json({ ligado: true, personas: PERSONAS_DEMO });
}

const esquemaEntradaDemo = z.object({ email: z.email().max(254) });

export async function POST(request: Request) {
  if (!modoDemoLigado()) {
    return Response.json({ erro: "Não encontrado." }, { status: 404 });
  }
  const corpo: unknown = await request.json().catch(() => null);
  const analise = esquemaEntradaDemo.safeParse(corpo);
  if (!analise.success) {
    return Response.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const sessao = await autenticarDemo(analise.data.email);
  if (!sessao) {
    return Response.json(
      { erro: "Persona de demonstração não encontrada." },
      { status: 401 }
    );
  }
  await criarSessao(sessao);
  return Response.json({ usuario: sessao });
}
