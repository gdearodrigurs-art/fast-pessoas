// Análise PURA das planilhas de carga inicial (estrutura e cargos): parsing,
// normalização e validação de formato, sem tocar banco — é a parte que a suíte
// de testes alcança (tsconfig.testes.json compila só o alcance dos imports).
//
// REGRA DE OURO herdada do importador de ponto (ponto/servico.ts): validação
// LINHA A LINHA. Linha ruim vira rejeição com motivo no relatório do lote e o
// resto do arquivo entra normalmente — abortar tudo é o que faz o DP desistir.
//
// LAYOUT NOSSO (decisão F3/E4 do dono, docs/20: nós definimos o layout e a
// origem se adapta). Separador ; por padrão (aceita , e tab), com ou sem linha
// de cabeçalho. Documentado também no cabeçalho de cada rota e na tela.
//
// Estrutura — 7 colunas (as três últimas opcionais por linha):
//   empresa ; cnpj ; razao_social ; tipo ; estabelecimento ; cc_codigo ; cc_nome
//
//   empresa          nome fantasia da empresa do grupo (obrigatório)
//   cnpj             14 dígitos, com ou sem máscara; vazio = ainda sem CNPJ
//   razao_social     opcional
//   tipo             matriz | filial — obrigatório só quando a linha CRIA a
//                    empresa (empresa que já existe ignora a coluna)
//   estabelecimento  nome da unidade (LOTAÇÃO); vazio = linha sem unidade
//   cc_codigo        código do centro de custo, vazio = linha sem CC
//   cc_nome          nome do centro de custo (obrigatório se cc_codigo veio)
//
// Cargos — 4 colunas (nível e faixa opcionais):
//   cargo ; nivel ; faixa_min ; faixa_max
//
//   cargo      nome do cargo (obrigatório)
//   nivel      nome do nível hierárquico no catálogo administrável (A6:a)
//   faixa_*    salário em REAIS com vírgula ("3.500,00"); convertido para
//              CENTAVOS INTEIROS na análise (eixo 5 — dinheiro é centavo
//              inteiro; nunca parseFloat). Os dois juntos ou nenhum.

import { TIPOS_EMPRESA, type TipoEmpresa } from "./esquemas";

export const COLUNAS_ESTRUTURA = [
  "empresa",
  "cnpj",
  "razao_social",
  "tipo",
  "estabelecimento",
  "cc_codigo",
  "cc_nome",
] as const;

export const COLUNAS_CARGOS = [
  "cargo",
  "nivel",
  "faixa_min",
  "faixa_max",
] as const;

// ------------------------------------------------------------------ tipos

export interface LinhaEstrutura {
  empresa_nome: string;
  cnpj: string | null;
  razao_social: string | null;
  tipo: TipoEmpresa | null;
  estabelecimento: string | null;
  cc_codigo: string | null;
  cc_nome: string | null;
}

export interface LinhaCargo {
  nome: string;
  nivel: string | null;
  faixa_min_centavos: number | null;
  faixa_max_centavos: number | null;
}

export type Analise<T> =
  | { ok: true; dados: T }
  | { ok: false; motivo: string };

export interface LinhaRejeitadaCarga {
  linha: number;
  motivo: string;
  conteudo: string;
}

/** Relatório do lote — o mesmo shape gravado em rh.lote_carga.relatorio. */
export interface ResultadoCarga {
  lote_id: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_ja_existiam: number;
  linhas_rejeitadas: number;
  rejeicoes: LinhaRejeitadaCarga[];
  resumo: string;
}

// ------------------------------------------------------------------ normalização

/**
 * Chave de comparação de IDENTIDADE por nome: sem acento, minúscula, espaços
 * colapsados. É o que faz "Casa do Montador" e "casa  do montador" serem a
 * MESMA empresa na reimportação (idempotência), em vez de uma duplicata.
 */
export function chaveDeNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * CNPJ: aceita com ou sem máscara; vazio é "ainda não informado" (a 0047
 * deixou o CNPJ NULLABLE de propósito). Mesma régua do esquemaCnpjOpcional da
 * tela: 14 dígitos, sem conferir DV — paridade com o que a tela aceita.
 */
export function normalizarCnpj(
  bruto: string
): { ok: true; cnpj: string | null } | { ok: false; motivo: string } {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos === "") return { ok: true, cnpj: null };
  if (!/^\d{14}$/.test(digitos)) {
    return { ok: false, motivo: `CNPJ "${bruto.trim()}" não tem 14 dígitos` };
  }
  return { ok: true, cnpj: digitos };
}

/**
 * Reais → CENTAVOS INTEIROS, por manipulação de dígitos (eixo 5: dinheiro é
 * centavo inteiro; parseFloat é barrado pelo lint e "1.234,56" viraria 1.234).
 *
 * Aceita: "3500", "3500,5", "3.500,00", "3500.00", "R$ 3.500,00".
 * Regra do separador: com '.' E ',' juntos, '.' é milhar e ',' é decimal;
 * só ',' é decimal; só '.' é decimal quando seguido de 1–2 dígitos no fim
 * (senão é milhar). Devolve null quando não é um valor monetário.
 */
export function reaisParaCentavos(bruto: string): number | null {
  const texto = bruto.trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (texto === "" || /[^0-9.,]/.test(texto)) return null;

  const temPonto = texto.includes(".");
  const temVirgula = texto.includes(",");
  let inteiros: string;
  let decimais: string;

  if (temVirgula) {
    // ',' é o decimal; qualquer '.' restante é milhar.
    const partes = texto.split(",");
    if (partes.length !== 2) return null;
    inteiros = partes[0].replace(/\./g, "");
    decimais = partes[1];
  } else if (temPonto) {
    const ultimo = texto.lastIndexOf(".");
    const depois = texto.slice(ultimo + 1);
    if (depois.length >= 1 && depois.length <= 2) {
      inteiros = texto.slice(0, ultimo).replace(/\./g, "");
      decimais = depois;
    } else {
      inteiros = texto.replace(/\./g, "");
      decimais = "";
    }
  } else {
    inteiros = texto;
    decimais = "";
  }

  if (inteiros === "" && decimais === "") return null;
  if (!/^\d*$/.test(inteiros) || !/^\d{0,2}$/.test(decimais)) return null;

  const reais = Number.parseInt(inteiros === "" ? "0" : inteiros, 10);
  const centavos = Number.parseInt(decimais.padEnd(2, "0") || "00", 10);
  if (!Number.isSafeInteger(reais * 100 + centavos)) return null;
  return reais * 100 + centavos;
}

/** Divide o conteúdo em linhas úteis, preservando o número original da linha. */
export function dividirLinhas(
  conteudo: string
): { numero: number; bruta: string }[] {
  return conteudo
    .split(/\r?\n/)
    .map((linha, indice) => ({ numero: indice + 1, bruta: linha.trim() }))
    .filter((item) => item.bruta !== "");
}

/** Preenche colunas ausentes no fim da linha (planilha corta ; vazios finais). */
function completarColunas(colunas: string[], total: number): string[] {
  const completas = colunas.slice(0, total);
  while (completas.length < total) completas.push("");
  return completas;
}

// ------------------------------------------------------------------ estrutura

const LIMITES = {
  nome_empresa: 120,
  razao_social: 200,
  unidade: 120,
  cc_codigo: 30,
  cc_nome: 120,
  cargo: 120,
} as const;

/**
 * A primeira linha é cabeçalho quando a 1ª coluna repete EXATAMENTE o nome do
 * layout (normalizado). Igualdade, nunca startsWith: com prefixo, uma linha de
 * DADOS como "Empresa Brasileira de Logística;..." era engolida como cabeçalho
 * e sumia sem entrar em nenhuma conta do relatório.
 */
export function ehCabecalho(primeiraColuna: string, nomeDaColuna: string): boolean {
  return chaveDeNome(primeiraColuna) === nomeDaColuna;
}

export function analisarLinhaEstrutura(
  colunasBrutas: string[]
): Analise<LinhaEstrutura> {
  const [empresa, cnpjBruto, razao, tipoBruto, unidade, ccCodigo, ccNome] =
    completarColunas(
      colunasBrutas.map((c) => c.trim()),
      COLUNAS_ESTRUTURA.length
    );

  if (empresa.length < 2) {
    return { ok: false, motivo: "Coluna 1 (empresa) é obrigatória" };
  }
  if (empresa.length > LIMITES.nome_empresa) {
    return {
      ok: false,
      motivo: `Nome da empresa acima de ${LIMITES.nome_empresa} caracteres`,
    };
  }

  const cnpj = normalizarCnpj(cnpjBruto);
  if (!cnpj.ok) return { ok: false, motivo: cnpj.motivo };

  if (razao.length > LIMITES.razao_social) {
    return {
      ok: false,
      motivo: `Razão social acima de ${LIMITES.razao_social} caracteres`,
    };
  }

  let tipo: TipoEmpresa | null = null;
  if (tipoBruto !== "") {
    const chave = chaveDeNome(tipoBruto);
    tipo = (TIPOS_EMPRESA as readonly string[]).includes(chave)
      ? (chave as TipoEmpresa)
      : null;
    if (tipo === null) {
      return {
        ok: false,
        motivo: `Tipo "${tipoBruto}" desconhecido (use matriz ou filial)`,
      };
    }
  }

  if (unidade !== "" && unidade.length < 2) {
    return { ok: false, motivo: "Nome do estabelecimento precisa de 2+ caracteres" };
  }
  if (unidade.length > LIMITES.unidade) {
    return {
      ok: false,
      motivo: `Nome do estabelecimento acima de ${LIMITES.unidade} caracteres`,
    };
  }

  if (ccCodigo === "" && ccNome !== "") {
    return {
      ok: false,
      motivo: "Centro de custo com nome mas sem código (coluna 6)",
    };
  }
  if (ccCodigo !== "" && ccNome.length < 2) {
    return {
      ok: false,
      motivo: "Centro de custo com código mas sem nome (coluna 7)",
    };
  }
  if (ccCodigo.length > LIMITES.cc_codigo) {
    return {
      ok: false,
      motivo: `Código do centro de custo acima de ${LIMITES.cc_codigo} caracteres`,
    };
  }
  if (ccNome.length > LIMITES.cc_nome) {
    return {
      ok: false,
      motivo: `Nome do centro de custo acima de ${LIMITES.cc_nome} caracteres`,
    };
  }

  return {
    ok: true,
    dados: {
      empresa_nome: empresa,
      cnpj: cnpj.cnpj,
      razao_social: razao === "" ? null : razao,
      tipo,
      estabelecimento: unidade === "" ? null : unidade,
      cc_codigo: ccCodigo === "" ? null : ccCodigo,
      cc_nome: ccNome === "" ? null : ccNome,
    },
  };
}

// ------------------------------------------------------------------ cargos

export function analisarLinhaCargo(
  colunasBrutas: string[]
): Analise<LinhaCargo> {
  const [cargo, nivel, minBruto, maxBruto] = completarColunas(
    colunasBrutas.map((c) => c.trim()),
    COLUNAS_CARGOS.length
  );

  if (cargo.length < 2) {
    return { ok: false, motivo: "Coluna 1 (cargo) é obrigatória" };
  }
  if (cargo.length > LIMITES.cargo) {
    return {
      ok: false,
      motivo: `Nome do cargo acima de ${LIMITES.cargo} caracteres`,
    };
  }

  const temMin = minBruto !== "";
  const temMax = maxBruto !== "";
  if (temMin !== temMax) {
    return {
      ok: false,
      motivo: "Informe a faixa salarial completa (mínimo E máximo) ou nenhum",
    };
  }

  let faixaMin: number | null = null;
  let faixaMax: number | null = null;
  if (temMin) {
    faixaMin = reaisParaCentavos(minBruto);
    if (faixaMin === null) {
      return {
        ok: false,
        motivo: `Faixa mínima "${minBruto}" não é um valor em reais (use 3.500,00)`,
      };
    }
    faixaMax = reaisParaCentavos(maxBruto);
    if (faixaMax === null) {
      return {
        ok: false,
        motivo: `Faixa máxima "${maxBruto}" não é um valor em reais (use 3.500,00)`,
      };
    }
    if (faixaMax < faixaMin) {
      return { ok: false, motivo: "Faixa máxima menor que a mínima" };
    }
  }

  return {
    ok: true,
    dados: {
      nome: cargo,
      nivel: nivel === "" ? null : nivel,
      faixa_min_centavos: faixaMin,
      faixa_max_centavos: faixaMax,
    },
  };
}
