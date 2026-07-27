import { compare, hashSync } from "bcryptjs";
import * as OTPAuth from "otpauth";
import { Credenciais, PayloadSessao } from "./esquemas";
import { buscarPorEmail, registrarAcao } from "./repositorio";

const PAPEIS_COM_2FA = new Set(["rh", "dp", "diretoria", "admin"]);

// Hash sacrificial: iguala o tempo de resposta quando o e-mail não existe,
// para não denunciar quais contas estão cadastradas.
const HASH_FANTASMA = hashSync(globalThis.crypto.randomUUID(), 12);

export type ResultadoAutenticacao =
  | { ok: true; sessao: PayloadSessao; precisa_configurar_2fa: boolean }
  | {
      ok: false;
      motivo: "credenciais_invalidas" | "totp_obrigatorio" | "totp_invalido";
    };

function validarCodigoTotp(secret: string, codigo: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    return totp.validate({ token: codigo, window: 1 }) !== null;
  } catch {
    return false;
  }
}

export async function autenticar(
  credenciais: Credenciais
): Promise<ResultadoAutenticacao> {
  const usuario = await buscarPorEmail(credenciais.email);

  if (!usuario || !usuario.senha_hash) {
    await compare(credenciais.senha, HASH_FANTASMA);
    await registrarAcao(
      "login_falha",
      usuario ? { id: usuario.id, papel: usuario.papel } : null,
      { email: credenciais.email }
    );
    return { ok: false, motivo: "credenciais_invalidas" };
  }

  const senhaConfere = await compare(credenciais.senha, usuario.senha_hash);
  if (!senhaConfere || !usuario.ativo) {
    await registrarAcao(
      "login_falha",
      { id: usuario.id, papel: usuario.papel },
      { email: credenciais.email }
    );
    return { ok: false, motivo: "credenciais_invalidas" };
  }

  let precisaConfigurar2fa = false;
  if (PAPEIS_COM_2FA.has(usuario.papel)) {
    if (usuario.totp_secret) {
      if (!credenciais.codigo_totp) {
        return { ok: false, motivo: "totp_obrigatorio" };
      }
      if (!validarCodigoTotp(usuario.totp_secret, credenciais.codigo_totp)) {
        await registrarAcao(
          "login_falha",
          { id: usuario.id, papel: usuario.papel },
          { email: credenciais.email, motivo: "totp_invalido" }
        );
        return { ok: false, motivo: "totp_invalido" };
      }
    } else {
      precisaConfigurar2fa = true;
    }
  }

  await registrarAcao("login_sucesso", {
    id: usuario.id,
    papel: usuario.papel,
  });

  return {
    ok: true,
    sessao: {
      usuario_id: usuario.id,
      papel: usuario.papel,
      nome: usuario.nome,
    },
    precisa_configurar_2fa: precisaConfigurar2fa,
  };
}

export async function registrarSaida(sessao: PayloadSessao): Promise<void> {
  await registrarAcao("logout", {
    id: sessao.usuario_id,
    papel: sessao.papel,
  });
}
