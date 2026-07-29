// db/semear/comum.js — helpers compartilhados do povoador de demonstração.
//
// Regras que TODO módulo de semeadura respeita (ver db/semear-demo.js):
//   • determinismo: todo número aleatório vem de aleatorio(semente) — rodar
//     duas vezes produz os MESMOS dados (só as datas andam com o calendário);
//   • datas relativas a HOJE (fuso America/Sao_Paulo, como o app calcula),
//     gravadas como DATE/TIMESTAMPTZ em UTC;
//   • dinheiro em NUMERIC (o app converte para centavos na borda);
//   • todo INSERT parametrizado ($1, $2…), nunca concatenação de valores.
//
// Uso isolado de um módulo: node --env-file=.env db/semear/NN-modulo.js
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const { Client } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ------------------------------------------------------------------ conexão

/** Abre um Client do pg com DATABASE_URL já conectado. */
async function conectar() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL ausente — rode com "node --env-file=.env ..." (nunca leia o .env).'
    );
  }
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  return cliente;
}

// ------------------------------------------------------------------ PRNG determinístico

/**
 * mulberry32: gerador pseudoaleatório de 32 bits, rápido e determinístico.
 * Mesma semente ⇒ mesma sequência ⇒ demo idêntica a cada `npm run db:demo`.
 */
function aleatorio(semente) {
  let estado = semente >>> 0;
  return function proximo() {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Um item da lista, escolhido pelo rng. */
function escolher(rng, lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('escolher(): lista vazia');
  }
  return lista[Math.floor(rng() * lista.length) % lista.length];
}

/** Inteiro em [min, max] (ambos inclusive). */
function inteiro(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Número com casas decimais fixas em [min, max]. */
function decimal(rng, min, max, casas = 2) {
  return Number((min + rng() * (max - min)).toFixed(casas));
}

/** Embaralha uma cópia da lista (Fisher-Yates com o rng dado). */
function embaralhar(rng, lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// ------------------------------------------------------------------ CPF

/**
 * CPF FICTÍCIO com dígitos verificadores corretos (algoritmo oficial: módulo 11
 * com pesos 10→2 e 11→2). Nenhum destes CPFs pertence a pessoa real — servem
 * só para que as telas e validações do app aceitem o dado semeado.
 */
function cpfValido(rng) {
  const digitos = [];
  for (let i = 0; i < 9; i += 1) digitos.push(inteiro(rng, 0, 9));
  // CPFs com todos os dígitos iguais são inválidos na prática — desfaz o caso.
  if (digitos.every((d) => d === digitos[0])) digitos[0] = (digitos[0] + 1) % 10;

  const verificador = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += base[i] * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  digitos.push(verificador(digitos, 10));
  digitos.push(verificador(digitos, 11));
  return digitos.join('');
}

/**
 * CNPJ FICTÍCIO válido (raiz de 8 dígitos + ordem da filial + DV módulo 11).
 * Formato só de dígitos, como exige o CHECK de rh.estabelecimento.
 */
function cnpjValido(raiz8, ordemFilial) {
  const base = String(raiz8).padStart(8, '0') + String(ordemFilial).padStart(4, '0');
  const digitos = base.split('').map(Number);
  const calcular = (pesos) => {
    const soma = pesos.reduce((acc, peso, i) => acc + digitos[i] * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  digitos.push(calcular([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  digitos.push(calcular([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return digitos.join('');
}

// ------------------------------------------------------------------ datas relativas a hoje

/**
 * "Hoje" no fuso em que o app faz conta de data (America/Sao_Paulo), como
 * meia-noite UTC — é assim que o app grava fato datado sem hora.
 */
function hoje() {
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [ano, mes, dia] = formatador.format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Data deslocada em dias a partir de hoje (negativo = passado). */
function dataRelativa(dias) {
  const data = hoje();
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

/** Data deslocada em meses a partir de hoje, sem "vazar" o mês (31/03 → 28/02). */
function mesesAtras(n) {
  const base = hoje();
  const dia = base.getUTCDate();
  const alvo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - n, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo;
}

/** Data deslocada em anos a partir de hoje. */
function anosAtras(n) {
  return mesesAtras(Math.round(n * 12));
}

/** 'YYYY-MM-DD' (UTC) — formato que o Postgres aceita direto em DATE. */
function iso(data) {
  return data.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DDTHH:MM:SS.sssZ' — para colunas TIMESTAMPTZ. */
function isoInstante(data) {
  return data.toISOString();
}

/** 'YYYY-MM' — competência de folha. */
function competencia(data) {
  return data.toISOString().slice(0, 7);
}

// ------------------------------------------------------------------ cifra de dado de saúde

const TAMANHO_CHAVE_BYTES = 32;
const TAMANHO_IV_BYTES = 12;

function chaveSaude() {
  const valor = process.env.CHAVE_CIFRA_SAUDE;
  if (!valor) {
    throw new Error(
      'CHAVE_CIFRA_SAUDE ausente — configure no .env uma chave de 32 bytes em base64url'
    );
  }
  const bytes = Buffer.from(valor, 'base64url');
  if (bytes.length !== TAMANHO_CHAVE_BYTES) {
    throw new Error(
      'CHAVE_CIFRA_SAUDE inválida — a chave precisa ter exatamente 32 bytes em base64url'
    );
  }
  return bytes;
}

/**
 * Réplica EXATA de src/lib/cifra.ts (AES-256-GCM, formato `iv:tag:cifrado` em
 * base64) para que o app consiga decifrar o que a demo semear. Qualquer
 * mudança lá tem que ser espelhada aqui.
 */
function cifrarSaude(textoClaro) {
  const iv = crypto.randomBytes(TAMANHO_IV_BYTES);
  const cifrador = crypto.createCipheriv('aes-256-gcm', chaveSaude(), iv);
  const cifrado = Buffer.concat([cifrador.update(textoClaro, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${cifrado.toString('base64')}`;
}

// ------------------------------------------------------------------ senha e 2FA

/**
 * bcrypt custo 10 (o app usa 12 no cadastro real; aqui 10 porque são ~68
 * usuários por execução e o `compare` do login funciona com qualquer custo).
 */
function hashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function paraBase32(bytes) {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const octeto of bytes) {
    valor = (valor << 8) | octeto;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

/**
 * Secret TOTP de 20 bytes em base32 (RFC 4648, sem padding) — o mesmo tamanho
 * que `new OTPAuth.Secret({ size: 20 })` do app, aceito por
 * OTPAuth.Secret.fromBase32. Com rng, o secret é determinístico: resetar a
 * demo NÃO invalida o QR Code já lido no autenticador.
 */
function segredoTotp(rng) {
  const bytes = rng
    ? Buffer.from(Array.from({ length: 20 }, () => Math.floor(rng() * 256)))
    : crypto.randomBytes(20);
  return paraBase32(bytes);
}

const EMISSOR_TOTP = 'Fast Pessoas'; // igual a src/dominios/identidade/servico.ts

/** URI otpauth:// equivalente ao que o app gera no enrolamento de 2FA. */
function uriOtpauth(email, secretBase32) {
  const rotulo = encodeURIComponent(`${EMISSOR_TOTP}:${email}`);
  const parametros = new URLSearchParams({
    secret: secretBase32,
    issuer: EMISSOR_TOTP,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${rotulo}?${parametros.toString()}`;
}

// ------------------------------------------------------------------ triggers append-only

const PADRAO_TABELA = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/**
 * Desabilita os triggers de aplicação (append-only, congelamento de vigência,
 * tocar_atualizado_em) das tabelas dadas, roda `fn` e REABILITA — tudo dentro
 * da transação corrente. `DISABLE TRIGGER USER` não toca nos triggers internos
 * de FK: a integridade referencial continua valendo durante a limpeza.
 * Se `fn` falhar, o ROLLBACK desfaz o ALTER TABLE junto (DDL é transacional
 * no Postgres) — por isso a reabilitação no finally é tolerante a erro.
 */
async function comTriggersDesligados(cliente, tabelas, fn) {
  for (const tabela of tabelas) {
    if (!PADRAO_TABELA.test(tabela)) {
      throw new Error(`Nome de tabela inválido em comTriggersDesligados: ${tabela}`);
    }
  }
  const emLote = (acao) =>
    tabelas.map((tabela) => `ALTER TABLE ${tabela} ${acao} TRIGGER USER`).join('; ');

  await cliente.query(emLote('DISABLE'));
  try {
    return await fn();
  } finally {
    try {
      await cliente.query(emLote('ENABLE'));
    } catch {
      // transação já abortada: o ROLLBACK reverte o DISABLE de qualquer jeito
    }
  }
}

// ------------------------------------------------------------------ utilidades

function log(...partes) {
  console.log(...partes);
}

/**
 * INSERT em lote com VALUES multi-linha e parâmetros ($1, $2…).
 * O banco de demo é remoto: 400 INSERTs individuais custam minutos de
 * ida-e-volta, os mesmos 400 em ~1 statement custam segundos. Fatiamos para
 * ficar longe do teto de 65535 parâmetros do protocolo do Postgres.
 *
 *   linhas: array de arrays, na ordem de `colunas`
 *   retorno: lista de colunas do RETURNING (ex.: 'id, matricula')
 */
async function inserirLote(cliente, tabela, colunas, linhas, retorno) {
  if (!PADRAO_TABELA.test(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  if (linhas.length === 0) return [];

  const largura = colunas.length;
  const porFatia = Math.max(1, Math.floor(8000 / largura));
  const retornados = [];

  for (let inicio = 0; inicio < linhas.length; inicio += porFatia) {
    const fatia = linhas.slice(inicio, inicio + porFatia);
    const grupos = fatia
      .map((_, i) => {
        const marcadores = [];
        for (let j = 0; j < largura; j += 1) marcadores.push(`$${i * largura + j + 1}`);
        return `(${marcadores.join(', ')})`;
      })
      .join(', ');
    const sql =
      `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES ${grupos}` +
      (retorno ? ` RETURNING ${retorno}` : '');
    const { rows } = await cliente.query(sql, fatia.flat());
    retornados.push(...rows);
  }
  return retornados;
}

/** Remove acentos e reduz a [a-z0-9] — base de e-mails e slugs. */
function semAcento(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Arredonda para o múltiplo de 10 mais próximo (salários "de mercado"). */
function arredondarDezena(valor) {
  return Math.round(valor / 10) * 10;
}

/** Contagem simples de uma tabela (usada nos resumos). */
async function contar(cliente, tabela, condicao) {
  if (!PADRAO_TABELA.test(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  const sql = `SELECT count(*)::int AS total FROM ${tabela}${condicao ? ` WHERE ${condicao}` : ''}`;
  const { rows } = await cliente.query(sql);
  return rows[0].total;
}

/**
 * Executa um módulo de semeadura sozinho, na própria transação — permite
 * `node --env-file=.env db/semear/01-base.js` para teste isolado.
 */
async function executarSozinho(nome, semear) {
  const cliente = await conectar();
  try {
    await cliente.query('BEGIN');
    const ctx = await semear(cliente, {});
    await cliente.query('COMMIT');
    log(`\n${nome}: ok`);
    return ctx;
  } catch (erro) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      /* sem transação aberta */
    }
    console.error(`\n${nome}: FALHOU — ${erro.message}`);
    process.exitCode = 1;
    return null;
  } finally {
    await cliente.end();
  }
}

module.exports = {
  conectar,
  aleatorio,
  escolher,
  inteiro,
  decimal,
  embaralhar,
  cpfValido,
  cnpjValido,
  hoje,
  dataRelativa,
  mesesAtras,
  anosAtras,
  iso,
  isoInstante,
  competencia,
  cifrarSaude,
  hashSenha,
  segredoTotp,
  uriOtpauth,
  comTriggersDesligados,
  inserirLote,
  log,
  semAcento,
  arredondarDezena,
  contar,
  executarSozinho,
};
