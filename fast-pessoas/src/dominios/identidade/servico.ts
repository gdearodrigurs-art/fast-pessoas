import { compare, hash, hashSync } from "bcryptjs";
import * as OTPAuth from "otpauth";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { chaveSensivel } from "../usuarios/esquemas";
import {
  Credenciais,
  Desativacao2fa,
  PayloadSessao,
  TrocaSenha,
} from "./esquemas";
import { processarCodigoTotp, PortasFalhasTotp } from "./falhas-totp";
import {
  atualizarSenhaHash,
  atualizarTotpSecret,
  bloquearTotpPorFalhas,
  buscarPorEmail,
  buscarPorId,
  consumirPassoTotp,
  contarFalhasLoginRecentes,
  desativarPorFalhasTotp,
  lerParametroSeguranca,
  listarChavesDoUsuario,
  registrarAcao,
  registrarFalhaTotp,
  registrarTentativaLogin,
  UsuarioIdentidade,
  zerarFalhasTotp,
} from "./repositorio";
import { validarTotpComPasso } from "./totp";

// Hash sacrificial: iguala o tempo de resposta quando o e-mail não existe,
// para não denunciar quais contas estão cadastradas.
const HASH_FANTASMA = hashSync(globalThis.crypto.randomUUID(), 12);

/**
 * Quem precisa de segundo fator? Quem tiver, no perfil que o administrador
 * compôs em /perfis, ao menos UMA chave que exija 2FA.
 *
 * Até a migration 0040 isto era uma lista de NOMES DE PAPEL no código
 * (`PAPEIS_COM_2FA`), e por isso ampliar um perfil pela tela — dar alcance de
 * empresa inteira ao slot `funcionario`, por exemplo — deixava a segunda etapa
 * de autenticação para trás: 70 fichas atrás de uma senha só. Agora a
 * exigência viaja junto com a chave, e não com o nome de quem a recebeu:
 * compor uma chave dessas sobre QUALQUER papel, inclusive um criado amanhã,
 * passa a exigir 2FA sem ninguém atualizar lista nenhuma.
 *
 * Duas fontes em OU, de propósito — a rede só pode FECHAR, nunca abrir:
 *  - `permissao.exige_2fa`, declarado na migration junto com a chave (dado
 *    sensível, alcance de empresa inteira ou administração do acesso);
 *  - `chaveSensivel()`, a mesma lista que já marca o selo de sensível na tela
 *    /perfis e gera a trilha de leitura.
 * Esquecer o flag numa chave sensível nova não abre a porta; e uma chave
 * marcada só no banco também não depende do TypeScript para valer.
 */
async function usuarioExige2fa(usuarioId: number): Promise<boolean> {
  const chaves = await listarChavesDoUsuario(usuarioId);
  return chaves.some((linha) => linha.exige_2fa || chaveSensivel(linha.chave));
}

export type ResultadoAutenticacao =
  | { ok: true; sessao: PayloadSessao; precisa_configurar_2fa: boolean }
  | {
      ok: false;
      motivo:
        | "credenciais_invalidas"
        | "totp_obrigatorio"
        | "totp_invalido"
        // Conta inativa com a senha CERTA — inclusive a recém-desativada pela
        // regra de falhas de TOTP (C1 modificada). O motivo é DISTINTO só por
        // dentro (auditoria e rate-limit); na superfície do login a rota
        // devolve o MESMO 401 genérico da senha errada, senão a diferença de
        // resposta viraria oráculo de senha da conta desativada.
        | "conta_desativada"
        // Bloqueio temporário de TOTP vigente (caso último-admin).
        | "totp_bloqueado";
    };

// ---------------------------------------------------------------------------
// Falhas consecutivas de TOTP (0087, decisão C1 modificada): a POLÍTICA mora
// em falhas-totp.ts (pura, testável com contador mockado); aqui só se ligam
// as portas reais do banco. Vale no login E nas revalidações críticas.
// ---------------------------------------------------------------------------
const PORTAS_FALHAS_TOTP: PortasFalhasTotp = {
  registrarFalha: registrarFalhaTotp,
  zerarFalhas: zerarFalhasTotp,
  lerParametros: async () => {
    const { maxFalhasTotp, bloqueioTotpMinutos } = await lerParametroSeguranca();
    return { maxFalhasTotp, bloqueioTotpMinutos };
  },
  desativarComAuditoria: desativarPorFalhasTotp,
  bloquearComAuditoria: bloquearTotpPorFalhas,
};

// Mensagens do bloqueio/queda — na voz do rate-limit e da reconferência de
// sessão que já existem, sem citar TOTP (nada a vazar para quem só tem a senha).
const MENSAGEM_TOTP_BLOQUEADO =
  "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
const MENSAGEM_CONTA_INATIVA =
  "Sessão inválida — a conta não está mais ativa.";

// Validação simples (sem consumir o passo). É o que usam:
//  - o ENROLAMENTO (secret pendente, sem usuário para consumir);
//  - as revalidações DENTRO da sessão (aprovar folha, desativar 2FA): reapresentar
//    ali um código já usado no login exige estar autenticado, então o replay não
//    é ameaça e o uso único colidiria com o login->aprovar-folha, que pede DOIS
//    TOTP em segundos (o mesmo código do período de 30s).
function validarCodigoTotp(secret: string, codigo: string): boolean {
  return validarTotpComPasso(secret, codigo) !== null;
}

/**
 * Valida E CONSOME o código — SÓ no LOGIN, onde a ameaça de replay é real (código
 * + senha capturados para reentrar). "ok" só se o código bate E o passo dele
 * ainda não foi consumido por este usuário. Um código fresco tem sempre passo
 * maior, então login legítimo não é barrado (salvo reenvio do mesmo código após
 * resposta perdida — raro, e é o comportamento correto de uso único).
 *
 * Os dois fracassos são DISTINTOS de propósito: "codigo_errado" alimenta o
 * contador de falhas consecutivas (0087); "replay" não — replay é código CERTO
 * já consumido, o anti-replay (camada própria, 0060) barra sozinho, e contá-lo
 * como falha baratearia a negação de serviço além do risco aceito na C1.
 */
async function validarEConsumirTotp(
  usuarioId: number,
  secret: string,
  codigo: string
): Promise<"ok" | "codigo_errado" | "replay"> {
  const passo = validarTotpComPasso(secret, codigo);
  if (passo === null) return "codigo_errado";
  return (await consumirPassoTotp(usuarioId, passo)) ? "ok" : "replay";
}

/**
 * Rate-limit do login (achado B3): há falhas de SENHA demais para este e-mail na
 * janela administrável? Se sim, a rota barra ANTES do bcrypt — mitiga o DoS de
 * exaustão e o credential-stuffing. Não registra a batida na porta trancada,
 * para um atacante não manter a vítima trancada além da janela.
 */
export async function loginBloqueado(email: string): Promise<boolean> {
  const { maxTentativas, janelaMinutos } = await lerParametroSeguranca();
  return (await contarFalhasLoginRecentes(email, janelaMinutos)) >= maxTentativas;
}

/**
 * Registra a tentativa REAL (não a bloqueada) para o contador. sucesso = a SENHA
 * conferiu: TOTP pendente/inválido não é senha errada e não deve trancar quem tem
 * a senha certa mas tropeça no segundo fator.
 */
export async function registrarTentativa(
  email: string,
  resultado: ResultadoAutenticacao,
  ip: string | null
): Promise<void> {
  const senhaConferiu =
    resultado.ok || resultado.motivo !== "credenciais_invalidas";
  await registrarTentativaLogin(email, senhaConferiu, ip);
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
  if (!senhaConfere) {
    await registrarAcao(
      "login_falha",
      { id: usuario.id, papel: usuario.papel },
      { email: credenciais.email }
    );
    return { ok: false, motivo: "credenciais_invalidas" };
  }
  if (!usuario.ativo) {
    // Senha certa em conta inativa: o motivo interno é próprio (auditoria e
    // rate-limit), mas a rota responde o 401 GENÉRICO de credencial errada —
    // idêntico ao da senha errada e ao da 5ª falha de TOTP que acabou de
    // desativar. Qualquer resposta distinta aqui confirmaria a senha.
    await registrarAcao(
      "login_falha",
      { id: usuario.id, papel: usuario.papel },
      { email: credenciais.email, motivo: "conta_desativada" }
    );
    return { ok: false, motivo: "conta_desativada" };
  }

  let precisaConfigurar2fa = false;
  if (usuario.totp_secret) {
    // Bloqueio temporário vigente (último-admin que estourou as falhas de
    // TOTP): congela ANTES de validar qualquer código — bloqueio que ainda
    // aceita tentativas não bloqueia nada.
    if (usuario.totp_bloqueado) {
      await registrarAcao(
        "login_falha",
        { id: usuario.id, papel: usuario.papel },
        { email: credenciais.email, motivo: "totp_bloqueado" }
      );
      return { ok: false, motivo: "totp_bloqueado" };
    }
    // Quem tem segredo cadastrado SEMPRE valida o código — inclusive quem
    // ativou o 2FA por conta própria sem ser obrigado. Antes o código só era
    // cobrado quando a chave tornava o 2FA obrigatório, então o segundo fator
    // VOLUNTÁRIO do gestor/funcionário era ignorado no login: com a senha
    // vazada, entrava-se sem o TOTP que a pessoa tinha justamente ativado.
    if (!credenciais.codigo_totp) {
      return { ok: false, motivo: "totp_obrigatorio" };
    }
    const codigo = await validarEConsumirTotp(
      usuario.id,
      usuario.totp_secret,
      credenciais.codigo_totp
    );
    if (codigo === "ok") {
      // Acerto ZERA o contador — são falhas CONSECUTIVAS, não janela (C1.i).
      await processarCodigoTotp(PORTAS_FALHAS_TOTP, usuario.id, true);
    } else {
      await registrarAcao(
        "login_falha",
        { id: usuario.id, papel: usuario.papel },
        { email: credenciais.email, motivo: "totp_invalido" }
      );
      if (codigo === "codigo_errado") {
        const desfecho = await processarCodigoTotp(
          PORTAS_FALHAS_TOTP,
          usuario.id,
          false
        );
        if (desfecho === "desativado") {
          // Sessões vigentes morrem junto: a reconferência central de usuário
          // ativo (garantirUsuarioAtivo + tem_permissao, que filtra u.ativo)
          // derruba o JWT de 8h no próximo request.
          return { ok: false, motivo: "conta_desativada" };
        }
        if (desfecho === "bloqueado") {
          return { ok: false, motivo: "totp_bloqueado" };
        }
      }
      return { ok: false, motivo: "totp_invalido" };
    }
  } else if (await usuarioExige2fa(usuario.id)) {
    // Obrigado por chave, mas ainda sem segredo: manda configurar.
    precisaConfigurar2fa = true;
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

/**
 * Revalidação pontual de TOTP para operações críticas de outros domínios
 * (ex.: aprovação de folha). Não emite sessão — só confere o código.
 *
 * As falhas daqui alimentam o MESMO contador consecutivo do login (C1.iv):
 * errar 5 códigos na aprovação de folha desativa igual. Quem estourar aqui
 * recebe ErroHttp (429 bloqueio temporário / 401 conta desativada) — as rotas
 * chamadoras já convertem via responderErro; o retorno em string fica restrito
 * aos três valores que os chamadores conhecem, para nenhum valor novo cair no
 * caminho do "ok".
 */
export async function validarTotpDoUsuario(
  usuarioId: number,
  codigo: string
): Promise<"ok" | "sem_2fa" | "invalido"> {
  const usuario = await buscarPorId(usuarioId);
  if (!usuario || !usuario.ativo || !usuario.totp_secret) {
    return "sem_2fa";
  }
  if (usuario.totp_bloqueado) {
    throw new ErroHttp(429, MENSAGEM_TOTP_BLOQUEADO);
  }
  if (validarCodigoTotp(usuario.totp_secret, codigo)) {
    await processarCodigoTotp(PORTAS_FALHAS_TOTP, usuario.id, true);
    return "ok";
  }
  const desfecho = await processarCodigoTotp(PORTAS_FALHAS_TOTP, usuario.id, false);
  if (desfecho === "desativado") {
    // A partir daqui a reconferência central de usuário ativo derruba a
    // sessão em qualquer rota; esta resposta só antecipa a notícia.
    throw new ErroHttp(401, MENSAGEM_CONTA_INATIVA);
  }
  if (desfecho === "bloqueado") {
    throw new ErroHttp(429, MENSAGEM_TOTP_BLOQUEADO);
  }
  return "invalido";
}

// ---------------------------------------------------------------------------
// Configuração de 2FA (enrolamento TOTP)
// ---------------------------------------------------------------------------

const EMISSOR_TOTP = "Fast Pessoas";
const ROTULO_2FA = "Autenticação em duas etapas";

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
    obrigatorio: await usuarioExige2fa(usuario.id),
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
  const passoAtivacao = validarTotpComPasso(secretPendente, codigo);
  if (passoAtivacao === null) {
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
    // Grava o PASSO do código de confirmação junto com o secret: sem isso, esse
    // mesmo código (ainda na janela de aceitação) seria reapresentável UMA vez
    // num login. Com o passo gravado, o login exige passo maior.
    await atualizarTotpSecret(cliente, usuario.id, secretPendente, passoAtivacao);
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
 * Quem compõe alguma chave que exige 2FA não pode desativar — a trava segue a
 * mesma régua da entrada (usuarioExige2fa), para não haver porta dos fundos:
 * seria inútil passar a exigir segundo fator no login se o próprio usuário
 * pudesse desligá-lo depois de entrar.
 */
export async function desativar2fa(
  sessao: PayloadSessao,
  dados: Desativacao2fa
): Promise<void> {
  const usuario = await exigirUsuarioAtivo(sessao);
  if (await usuarioExige2fa(usuario.id)) {
    throw new ErroHttp(
      403,
      "O seu perfil de acesso exige autenticação em duas etapas — ela não pode ser desativada."
    );
  }
  if (!usuario.totp_secret) {
    throw new ErroHttp(409, "A autenticação em duas etapas não está ativa.");
  }
  // Desativar 2FA é revalidação CRÍTICA (C1.iv): bloqueio vigente congela
  // antes de qualquer validação de código.
  if (usuario.totp_bloqueado) {
    throw new ErroHttp(429, MENSAGEM_TOTP_BLOQUEADO);
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
    // Falha de CÓDIGO conta no mesmo contador consecutivo do login. A falha
    // de SENHA logo acima não conta — a regra da C1 é sobre o código TOTP.
    const desfecho = await processarCodigoTotp(PORTAS_FALHAS_TOTP, usuario.id, false);
    if (desfecho === "desativado") {
      throw new ErroHttp(401, MENSAGEM_CONTA_INATIVA);
    }
    if (desfecho === "bloqueado") {
      throw new ErroHttp(429, MENSAGEM_TOTP_BLOQUEADO);
    }
    throw new ErroHttpCampo(
      400,
      "Código inválido. Confira o aplicativo autenticador.",
      "codigo"
    );
  }
  await processarCodigoTotp(PORTAS_FALHAS_TOTP, usuario.id, true);

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
