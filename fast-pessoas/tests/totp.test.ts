import { test } from "node:test";
import assert from "node:assert/strict";
import * as OTPAuth from "otpauth";

import { validarTotpComPasso } from "../src/dominios/identidade/totp";

// ===========================================================================
// TOTP de USO ÚNICO (pendência #11).
//
// Prova a metade PURA do anti-replay: o cálculo do PASSO absoluto a partir do
// código. A outra metade — o consumo atômico (só grava passo maior) — é o
// UPDATE condicional em identidade/repositorio.consumirPassoTotp, provado
// contra o banco em db/provas-totp.js.
//
// A regra que isto sustenta: código fresco tem passo MAIOR que o anterior, e o
// MESMO código tem sempre o MESMO passo. Logo, gravar "último passo aceito" e
// exigir passo maior barra a reapresentação sem nunca derrubar login legítimo.
// ===========================================================================

const PERIODO = 30;
// Secret FIXO e instante FIXO: o teste precisa ser determinístico.
const SECRET = "JBSWY3DPEHPK3PXP";
const totp = new OTPAuth.TOTP({
  secret: OTPAuth.Secret.fromBase32(SECRET),
  algorithm: "SHA1",
  digits: 6,
  period: PERIODO,
});
const T = 1_700_000_123_000;
const passoDeT = Math.floor(T / 1000 / PERIODO);

test("código fresco devolve o passo absoluto do instante", () => {
  const codigo = totp.generate({ timestamp: T });
  assert.equal(validarTotpComPasso(SECRET, codigo, T), passoDeT);
});

test("o MESMO código devolve sempre o mesmo passo (base do anti-replay)", () => {
  const codigo = totp.generate({ timestamp: T });
  assert.equal(validarTotpComPasso(SECRET, codigo, T), passoDeT);
  // Ainda no mesmo período (janela de 30s): mesmo passo → o consumo no banco
  // recusaria a segunda apresentação.
  assert.equal(validarTotpComPasso(SECRET, codigo, T + 5_000), passoDeT);
});

test("código do período anterior entra na janela, com passo MENOR", () => {
  const antigo = totp.generate({ timestamp: T - PERIODO * 1000 });
  assert.equal(validarTotpComPasso(SECRET, antigo, T), passoDeT - 1);
});

test("código de dois períodos atrás fica fora da janela (null)", () => {
  const velho = totp.generate({ timestamp: T - 2 * PERIODO * 1000 });
  assert.equal(validarTotpComPasso(SECRET, velho, T), null);
});

test("token malformado devolve null (sem estourar)", () => {
  assert.equal(validarTotpComPasso(SECRET, "not-a-code", T), null);
});
