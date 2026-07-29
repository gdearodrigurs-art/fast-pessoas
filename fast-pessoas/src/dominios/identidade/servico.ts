import { compare, hash, hashSync } from "bcryptjs";
import * as OTPAuth from "otpauth";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import {
  Credenciais,
  Desativacao2fa,
  Papel,
  PayloadSessao,
  TrocaSenha,
} from "./esquemas";
import {
  atualizarSenhaHash,
  atualizarTotpSecret,
  buscarPorEmail,
  buscarPorId,
  registrarAcao,
  UsuarioIdentidade,
} from "./repositorio";

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
      // Claim no próprio JWT: o proxy restringe a sessão pendente ao fluxo
      // de configuração do 2FA sem precisar consultar o banco no edge.
      ...(precisaConfigurar2fa ? { pendente_2fa: true } : {}),
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

export type ResultadoTrocaSenha =
  | { ok: true }
  | { ok: false; motivo: "senha_atual_invalida" };

export async function trocarSenha(
  sessao: PayloadSessao,
  dados: TrocaSenha
): Promise<ResultadoTrocaSenha> {
  const usuario = await buscarPorId(sessao.usuario_id);
  const confere =
    usuario?.senha_hash && usuario.ativo
      ? await compare(dados.senha_atual, usuario.senha_hash)
      : false;

  if (!confere) {
    await registrarAcao("troca_senha_falha", {
      id: sessao.usuario_id,
      papel: sessao.papel,
    });
    return { ok: false, motivo: "senha_atual_invalida" };
  }

  const novoHash = await hash(dados.senha_nova, 12);
  await comTransacao(sessao.usuario_id, async (cliente) => {
    await atualizarSenhaHash(cliente, sessao.usuario_id, novoHash);
  });
  await registrarAcao("troca_senha", {
    id: sessao.usuario_id,
    papel: sessao.papel,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Configuração de 2FA (enrolamento TOTP)
// ---------------------------------------------------------------------------

const EMISSOR_TOTP = "Fast Pessoas";
const ROTULO_2FA = "Autenticação em duas etapas";

export function papelExige2fa(papel: Papel): boolean {
  return PAPEIS_COM_2FA.has(papel);
}

async function exigirUsuarioAtivo(
  sessao: PayloadSessao
): Promise<UsuarioIdentidade> {
  const usuario = await buscarPorId(sessao.usuario_id);
  if (!usuario || !usuario.ativo) {
    throw new ErroHttp(401, "Sessão inválida. Entre novamente.");
  }
  return usuario;
}

export interface Situacao2fa {
  configurado: boolean;
  obrigatorio: boolean;
}

export async function consultarSituacao2fa(
  sessao: PayloadSessao
): Promise<Situacao2fa> {
  const usuario = await exigirUsuarioAtivo(sessao);
  return {
    configurado: Boolean(usuario.totp_secret),
    obrigatorio: papelExige2fa(usuario.papel),
  };
}

export interface Inicio2fa {
  secret_base32: string;
  otpauth_uri: string;
}

/**
 * Gera um secret TOTP novo e o URI otpauth:// correspondente. O secret NÃO é
 * gravado aqui: fica pendente (token assinado de curta duração) até o usuário
 * confirmar um código válido em confirmarAtivacao2fa.
 */
export async function iniciarConfiguracao2fa(
  sessao: PayloadSessao
): Promise<Inicio2fa> {
  const usuario = await exigirUsuarioAtivo(sessao);
  if (usuario.totp_secret) {
    throw new ErroHttp(409, "A autenticação em duas etapas já está ativa.");
  }
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: EMISSOR_TOTP,
    label: usuario.email,
    secret,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return { secret_base32: secret.base32, otpauth_uri: totp.toString() };
}

/**
 * Valida o código contra o secret pendente e só então grava totp_secret —
 * em transação, com auditoria 'ativacao_2fa'.
 */
export async function confirmarAtivacao2fa(
  sessao: PayloadSessao,
  secretPendente: string,
  codigo: string
): Promise<void> {
  const usuario = await exigirUsuarioAtivo(sessao);
  if (usuario.totp_secret) {
    throw new ErroHttp(409, "A autenticação em duas etapas já está ativa.");
  }
  if (!validarCodigoTotp(secretPendente, codigo)) {
    await registrarAcao("ativacao_2fa_falha", {
      id: usuario.id,
      papel: usuario.papel,
    });
    throw new ErroHttpCampo(
      400,
      "Código inválido. Confira o aplicativo autenticador e tente de novo.",
      "codigo"
    );
  }
  await comTransacao(sessao.usuario_id, async (cliente) => {
    await atualizarTotpSecret(cliente, usuario.id, secretPendente);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ativacao_2fa",
      tabela: "sistema.usuario",
      registroId: String(usuario.id),
      diff: { [ROTULO_2FA]: { de: "Desativada", para: "Ativada" } },
    });
  });
}

/**
 * Desativa o 2FA exigindo prova dupla: senha atual + código TOTP válido.
 * Papéis com 2FA obrigatório (rh/dp/diretoria/admin) não podem desativar.
 */
export async function desativar2fa(
  sessao: PayloadSessao,
  dados: Desativacao2fa
): Promise<void> {
  const usuario = await exigirUsuarioAtivo(sessao);
  if (papelExige2fa(usuario.papel)) {
    throw new ErroHttp(
      403,
      "O seu papel exige autenticação em duas etapas — ela não pode ser desativada."
    );
  }
  if (!usuario.totp_secret) {
    throw new ErroHttp(409, "A autenticação em duas etapas não está ativa.");
  }

  const senhaConfere = usuario.senha_hash
    ? await compare(dados.senha, usuario.senha_hash)
    : false;
  if (!senhaConfere) {
    await registrarAcao("desativacao_2fa_falha", {
      id: usuario.id,
      papel: usuario.papel,
    });
    throw new ErroHttpCampo(400, "Senha atual incorreta.", "senha");
  }

  if (!validarCodigoTotp(usuario.totp_secret, dados.codigo)) {
    await registrarAcao("desativacao_2fa_falha", {
      id: usuario.id,
      papel: usuario.papel,
    });
    throw new ErroHttpCampo(
      400,
      "Código inválido. Confira o aplicativo autenticador.",
      "codigo"
    );
  }

  await comTransacao(sessao.usuario_id, async (cliente) => {
    await atualizarTotpSecret(cliente, usuario.id, null);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "desativacao_2fa",
      tabela: "sistema.usuario",
      registroId: String(usuario.id),
      diff: { [ROTULO_2FA]: { de: "Ativada", para: "Desativada" } },
    });
  });
}
