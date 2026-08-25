import { esquemaCredenciais } from "@/dominios/identidade/esquemas";
import {
  autenticar,
  loginBloqueado,
  registrarTentativa,
} from "@/dominios/identidade/servico";
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

  // Rate-limit ANTES do bcrypt: falhas demais na janela → 429 sem pagar o hash.
  if (await loginBloqueado(analise.data.email)) {
    return Response.json(
      {
        erro: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
      },
      { status: 429 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const resultado = await autenticar(analise.data);
  await registrarTentativa(analise.data.email, resultado, ip);

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
    // Conta inativa — tanto a que o DP desativou quanto a que acabou de cair
    // pela 5ª falha de TOTP (C1 modificada). Resposta ÚNICA e neutra, para não
    // vazar que foi o segundo fator que derrubou.
    if (resultado.motivo === "conta_desativada") {
      return Response.json(
        { erro: "Conta desativada. Procure o Departamento Pessoal." },
        { status: 403 }
      );
    }
    // Bloqueio temporário de TOTP (caso último-admin): mesma voz do rate-limit
    // de senha, sem citar o segundo fator.
    if (resultado.motivo === "totp_bloqueado") {
      return Response.json(
        {
          erro: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
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
