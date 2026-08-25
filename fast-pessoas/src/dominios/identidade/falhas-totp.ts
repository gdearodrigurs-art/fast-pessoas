/**
 * Política de falhas CONSECUTIVAS de código TOTP (decisão C1 modificada,
 * docs/20): 5 falhas seguidas desativam o usuário; acerto zera o contador; o
 * último usuário ativo capaz de gerir usuários nunca é desativado por esta
 * regra — recebe bloqueio temporário, senão ninguém reativaria ninguém.
 *
 * O módulo é PURO de propósito: recebe as portas (contador, parâmetros,
 * desativação, bloqueio) e devolve o desfecho. O serviço injeta as portas
 * reais (identidade/repositorio); o teste injeta um contador em memória e
 * prova a política sem banco (tests/falhas-totp.test.ts).
 *
 * O anti-replay (consumirPassoTotp, 0060) é camada SEPARADA e fica intacto:
 * replay é código CERTO já consumido — não conta como falha aqui, senão o
 * ataque de negação de serviço (risco aceito registrado na C1) ficaria mais
 * barato do que o dono aceitou.
 */

export interface PortasFalhasTotp {
  /** Incrementa o contador de falhas consecutivas e devolve o total novo (atômico). */
  registrarFalha(usuarioId: number): Promise<number>;
  /** Acerto zera o contador (e limpa bloqueio vencido). */
  zerarFalhas(usuarioId: number): Promise<void>;
  /** Limiar e duração do bloqueio — administráveis (eixo 9), nunca chumbados. */
  lerParametros(): Promise<{ maxFalhasTotp: number; bloqueioTotpMinutos: number }>;
  /**
   * Desativa o usuário com auditoria (autor = sistema). Devolve false quando a
   * desativação foi RECUSADA por ele ser o último ativo com a chave de gestão
   * de usuários.
   */
  desativarComAuditoria(usuarioId: number, limiar: number): Promise<boolean>;
  /** Bloqueio temporário (caso último-admin), com auditoria. */
  bloquearComAuditoria(usuarioId: number, minutos: number): Promise<void>;
}

export type DesfechoCodigoTotp = "ok" | "falha" | "desativado" | "bloqueado";

/**
 * Registra o resultado de UMA apresentação de código TOTP (login ou
 * revalidação crítica) e aplica a consequência:
 *  - código certo  → zera o contador ("consecutivas", não janela) → "ok";
 *  - código errado → incrementa; abaixo do limiar → "falha";
 *  - no limiar     → desativa ("desativado") — ou, se for o último gestor de
 *    usuários ativo, bloqueia temporariamente ("bloqueado"), nunca desativa.
 */
export async function processarCodigoTotp(
  portas: PortasFalhasTotp,
  usuarioId: number,
  codigoConferiu: boolean
): Promise<DesfechoCodigoTotp> {
  if (codigoConferiu) {
    await portas.zerarFalhas(usuarioId);
    return "ok";
  }

  const total = await portas.registrarFalha(usuarioId);
  const { maxFalhasTotp, bloqueioTotpMinutos } = await portas.lerParametros();
  // ">=" e não "==": se o limiar for reduzido pela administração com contadores
  // já acima dele, a PRÓXIMA falha aplica a regra — nunca fica um usuário
  // eternamente acima do limiar sem consequência.
  if (total < maxFalhasTotp) {
    return "falha";
  }

  if (await portas.desativarComAuditoria(usuarioId, maxFalhasTotp)) {
    return "desativado";
  }
  await portas.bloquearComAuditoria(usuarioId, bloqueioTotpMinutos);
  return "bloqueado";
}
