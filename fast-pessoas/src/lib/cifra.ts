import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * ÚNICO ponto de cifra do app (dado de saúde — LGPD art. 11): AES-256-GCM na
 * camada de aplicação, chave em CHAVE_CIFRA_SAUDE (32 bytes em base64url, via
 * secret manager/.env — nunca no banco, sem pgcrypto). O valor cifrado viaja
 * e persiste no formato `iv:tag:cifrado` (cada parte em base64). O texto em
 * claro NUNCA vai para banco, log ou trilha de auditoria.
 */

const TAMANHO_CHAVE_BYTES = 32;
const TAMANHO_IV_BYTES = 12; // recomendado para GCM

function chave(): Buffer {
  const valor = process.env.CHAVE_CIFRA_SAUDE;
  if (!valor) {
    throw new Error(
      "CHAVE_CIFRA_SAUDE ausente — configure no .env uma chave de 32 bytes em base64url"
    );
  }
  const bytes = Buffer.from(valor, "base64url");
  if (bytes.length !== TAMANHO_CHAVE_BYTES) {
    throw new Error(
      "CHAVE_CIFRA_SAUDE inválida — a chave precisa ter exatamente 32 bytes em base64url"
    );
  }
  return bytes;
}

/** Cifra texto em claro; retorna `iv:tag:cifrado` (base64). */
export function cifrar(textoClaro: string): string {
  const iv = randomBytes(TAMANHO_IV_BYTES);
  const cifrador = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([
    cifrador.update(textoClaro, "utf8"),
    cifrador.final(),
  ]);
  const tag = cifrador.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
}

/** Decifra o formato `iv:tag:cifrado`; falha alto se adulterado ou chave errada. */
export function decifrar(valorCifrado: string): string {
  const partes = valorCifrado.split(":");
  if (partes.length !== 3 || partes.some((parte) => parte.length === 0)) {
    throw new Error(
      "Valor cifrado em formato inválido — esperado iv:tag:cifrado em base64"
    );
  }
  const [iv, tag, cifrado] = partes.map((parte) =>
    Buffer.from(parte, "base64")
  );
  const decifrador = createDecipheriv("aes-256-gcm", chave(), iv);
  decifrador.setAuthTag(tag);
  return Buffer.concat([
    decifrador.update(cifrado),
    decifrador.final(),
  ]).toString("utf8");
}
