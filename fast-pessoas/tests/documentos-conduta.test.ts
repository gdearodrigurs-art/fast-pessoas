import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esquemaAbrirAto,
  esquemaEnvioBase64,
  esquemaEnvioMultipart,
  estadoDaPendencia,
  pendenciaBloqueia,
  SituacaoPendencia,
} from "../src/dominios/documentos/esquemas";
import {
  alturaEstimadaPdf,
  contarPaginasPdf,
} from "../src/dominios/documentos/paginas-pdf";

// ===========================================================================
// CICLO DE CIÊNCIA (migration 0086) — decisões B1/B4/B6 de docs/20.
// A regra de estado e bloqueio é PURA e mora num lugar só (esquemas.ts):
// o repositório traz os fatos, estas funções dizem o que significam. É a
// matriz testada aqui — o gate da Onda 2 vai confiar nela.
// ===========================================================================

function situacao(parcial: Partial<SituacaoPendencia>): SituacaoPendencia {
  return {
    bloqueante: false,
    temCiencia: false,
    temRecusa: false,
    temAto: false,
    temLiberacao: false,
    vencida: false,
    ...parcial,
  };
}

// ---------------------------------------------------------------- B1: o bloqueante trava; política com prazo só lembra

test("documento bloqueante pendente BLOQUEIA (B1 — 1º acesso)", () => {
  const cenario = situacao({ bloqueante: true });
  assert.equal(pendenciaBloqueia(cenario), true);
  assert.equal(estadoDaPendencia(cenario), "pendente");
});

test("política não bloqueante pendente NÃO bloqueia — pendência com lembrete", () => {
  assert.equal(pendenciaBloqueia(situacao({})), false);
});

test("prazo vencido SEM ato registrado não bloqueia (B1: sem bloquear)", () => {
  const cenario = situacao({ vencida: true });
  assert.equal(pendenciaBloqueia(cenario), false);
  assert.equal(estadoDaPendencia(cenario), "vencido");
});

// ---------------------------------------------------------------- B6: recusado segue bloqueado; ato registrado trava; só liberação destrava

test("recusa no documento bloqueante NÃO destrava (B6 — recusado segue bloqueado)", () => {
  const cenario = situacao({ bloqueante: true, temRecusa: true });
  assert.equal(pendenciaBloqueia(cenario), true);
  assert.equal(estadoDaPendencia(cenario), "recusado");
});

test("prazo vencido COM ato registrado bloqueia até liberação (B6 modificado)", () => {
  const cenario = situacao({ vencida: true, temAto: true });
  assert.equal(pendenciaBloqueia(cenario), true);
});

test("recusa em política não bloqueante só trava quando o DP registra o ato", () => {
  assert.equal(pendenciaBloqueia(situacao({ temRecusa: true })), false);
  assert.equal(
    pendenciaBloqueia(situacao({ temRecusa: true, temAto: true })),
    true
  );
});

test("liberação explícita destrava o bloqueante recusado (B6 — rh.conduta.liberar)", () => {
  const cenario = situacao({
    bloqueante: true,
    temRecusa: true,
    temAto: true,
    temLiberacao: true,
  });
  assert.equal(pendenciaBloqueia(cenario), false);
  assert.equal(estadoDaPendencia(cenario), "liberado");
});

test("ciência destrava SEMPRE — a rota de regularização nunca fecha (B4)", () => {
  const cenario = situacao({
    bloqueante: true,
    temRecusa: true,
    temAto: true,
    temCiencia: true,
  });
  assert.equal(pendenciaBloqueia(cenario), false);
  assert.equal(estadoDaPendencia(cenario), "assinado");
});

// ---------------------------------------------------------------- envio: regras cruzadas do ciclo (borda, zod)

const arquivoBase64 = {
  categoria: "politica",
  titulo: "Código de Conduta",
  sensivel: false,
  nome_arquivo: "conduta.txt",
  mime: "text/plain",
  conteudo_base64: "QQ==",
};

test("bloqueante sem exige_ciencia é recusado na borda", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: false,
    bloqueante: true,
  });
  assert.equal(analise.success, false);
});

test("prazo em documento bloqueante é recusado (bloqueante trava já, sem prazo)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: true,
    bloqueante: true,
    prazo_ciencia_dias: 15,
  });
  assert.equal(analise.success, false);
});

test("exige_ciencia em documento de colaborador é recusado (ciclo é do acervo geral)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: true,
    colaborador_id: 7,
  });
  assert.equal(analise.success, false);
});

test("política com exige_ciencia e prazo passa na borda", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: true,
    prazo_ciencia_dias: 15,
  });
  assert.equal(analise.success, true);
});

test("multipart: campos do ciclo chegam como texto e valem as mesmas regras", () => {
  const recusado = esquemaEnvioMultipart.safeParse({
    categoria: "politica",
    titulo: "Código de Conduta",
    sensivel: "false",
    exige_ciencia: "false",
    bloqueante: "true",
  });
  assert.equal(recusado.success, false);

  const aceito = esquemaEnvioMultipart.safeParse({
    categoria: "politica",
    titulo: "Código de Conduta",
    sensivel: "false",
    exige_ciencia: "true",
    bloqueante: "true",
  });
  assert.equal(aceito.success, true);
  assert.equal(aceito.data?.bloqueante, true);
});

// ---------------------------------------------------------------- ato com testemunhas (B2): 2, distintas, nunca a própria pessoa

test("ato exige exatamente 2 testemunhas", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "recusa",
    descricao: "Recusa presencial diante do DP.",
    testemunhas: [21],
  });
  assert.equal(analise.success, false);
});

test("testemunhas repetidas são recusadas", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "recusa",
    descricao: "Recusa presencial diante do DP.",
    testemunhas: [21, 21],
  });
  assert.equal(analise.success, false);
});

test("a pessoa do ato não pode testemunhar o próprio ato", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "prazo_vencido",
    descricao: "Prazo vencido sem manifestação.",
    testemunhas: [10, 21],
  });
  assert.equal(analise.success, false);
});

test("ato com 2 testemunhas distintas passa", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "recusa",
    descricao: "Recusa presencial diante do DP.",
    testemunhas: [21, 22],
  });
  assert.equal(analise.success, true);
});

// ---------------------------------------------------------------- contagem de páginas do PDF (B5 — rolagem rastreável)

function bytesDe(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

test("conta os objetos /Type /Page sem confundir com /Pages", () => {
  const pdf =
    "%PDF-1.4\n1 0 obj << /Type /Pages /Count 3 >>\n" +
    "2 0 obj << /Type /Page >>\n3 0 obj << /Type /Page >>\n" +
    "4 0 obj << /Type /Page >>\n%%EOF";
  assert.equal(contarPaginasPdf(bytesDe(pdf)), 3);
});

test("PDF comprimido (sem /Type /Page em claro) cai no /Count da raiz", () => {
  const pdf = "%PDF-1.7\n1 0 obj << /Type /Pages /Count 12 >>\n%%EOF";
  assert.equal(contarPaginasPdf(bytesDe(pdf)), 12);
});

test("bytes sem marcador nenhum devolvem null (o visualizador usa o chão)", () => {
  assert.equal(contarPaginasPdf(bytesDe("nada de pdf aqui")), null);
});

test("altura estimada cobre o documento inteiro na largura dada", () => {
  assert.equal(alturaEstimadaPdf(4, 800), Math.ceil(4 * 800 * 1.5));
  // sem contagem: chão de 10 páginas — nunca zero
  assert.equal(alturaEstimadaPdf(null, 800), Math.ceil(10 * 800 * 1.5));
});
