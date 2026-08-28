import * as OTPAuth from "otpauth";

// Parâmetros do TOTP — os MESMOS do login, do enrolamento e da ferramenta
// db/codigo-2fa.js (SHA1, 6 dígitos, período de 30s). Não mude um sem os outros.
const PERIODO_SEGUNDOS = 30;
const JANELA = 1; // aceita ±1 período (30s) de folga de relógio

/**
 * Valida o código TOTP contra o secret e devolve o PASSO ABSOLUTO (o contador de
 * períodos de 30s desde a época) que ele representa, ou `null` se o código não
 * bate na janela.
 *
 * O passo é o que torna o código de USO ÚNICO: quem já consumiu o passo N recusa
 * qualquer código do mesmo passo (replay) e aceita só passo MAIOR. Como o passo
 * é função do relógio (não do secret), ele é monotônico — um código fresco tem
 * sempre passo maior que o anterior, então rastrear "último passo aceito" não
 * derruba login legítimo, só barra a reapresentação do MESMO código.
 *
 * `agoraMs` é injetável para o teste conseguir fixar o instante (a função de
 * produção usa Date.now()).
 */
export function validarTotpComPasso(
  secret: string,
  codigo: string,
  agoraMs: number = Date.now()
): number | null {
  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: PERIODO_SEGUNDOS,
    });
    // otpauth devolve o DELTA (offset em períodos: -1, 0 ou +1 com janela 1),
    // ou null quando não bate. O passo absoluto é o contador de agora + delta.
    const delta = totp.validate({
      token: codigo,
      window: JANELA,
      timestamp: agoraMs,
    });
    if (delta === null) return null;
    const passoAtual = Math.floor(agoraMs / 1000 / PERIODO_SEGUNDOS);
    return passoAtual + delta;
  } catch {
    return null;
  }
}
