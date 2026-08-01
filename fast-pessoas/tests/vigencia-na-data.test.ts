import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

// ===========================================================================
// A rede de regressão do eixo VIGÊNCIA nos dois insumos do motor da folha.
//
// A pergunta que estas quatro consultas erravam é sempre a mesma: elas
// perguntavam "esta pessoa/adesão está ATIVA HOJE?" onde a pergunta é "tinha
// vínculo vivo NA DATA da competência?". Bandeira de hoje decidindo o passado é
// o formato do defeito, e ele reaparece toda vez que alguém acrescenta um
// `AND c.status = 'ativo'` "para não trazer desligado".
//
// POR QUE ESTA SUÍTE LÊ O FONTE, E NÃO EXECUTA A FUNÇÃO: as quatro vivem em
// repositório — o SQL É a regra, e o portão rápido não abre banco (ver o
// cabeçalho de tests/folha.test.ts). O número que prova o conserto foi medido
// com SQL de verdade numa bancada e está no relatório da frente; o que mora
// aqui é a trava que impede a bandeira de hoje de voltar sem ninguém ver.
//
// O que a volta custou, medido na bancada `fast_pessoas_j_vigencia` sobre a
// competência 07/2026 com uma desligada em 20/07 e outra em 01/08:
//   • importação do ponto:  60 → 62 pessoas, 57.600 → 72.000 min de adicional
//     noturno (240 h) e 29.219 → 31.019 min de HE 50% que sumiam do holerite;
//   • alvos da apuração:    60 → 62 pessoas (quem sai no meio do mês não
//     gerava apuração NENHUMA — sem HE, sem noturno, sem DSR);
//   • descontos de adesão:  274 → 277 linhas, R$ 20.804,70 → R$ 21.008,70.
// ===========================================================================

// Dois lugares porque o `npm test` compila para .tmp-testes/ e o fonte fica em
// src/: daqui ele está dois níveis acima (compilado) ou um (rodando o .ts).
const RAIZES = [
  path.resolve(__dirname, "..", "..", "src"),
  path.resolve(__dirname, "..", "src"),
];

function lerFonte(relativo: string): string {
  for (const raiz of RAIZES) {
    try {
      return readFileSync(path.join(raiz, relativo), "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(`fonte não encontrado em nenhuma raiz: ${relativo}`);
}

/**
 * O corpo de uma função exportada: do `export ... function <nome>` até o
 * próximo `export ` da coluna zero. Grosseiro de propósito — o que importa é
 * não deixar a asserção vazar para a função vizinha e passar por acidente.
 */
function corpoDaFuncao(fonte: string, nome: string): string {
  const inicio = fonte.search(
    new RegExp(`^export (?:async )?function ${nome}\\b`, "m")
  );
  assert.notEqual(inicio, -1, `função ${nome} não encontrada no fonte`);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.search(/^export /m);
  return fim === -1 ? resto : resto.slice(0, fim);
}

const FOLHA_REPO = lerFonte(path.join("dominios", "folha", "repositorio.ts"));
const FOLHA_SERVICO = lerFonte(path.join("dominios", "folha", "servico.ts"));
const PONTO_REPO = lerFonte(path.join("dominios", "ponto", "repositorio.ts"));

// ------------------------------------------------------------------ 1

// Reimportar uma competência antiga depois de um desligamento apagava as horas
// extras e o adicional noturno do mês final de quem saiu: 240 h de adicional
// noturno e 30 h de HE 50% em duas pessoas, na medição da bancada.
test("a importação do ponto não recorta a apuração por bandeira de status de hoje", () => {
  const corpo = corpoDaFuncao(FOLHA_REPO, "listarApuracaoDePontoDaCompetencia");
  assert.ok(
    !/c\.status\s*=/.test(corpo),
    "listarApuracaoDePontoDaCompetencia voltou a exigir status de HOJE — a " +
      "linha de rh.apuracao_ponto em (ano, mes) já prova que a pessoa " +
      "trabalhou a competência"
  );
});

// ------------------------------------------------------------------ 2

// Quem é desligado no dia 20 não gerava apuração nenhuma: o mês final não
// virava HE, nem adicional noturno, nem DSR.
test("os alvos da apuração saem do vínculo vivo na janela, não da bandeira de hoje", () => {
  const corpo = corpoDaFuncao(PONTO_REPO, "listarColaboradoresComEscala");
  assert.ok(
    !/c\.status\s*(<>|=)/.test(corpo),
    "listarColaboradoresComEscala voltou a decidir a apuração de um mês " +
      "passado pela bandeira de status de HOJE"
  );
  assert.ok(
    /c\.data_desligamento/.test(corpo) && /c\.data_admissao/.test(corpo),
    "listarColaboradoresComEscala tem que resolver o vínculo por DATA " +
      "(data_admissao / data_desligamento)"
  );
});

// ------------------------------------------------------------------ 3

// Era a ÚNICA consulta do arquivo que não recebia data, num arquivo cujo
// cabeçalho declara que tudo se resolve na data da competência.
test("os descontos de adesão são lidos na data da competência, não em 'hoje'", () => {
  const corpo = corpoDaFuncao(FOLHA_REPO, "listarDescontosDeAdesao");
  assert.ok(
    /dataRef\s*:\s*string/.test(corpo),
    "listarDescontosDeAdesao precisa receber a data de referência da competência"
  );
  assert.ok(
    !/a\.fim IS NULL AND/.test(corpo),
    "listarDescontosDeAdesao voltou a ler a adesão por `fim IS NULL` — quem " +
      "cancelou o benefício depois da competência perde o desconto que era devido"
  );
  assert.ok(
    /a\.inicio <= \$1/.test(corpo) && /a\.fim >= \$1/.test(corpo),
    "a janela da adesão tem que ser `inicio <= $1 AND (fim IS NULL OR fim >= $1)`"
  );
  assert.ok(
    !/c\.status\s*=\s*'ativo'/.test(corpo),
    "listarDescontosDeAdesao voltou a exigir vínculo ativo HOJE"
  );
});

// ------------------------------------------------------------------ 4

// O par do caso 3: o call-site TEM a data (duas linhas acima ela vai para
// listarRubricasVigentes) e não a passava. Um sem o outro não resolve.
test("o import de descontos de benefício passa a data da competência ao repositório", () => {
  const corpo = corpoDaFuncao(FOLHA_SERVICO, "importarDescontosBeneficios");
  const chamada = corpo.match(/listarDescontosDeAdesao\(([^)]*)\)/s);
  assert.ok(chamada, "importarDescontosBeneficios não chama listarDescontosDeAdesao");
  assert.ok(
    /dataReferenciaCompetencia/.test(chamada[1]),
    "a chamada de listarDescontosDeAdesao voltou a omitir a data da " +
      `competência — argumentos hoje: (${chamada[1].trim()})`
  );
});
