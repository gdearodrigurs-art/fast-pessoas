import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  agruparMarcacoesPorDia,
  apurarPonto,
  JornadaMotor,
  MarcacaoBruta,
} from "../src/dominios/ponto/calculo";
import {
  esquemaEntradaCasoTestePonto,
  esquemaSaidaCasoTestePonto,
  horaParaMinutos,
} from "../src/dominios/ponto/esquemas";
import { calcularFolha, RubricaMotor } from "../src/dominios/folha/calculo";
import {
  esquemaEntradaCasoTeste,
  esquemaSaidaCasoTeste,
} from "../src/dominios/folha/esquemas";

// A TRAVA entre as DUAS baterias — a suíte em arquivo (esta) e a bateria no banco, que é
// a ferramenta do DP: ele acrescenta um caso pela tela quando quer conferir uma regra.
//
// Sem esta trava, o caso acrescentado pela tela fica FORA do portão — e é justamente o
// caso mais novo, o que ninguém ainda provou. Aqui os casos do banco entram no `npm test`
// EXPORTADOS: db/exportar-baterias.js grava tests/casos-do-banco.json, e o `--conferir`
// dele é o passo 4 do fechamento da onda, que recusa se os dois conjuntos se afastarem.
//
// Por que este arquivo REESCREVE o comparador que executarSuitePonto()/executarSuite()
// já têm: os dois vivem em servico.ts, que importa o repositório e abre banco. O portão
// rápido não abre banco. O motor exercitado é O MESMO — apurarPonto e calcularFolha, as
// funções que a apuração e a folha de verdade chamam; o que se repete é só a comparação
// campo a campo. Consolidar isso num módulo puro importado pelos dois é tarefa separada.

// ------------------------------------------------------------------ o arquivo exportado

interface CasoExportado {
  nome: string;
  descricao: string;
  entrada: unknown;
  saida_esperada: unknown;
}

interface Vigentes {
  rubricas: RubricaMotor[];
  tabela_inss: Parameters<typeof calcularFolha>[0]["tabela_inss"];
  tabela_irrf: Parameters<typeof calcularFolha>[0]["tabela_irrf"];
  parametros: Parameters<typeof calcularFolha>[0]["parametros"];
}

interface ArquivoDeCasos {
  versao: number;
  banco: string;
  data_referencia: string;
  ponto: { casos: CasoExportado[] };
  folha: { casos: CasoExportado[]; vigentes: Vigentes };
}

const VERSAO_ESPERADA = 1;
const COMANDO =
  "node --env-file=.env.local-db db/exportar-baterias.js --banco fast_pessoas_dev";

// Dois lugares porque o `npm test` compila para .tmp-testes/ e o arquivo fica no fonte:
// daqui o JSON está ao lado (rodando o .ts) ou dois níveis acima, em tests/.
const CANDIDATOS = [
  path.resolve(__dirname, "casos-do-banco.json"),
  path.resolve(__dirname, "..", "..", "tests", "casos-do-banco.json"),
];

function carregar(): { dados: ArquivoDeCasos | null; erro: string | null } {
  for (const caminho of CANDIDATOS) {
    let bruto: string;
    try {
      bruto = readFileSync(caminho, "utf8");
    } catch {
      continue;
    }
    const dados = JSON.parse(bruto) as ArquivoDeCasos;
    if (dados.versao !== VERSAO_ESPERADA) {
      return {
        dados: null,
        erro:
          `tests/casos-do-banco.json está na versão ${dados.versao} e esta suíte lê a ` +
          `${VERSAO_ESPERADA}. Regere com:\n  ${COMANDO}`,
      };
    }
    return { dados, erro: null };
  }
  return {
    dados: null,
    // Suíte que passa por ausência de dado é a pior espécie de portão: ela fica verde
    // exatamente quando não está provando nada. Some o arquivo, some a bateria do banco
    // do portão — e ninguém percebe, porque nenhum teste falha.
    erro:
      "tests/casos-do-banco.json não existe — a bateria do banco está FORA do portão.\n" +
      `Gere com:\n  ${COMANDO}\n` +
      "O arquivo é versionado: ele é a cópia dos casos que o DP mantém pela tela.",
  };
}

/**
 * Nome do teste: o `nome` do caso mais a primeira frase da descrição, que é onde está o
 * comportamento ("hora noturna de 3150 s (52min30s)"). A descrição inteira é a conta
 * feita à mão, com várias linhas — ela vale no relatório, não no nome do teste.
 */
function tituloDe(caso: CasoExportado): string {
  const primeira = caso.descricao.split(/\.\s/)[0].replace(/\s+/g, " ").trim();
  const curta = primeira.length > 110 ? `${primeira.slice(0, 110)}…` : primeira;
  return `${caso.nome} — ${curta}`;
}

const { dados, erro } = carregar();

if (!dados) {
  test("a bateria do banco chega ao portão exportada", () => {
    assert.fail(erro ?? "sem casos e sem motivo — isto é defeito desta suíte");
  });
} else {
  registrarContagem(dados);
  for (const caso of dados.ponto.casos) {
    test(`ponto · ${tituloDe(caso)}`, () => conferirPonto(caso));
  }
  for (const caso of dados.folha.casos) {
    test(`folha · ${tituloDe(caso)}`, () => conferirFolha(caso, dados.folha.vigentes));
  }
}

// ------------------------------------------------------------------ contagem

/**
 * Arquivo presente e VAZIO passaria em silêncio pelo mesmo buraco do arquivo ausente.
 * As duas baterias nasceram com casos (0013 e 0042) e nenhuma delas encolhe sozinha.
 */
function registrarContagem(arquivo: ArquivoDeCasos): void {
  test("as duas baterias do banco chegaram com casos", () => {
    assert.ok(
      arquivo.ponto.casos.length > 0,
      `Nenhum caso de ponto em tests/casos-do-banco.json (banco ${arquivo.banco}). ` +
        `A bateria do ponto existe desde a migration 0042. Regere com:\n  ${COMANDO}`
    );
    assert.ok(
      arquivo.folha.casos.length > 0,
      `Nenhum caso de folha em tests/casos-do-banco.json (banco ${arquivo.banco}). ` +
        `A bateria da folha existe desde a migration 0013. Regere com:\n  ${COMANDO}`
    );
    assert.ok(
      arquivo.folha.vigentes.rubricas.length > 0,
      "Sem rubricas vigentes no arquivo: os casos de folha não teriam contra o que rodar."
    );
  });
}

// ------------------------------------------------------------------ ponto

function diaDaSemana(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/**
 * O caminho é o da apuração de verdade: agruparMarcacoesPorDia() e depois apurarPonto(),
 * as duas mesmas funções, na mesma ordem, que apurarCompetencia() usa. As marcações
 * trazem a DATA REAL de cada batida, então o arraste da virada é exercitado — a saída do
 * plantão que cai no dia seguinte é o que ela é.
 */
function conferirPonto(caso: CasoExportado): void {
  const entrada = esquemaEntradaCasoTestePonto.parse(caso.entrada);
  const esperado = esquemaSaidaCasoTestePonto.parse(caso.saida_esperada);

  // A jornada vem declarada POR INTEIRO no caso — não há linha de catálogo a referenciar
  // (ver o cabeçalho da 0042), e é isso que permite os GÊMEOS que diferem em UM parâmetro.
  const jornada: JornadaMotor = { id: 0, ...entrada.jornada };
  const marcacoes: MarcacaoBruta[] = entrada.marcacoes.map((marcacao, indice) => ({
    id: indice + 1,
    tipo: marcacao.tipo,
    data_local: marcacao.data,
    minuto_local: horaParaMinutos(marcacao.hora) ?? 0,
  }));
  const porDia = agruparMarcacoesPorDia(marcacoes, jornada);

  const resultado = apurarPonto({
    ano: entrada.ano,
    mes: entrada.mes,
    jornada,
    regra: {
      id: null,
      fator_he_50: entrada.regra.fator_he_50,
      fator_he_100: entrada.regra.fator_he_100,
    },
    dias: entrada.dias.map((dia) => ({
      data: dia.data,
      dia_semana: diaDaSemana(dia.data),
      feriado: dia.feriado ?? null,
      dia_de_escala: dia.dia_de_escala ?? null,
      marcacoes: porDia.get(dia.data) ?? [],
    })),
  });

  assert.deepEqual(
    {
      trabalhado: resultado.minutos_trabalhados,
      previsto: resultado.minutos_previstos,
      he_50: resultado.he_50_minutos,
      he_100: resultado.he_100_minutos,
      noturno_ficto: resultado.adicional_noturno_minutos,
      noturno_relogio: resultado.adicional_noturno_relogio_minutos,
      faltas: resultado.faltas_minutos,
      atrasos: resultado.atrasos_minutos,
      dsr_desconto: resultado.dsr_desconto_minutos,
      banco: resultado.saldo_banco_minutos,
    },
    esperado.totais,
    `${caso.nome}: os totais da competência, em minutos inteiros`
  );

  const porData = new Map(resultado.dias.map((dia) => [dia.data, dia]));
  for (const [data, esperadoDoDia] of Object.entries(esperado.dias ?? {})) {
    const dia = porData.get(data);
    assert.ok(dia, `${caso.nome}: o caso declara o dia ${data} e a apuração não o trouxe`);

    // Só o que o caso DECLARA é comparado — o dia tem dez campos e cada caso fala de um
    // assunto. Montar o obtido com as mesmas chaves faz o diff do node dizer qual campo
    // andou, em vez de despejar o dia inteiro.
    const todos: Record<string, number | boolean | string[]> = {
      previsto: dia.previsto_minutos,
      trabalhado: dia.trabalhado_minutos,
      intervalo: dia.intervalo_minutos,
      he_50: dia.he_50_minutos,
      he_100: dia.he_100_minutos,
      noturno_ficto: dia.adicional_noturno_minutos,
      noturno_relogio: dia.adicional_noturno_relogio_minutos,
      atraso: dia.atraso_minutos,
      falta: dia.falta_minutos,
      banco: dia.banco_minutos,
      // "Dia PENDENTE de tratamento" não é coluna do resultado: é a consequência do
      // pareamento incompleto, e o motor a publica na memória do dia. É o mesmo campo
      // que a tela do espelho lê.
      pendente: dia.memoria.pendente_de_tratamento === true,
      // Conjunto ORDENADO: a ordem em que o motor empilha os achados do dia é detalhe de
      // implementação; o que o caso afirma é QUAIS achados existem.
      intercorrencias: dia.intercorrencias.map((item) => item.tipo).sort(),
    };
    const declarados = Object.keys(esperadoDoDia);
    const obtido: Record<string, number | boolean | string[]> = {};
    for (const campo of declarados) obtido[campo] = todos[campo];
    const referencia = { ...esperadoDoDia } as Record<string, unknown>;
    if (Array.isArray(referencia.intercorrencias)) {
      referencia.intercorrencias = [...referencia.intercorrencias].sort();
    }

    assert.deepEqual(obtido, referencia, `${caso.nome}: o dia ${data}`);
  }
}

// ------------------------------------------------------------------ folha

/**
 * Dinheiro comparado em CENTAVO INTEIRO, sempre — o caso guarda reais porque é assim que
 * o DP confere na mão, e a conversão acontece na borda, uma vez. Comparar em real faria a
 * bateria de dinheiro depender de igualdade entre floats, que é a coisa que a convenção
 * do projeto existe para não fazer.
 */
function conferirFolha(caso: CasoExportado, vigentes: Vigentes): void {
  const entrada = esquemaEntradaCasoTeste.parse(caso.entrada);
  const esperado = esquemaSaidaCasoTeste.parse(caso.saida_esperada);

  const resultado = calcularFolha({
    salario_base_centavos: Math.round(entrada.salario * 100),
    dependentes_irrf: entrada.dependentes,
    // Caso sem carga declarada = caso sem jornada: cai no divisor de referência dos
    // parâmetros, que é o que todos os casos anteriores à 0038 querem dizer.
    carga_semanal_minutos: entrada.carga_semanal_minutos ?? null,
    variaveis: entrada.variaveis.map((variavel) => ({
      codigo: variavel.rubrica,
      referencia: variavel.referencia ?? null,
      valor_centavos: variavel.valor === undefined ? null : Math.round(variavel.valor * 100),
      origem: "manual" as const,
    })),
    rubricas: vigentes.rubricas,
    tabela_inss: vigentes.tabela_inss,
    tabela_irrf: vigentes.tabela_irrf,
    parametros: vigentes.parametros,
  });

  // União dos dois lados: item que o motor produziu e o caso não declara é diferença
  // igualmente. Foi assim que o divisor 220 apareceu — o valor esperado não sumiu, ele
  // mudou de tamanho.
  const obtido: Record<string, number> = {};
  for (const item of resultado.itens) obtido[item.codigo] = item.valor_centavos;
  const referencia: Record<string, number> = {};
  for (const [codigo, valor] of Object.entries(esperado.itens)) {
    referencia[codigo] = Math.round(valor * 100);
  }

  assert.deepEqual(obtido, referencia, `${caso.nome}: os itens do holerite, em centavos`);
  assert.equal(
    resultado.liquido_centavos,
    Math.round(esperado.liquido * 100),
    `${caso.nome}: o líquido, em centavos`
  );
}
