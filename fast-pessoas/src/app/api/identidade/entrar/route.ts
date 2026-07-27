import { esquemaCredenciais } from "@/dominios/identidade/esquemas";
import { autenticar } from "@/dominios/identidade/servico";
import { criarSessao } from "@/lib/sessao";

const MENSAGEM_GENERICA = "E-mail ou senha incorretos.";

export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  const analise = esquemaCredenciais.safeParse(corpo);
  if (!analise.success) {
    return Response.json(
      { erro: "Informe e-mail e senha válidos." },
      { status: 400 }
    );
  }

  const resultado = await autenticar(analise.data);

  if (!resultado.ok) {
    if (resultado.motivo === "totp_obrigatorio") {
      return Response.json(
        { precisa_totp: true, erro: null },
        { status: 401 }
      );
    }
    if (resultado.motivo === "totp_invalido") {
      return Response.json(
        { precisa_totp: true, erro: "Código de verificação inválido." },
        { status: 401 }
      );
    }
    return Response.json({ erro: MENSAGEM_GENERICA }, { status: 401 });
  }

  await criarSessao(resultado.sessao);
  return Response.json({
    usuario: resultado.sessao,
    precisa_configurar_2fa: resultado.precisa_configurar_2fa,
  });
}
