// OLAC — a parte PURA da troca de arquivo com a contabilidade: gerar e analisar
// o layout, e casar a linha com o cadastro. Sem IO e sem banco — é o alcance da
// suíte (tests/folha-olac.test.ts), no molde de estrutura/importacao-analise.
//
// LAYOUT NOSSO, decisão E4 do docs/20 (registrada também no cabeçalho das rotas
// e em docs/anexos/layout-olac.md — os três têm que dizer a mesma coisa):
//
//   • CSV em UTF-8, separador ';', UMA linha de cabeçalho fixa, quebra '\n'.
//   • O MESMO layout vale na ida (exportação) e na volta (importação): a OLAC
//     devolve o arquivo com as mesmas colunas, e o que importa na volta são as
//     CHAVES — competencia, empresa_cnpj, matricula, rubrica — e o valor.
//     As colunas de nome são informativas (facilitam o conferente humano) e a
//     análise não as valida.
//
//   Colunas (9), uma linha por colaborador × rubrica:
//     1. competencia    MM/AAAA
//     2. empresa_cnpj   14 dígitos sem máscara; vazio = linha sem apropriação
//     3. matricula      a CHAVE do colaborador (texto, como está no cadastro)
//     4. colaborador    nome (informativo)
//     5. rubrica        código de 4 dígitos do NOSSO catálogo (a chave da verba)
//     6. rubrica_nome   nome (informativo)
//     7. natureza       provento | desconto | informativa (informativo)
//     8. conta_contabil do de-para vigente (E3:a); vazio = sem de-para
//     9. valor          reais, vírgula decimal, SEMPRE 2 casas, sem milhar
//                       ("3500,00"); sempre positivo — o sinal é da natureza
//
// REGRA DE OURO herdada dos importadores da casa: validação LINHA A LINHA —
// linha ruim vira rejeição com motivo no relatório do lote e o resto entra.

import { reaisParaCentavos } from "../estrutura/importacao-analise";
import { formatarCompetencia } from "./esquemas";

export const SEPARADOR_OLAC = ";";

export const COLUNAS_OLAC = [
  "competencia",
  "empresa_cnpj",
  "matricula",
  "colaborador",
  "rubrica",
  "rubrica_nome",
  "natureza",
  "conta_contabil",
  "valor",
] as const;

export const CABECALHO_OLAC = COLUNAS_OLAC.join(SEPARADOR_OLAC);

/** A linha do arquivo, já em tipos do sistema (centavos inteiros — eixo 5). */
export interface LinhaOlac {
  competencia_ano: number;
  competencia_mes: number;
  empresa_cnpj: string | null;
  matricula: string;
  colaborador_nome: string;
  codigo_rubrica: string;
  rubrica_nome: string;
  natureza: string;
  conta_contabil: string | null;
  valor_centavos: number;
}

export type AnaliseOlac =
  | { ok: true; dados: LinhaOlac }
  | { ok: false; motivo: string };

// ------------------------------------------------------------------ geração (a ida)

/**
 * Centavos inteiros → "3500,00": SEMPRE duas casas e vírgula, sem milhar. É o
 * formato CANÔNICO do layout — é ele que garante a ida-e-volta byte-idêntica
 * (gerar → analisar → gerar devolve o mesmo texto).
 */
export function centavosParaValorOlac(centavos: number): string {
  if (!Number.isInteger(centavos) || centavos < 0) {
    throw new Error(
      `Valor OLAC exige centavos inteiros ≥ 0 (o sinal é da natureza); recebi ${centavos}`
    );
  }
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  return `${reais},${String(resto).padStart(2, "0")}`;
}

/**
 * Campo de texto do CSV: o separador e a quebra de linha viram espaço — nome
 * com ';' não pode deslocar as colunas de quem lê. Só os campos INFORMATIVOS
 * passam por aqui; as chaves (matrícula, rubrica, conta) são validadas.
 */
function campoTexto(texto: string): string {
  return texto.replace(/[;\r\n]/g, " ").trim();
}

export function gerarLinhaOlac(linha: LinhaOlac): string {
  return [
    formatarCompetencia(linha.competencia_ano, linha.competencia_mes),
    linha.empresa_cnpj ?? "",
    campoTexto(linha.matricula),
    campoTexto(linha.colaborador_nome),
    linha.codigo_rubrica,
    campoTexto(linha.rubrica_nome),
    linha.natureza,
    linha.conta_contabil === null ? "" : campoTexto(linha.conta_contabil),
    centavosParaValorOlac(linha.valor_centavos),
  ].join(SEPARADOR_OLAC);
}

/** O arquivo inteiro: cabeçalho + linhas + quebra final. */
export function gerarArquivoOlac(linhas: LinhaOlac[]): string {
  return [CABECALHO_OLAC, ...linhas.map(gerarLinhaOlac)].join("\n") + "\n";
}

/** Nome canônico do arquivo: olac-folha-AAAA-MM.csv. */
export function nomeArquivoOlac(ano: number, mes: number): string {
  return `olac-folha-${ano}-${String(mes).padStart(2, "0")}.csv`;
}

// ------------------------------------------------------------------ análise (a volta)

/** Preenche colunas ausentes no fim (planilha corta ';' vazios finais). */
function completarColunas(colunas: string[], total: number): string[] {
  const completas = colunas.slice(0, total).map((coluna) => coluna.trim());
  while (completas.length < total) completas.push("");
  return completas;
}

/** A primeira linha é o cabeçalho quando repete o nome da 1ª coluna. */
export function ehCabecalhoOlac(linha: string): boolean {
  return linha
    .toLowerCase()
    .startsWith(COLUNAS_OLAC[0]);
}

function analisarCompetencia(
  bruto: string
): { ok: true; ano: number; mes: number } | { ok: false } {
  const partes = /^(\d{2})\/(\d{4})$/.exec(bruto);
  if (!partes) return { ok: false };
  const mes = Number(partes[1]);
  const ano = Number(partes[2]);
  if (mes < 1 || mes > 12 || ano < 2020 || ano > 2100) return { ok: false };
  return { ok: true, ano, mes };
}

export function analisarLinhaOlac(colunasBrutas: string[]): AnaliseOlac {
  const [
    competenciaBruta,
    cnpjBruto,
    matricula,
    colaboradorNome,
    rubrica,
    rubricaNome,
    natureza,
    contaContabil,
    valorBruto,
  ] = completarColunas(colunasBrutas, COLUNAS_OLAC.length);

  const competencia = analisarCompetencia(competenciaBruta);
  if (!competencia.ok) {
    return {
      ok: false,
      motivo: `Competência "${competenciaBruta}" não está no formato MM/AAAA`,
    };
  }

  let cnpj: string | null = null;
  if (cnpjBruto !== "") {
    const digitos = cnpjBruto.replace(/\D/g, "");
    if (!/^\d{14}$/.test(digitos)) {
      return { ok: false, motivo: `CNPJ "${cnpjBruto}" não tem 14 dígitos` };
    }
    cnpj = digitos;
  }

  if (matricula === "") {
    return { ok: false, motivo: "Coluna 3 (matricula) é obrigatória" };
  }

  if (!/^\d{4}$/.test(rubrica)) {
    return {
      ok: false,
      motivo: `Rubrica "${rubrica}" não é um código de 4 dígitos do catálogo`,
    };
  }

  const valorCentavos = valorBruto === "" ? null : reaisParaCentavos(valorBruto);
  if (valorCentavos === null) {
    return {
      ok: false,
      motivo: `Valor "${valorBruto}" ilegível — use reais com vírgula (ex.: 3500,00)`,
    };
  }

  return {
    ok: true,
    dados: {
      competencia_ano: competencia.ano,
      competencia_mes: competencia.mes,
      empresa_cnpj: cnpj,
      matricula,
      colaborador_nome: colaboradorNome,
      codigo_rubrica: rubrica,
      rubrica_nome: rubricaNome,
      natureza,
      conta_contabil: contaContabil === "" ? null : contaContabil,
      valor_centavos: valorCentavos,
    },
  };
}

// ------------------------------------------------------------------ casamento

export const SITUACOES_ESPELHO = [
  "casada",
  "sem_rubrica",
  "sem_colaborador",
] as const;

export type SituacaoEspelho = (typeof SITUACOES_ESPELHO)[number];

export const ROTULOS_SITUACAO_ESPELHO: Record<SituacaoEspelho, string> = {
  casada: "Casada",
  sem_rubrica: "Rubrica não encontrada",
  sem_colaborador: "Matrícula não encontrada",
};

export interface CasamentoOlac {
  situacao: SituacaoEspelho;
  colaborador_id: number | null;
  codigo_rubrica_interno: string | null;
}

/**
 * Casa a linha analisada com o cadastro: matrícula → colaborador e código →
 * rubrica do catálogo. A PESSOA vem primeiro: matrícula desconhecida é
 * 'sem_colaborador' mesmo que a rubrica também não exista (o relatório do lote
 * conta as duas ausências; a situação aponta o primeiro conserto).
 */
export function casarLinhaOlac(
  linha: LinhaOlac,
  cadastro: {
    colaboradorPorMatricula: Map<string, number>;
    rubricasPorCodigo: Set<string>;
  }
): CasamentoOlac {
  const colaboradorId =
    cadastro.colaboradorPorMatricula.get(linha.matricula) ?? null;
  const rubricaConhecida = cadastro.rubricasPorCodigo.has(linha.codigo_rubrica);
  if (colaboradorId === null) {
    return {
      situacao: "sem_colaborador",
      colaborador_id: null,
      codigo_rubrica_interno: rubricaConhecida ? linha.codigo_rubrica : null,
    };
  }
  if (!rubricaConhecida) {
    return {
      situacao: "sem_rubrica",
      colaborador_id: colaboradorId,
      codigo_rubrica_interno: null,
    };
  }
  return {
    situacao: "casada",
    colaborador_id: colaboradorId,
    codigo_rubrica_interno: linha.codigo_rubrica,
  };
}
