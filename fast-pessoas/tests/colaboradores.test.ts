import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esquemaAtualizacaoColaborador,
  esquemaDeclaracaoRacaCor,
  esquemaNovaFaixaSalarial,
  hojeNaOperacao,
} from "../src/dominios/colaboradores/esquemas";
import type { Posicao } from "../src/dominios/colaboradores/repositorio";
import {
  chaveQueAbriuAPosicao,
  chaveQueAmpliouAFicha,
  obterPosicoes,
  obterRacaCorColaborador,
  type DepsPosicoes,
  type DepsRacaCor,
} from "../src/dominios/colaboradores/servico";
import type { PayloadSessao } from "../src/dominios/identidade/esquemas";
import { ErroHttp } from "../src/lib/sessao";

// ===========================================================================
// Domínio colaboradores — os dois eixos que a ficha e a tabela salarial tocam:
// VIGÊNCIA (a faixa que vale hoje) e RASTRO DE LEITURA (quem leu CPF de quem,
// e com qual chave).
//
// Cada `test` daqui reproduz defeito confirmado no mapa de eixos
// (docs/14-mapa-de-eixos.md, eixos 8 e 10). Apagar um caso é reabrir o buraco.
// ===========================================================================

// ---------------------------------------------------------------- vigência
// DEFEITO (mapa, eixo 10, servico.ts:1845): criarFaixaSalarial aceitava início
// no futuro, e a faixa salarial é o GATE da promoção — `faixaVigenteDoCargo`
// lê por `status = 'ativa'`, sem data. Medido em 01/08/2026 na bancada
// fast_pessoas_i_rastro: cadastrar a faixa de 2027-01-01 no cargo 3 encerrou a
// faixa de 2026 (4.500–6.500) em 2026-12-31 e pôs a de 2027 (9.000–18.000)
// como 'ativa' NO MESMO SEGUNDO. Uma promoção de 2026 para R$ 7.000 passava a
// cair "fora da faixa" e a exigir justificativa de exceção que não existe.
// O vizinho `criarVersaoEstabelecimento`, doze linhas abaixo, já chamava a
// guarda `exigirVigenciaNaoFutura` — por isso o defeito era visível.

test("faixa salarial com início de vigência no futuro é recusada na borda", () => {
  const analise = esquemaNovaFaixaSalarial.safeParse({
    faixa_min: 9000,
    faixa_max: 18000,
    inicio_vigencia: "2027-01-01",
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) =>
      issue.path.includes("inicio_vigencia")
    ),
    true,
    "o erro tem que apontar o campo inicio_vigencia, senão a tela não sabe onde pintar"
  );
});

test("faixa salarial com início de vigência hoje é aceita", () => {
  const analise = esquemaNovaFaixaSalarial.safeParse({
    faixa_min: 4500,
    faixa_max: 6500,
    inicio_vigencia: hojeNaOperacao(),
  });
  assert.equal(analise.success, true);
});

test("faixa salarial retroativa continua aceita — o freio é só para o futuro", () => {
  // Reajuste de convenção assinado em março e lançado em agosto é o caso comum:
  // a guarda de vigência futura não pode cobrar o passado junto.
  const analise = esquemaNovaFaixaSalarial.safeParse({
    faixa_min: 4500,
    faixa_max: 6500,
    inicio_vigencia: "2026-03-01",
  });
  assert.equal(analise.success, true);
});

// ------------------------------------------------------- rastro de leitura
// DEFEITO (mapa, eixo 8, servico.ts:294): `obterColaborador` entregava CPF,
// nascimento, e-mail e os vínculos da pessoa em todas as empresas do grupo, e
// NENHUM ramo gravava trilha. Medido em 01/08/2026 na bancada
// fast_pessoas_i_rastro: a persona `dp` leu a ficha 12 (CPF 42225752320,
// nascimento 1996-01-04) e `audit.leitura_sensivel` continuou em ZERO linhas.
//
// A segunda metade do eixo é a que estes casos guardam: a chave gravada tem de
// ser a que DE FATO autorizou. Carimbar `rh.colaborador.ver.todos` na leitura
// de um gestor que só alcança a própria equipe é trilha que mente sobre o
// alcance de quem leu — e trilha que mente é pior que trilha que falta, porque
// passa despercebida na auditoria.

test("ficha de terceiro lida com alcance amplo grava a chave rh.colaborador.ver.todos", () => {
  assert.equal(
    chaveQueAmpliouAFicha({ alcance: "todos" }, false),
    "rh.colaborador.ver.todos"
  );
});

test("ficha de liderado grava rh.colaborador.ver — a chave que autorizou, não a mais ampla", () => {
  assert.equal(
    chaveQueAmpliouAFicha(
      { alcance: "equipe", colaboradorId: 2, equipeIds: [7] },
      false
    ),
    "rh.colaborador.ver"
  );
});

test("a própria ficha não deixa trilha — não é leitura de dado de terceiro", () => {
  // Vale nos dois alcances amplos: quem tem rh.colaborador.ver.todos também
  // abre a própria ficha, e essa leitura não é sobre ninguém mais.
  assert.equal(chaveQueAmpliouAFicha({ alcance: "todos" }, true), null);
  assert.equal(
    chaveQueAmpliouAFicha(
      { alcance: "equipe", colaboradorId: 2, equipeIds: [7] },
      true
    ),
    null
  );
});

test("quem só alcança a si mesmo nunca gera trilha", () => {
  assert.equal(
    chaveQueAmpliouAFicha({ alcance: "proprio", colaboradorId: 10 }, false),
    null
  );
});

// ------------------------------------------------------- raça-cor (A5:b) e contato corporativo (A7:b)
// A autodeclaração aceita exatamente o padrão IBGE + a recusa explícita —
// valor fora disso é recusado na borda, antes do CHECK do banco (0085).

test("autodeclaração de raça-cor aceita os valores IBGE e a recusa explícita", () => {
  for (const valor of [
    "branca",
    "preta",
    "parda",
    "amarela",
    "indigena",
    "prefiro_nao_declarar",
  ]) {
    assert.equal(
      esquemaDeclaracaoRacaCor.safeParse({ raca_cor: valor }).success,
      true,
      `deveria aceitar "${valor}"`
    );
  }
});

test("autodeclaração de raça-cor recusa valor fora do padrão IBGE", () => {
  assert.equal(
    esquemaDeclaracaoRacaCor.safeParse({ raca_cor: "outra" }).success,
    false
  );
  assert.equal(esquemaDeclaracaoRacaCor.safeParse({}).success, false);
});

test("edição da ficha aceita limpar o contato corporativo com null (A7:b)", () => {
  const analise = esquemaAtualizacaoColaborador.safeParse({
    telefone_corporativo: null,
    email_corporativo: null,
  });
  assert.equal(analise.success, true);
});

test("e-mail corporativo inválido é recusado na borda", () => {
  const analise = esquemaAtualizacaoColaborador.safeParse({
    email_corporativo: "nao-e-email",
  });
  assert.equal(analise.success, false);
});

// ------------------------------------------------------- posição (salário, A1:a)
// A trilha do salário segue o mesmo eixo 8 da ficha: grava a chave que DE FATO
// autorizou, nunca por default. O POST da rota chamava obterPosicoes SEM as
// chaves da sessão e o default `new Set(["rh.posicao.ver"])` carimbava a
// global para qualquer um — trilha que mente. O default saiu da assinatura e
// estes casos fixam as três respostas possíveis.

test("chave da posição: a global responde quando presente", () => {
  assert.equal(
    chaveQueAbriuAPosicao(new Set(["rh.posicao.ver"]), false),
    "rh.posicao.ver"
  );
  assert.equal(
    chaveQueAbriuAPosicao(
      new Set(["rh.posicao.ver", "rh.posicao.ver.equipe"]),
      false
    ),
    "rh.posicao.ver"
  );
});

test("chave da posição: quem só tem a de equipe grava a de equipe — nunca a mais ampla", () => {
  assert.equal(
    chaveQueAbriuAPosicao(new Set(["rh.posicao.ver.equipe"]), false),
    "rh.posicao.ver.equipe"
  );
});

test("chave da posição: a PRÓPRIA posição não deixa trilha (não é leitura de terceiro)", () => {
  assert.equal(chaveQueAbriuAPosicao(new Set(["rh.posicao.ver"]), true), null);
  assert.equal(
    chaveQueAbriuAPosicao(new Set(["rh.posicao.ver.equipe"]), true),
    null
  );
});

test("obterPosicoes exige as chaves da sessão na assinatura — sem default enganoso", () => {
  // Function.length conta os parâmetros ANTES do primeiro default: sessao,
  // colaboradorId e chavesConcedidas. Se alguém devolver o default ao terceiro
  // parâmetro, o length cai para 2 e este caso acusa.
  assert.equal(obterPosicoes.length, 3);
});

// Os cenários do serviço rodam com o repositório trocado por dublês (molde
// DepsPosse, pendência 16.2) — nada toca banco.

const SESSAO_GESTORA: PayloadSessao = {
  usuario_id: 77,
  papel: "gestor",
  nome: "Gina Gestora",
};

const POSICAO_EXEMPLO: Posicao = {
  id: 1,
  cargo_id: 3,
  cargo_nome: "Analista",
  salario: 450000,
  inicio_vigencia: "2026-01-01",
  fim_vigencia: null,
};

interface CenarioPosicoes {
  /** Vínculo atual de quem pergunta (null = conta sem ficha). */
  meuVinculo: number | null;
  /** O alvo é vínculo da MINHA pessoa? (cláusula de pessoa) */
  ehVinculoMeu: boolean;
  /** O alvo existe em rh.colaborador? */
  existe: boolean;
  /** Sub-árvore de quem pergunta (diretos e indiretos). */
  subArvore: number[];
  posicoes: Posicao[];
}

function montarDepsPosicoes(cenario: CenarioPosicoes): {
  deps: DepsPosicoes;
  trilhas: { chave: string; recurso: string; registro: string }[];
} {
  const trilhas: { chave: string; recurso: string; registro: string }[] = [];
  const deps: DepsPosicoes = {
    colaboradorIdDoUsuario: async () => cenario.meuVinculo,
    colaboradorNoEscopo: async (_id, escopo) =>
      escopo.alcance === "proprio" ? cenario.ehVinculoMeu : cenario.existe,
    lideradosDaSubArvore: async () => cenario.subArvore,
    listarPosicoes: async () => cenario.posicoes,
    registrarLeituraSensivel: async (entrada) => {
      trilhas.push({
        chave: entrada.chavePermissao,
        recurso: entrada.recurso,
        registro: entrada.registroId,
      });
    },
  };
  return { deps, trilhas };
}

test("ler a PRÓPRIA posição não grava trilha — mesmo com a chave global", async () => {
  const { deps, trilhas } = montarDepsPosicoes({
    meuVinculo: 10,
    ehVinculoMeu: true,
    existe: true,
    subArvore: [],
    posicoes: [POSICAO_EXEMPLO],
  });
  const { posicoes } = await obterPosicoes(
    SESSAO_GESTORA,
    10,
    new Set(["rh.posicao.ver"]),
    deps
  );
  assert.equal(posicoes.length, 1);
  assert.deepEqual(trilhas, []);
});

test("posição de terceiro grava a chave que DE FATO autorizou (equipe, não a global)", async () => {
  const { deps, trilhas } = montarDepsPosicoes({
    meuVinculo: 10,
    ehVinculoMeu: false,
    existe: true,
    subArvore: [20, 30],
    posicoes: [POSICAO_EXEMPLO],
  });
  await obterPosicoes(
    SESSAO_GESTORA,
    30,
    new Set(["rh.posicao.ver.equipe"]),
    deps
  );
  assert.deepEqual(trilhas, [
    { chave: "rh.posicao.ver.equipe", recurso: "colaborador.salario", registro: "30" },
  ]);
});

test("lista VAZIA de terceiro TAMBÉM grava trilha — vazio também é informação", async () => {
  // Molde disciplinar/servico.ts: "esta pessoa não tem posição" é resposta
  // sobre ela. Antes o return da lista vazia pulava o registrarLeituraSensivel.
  const { deps, trilhas } = montarDepsPosicoes({
    meuVinculo: 10,
    ehVinculoMeu: false,
    existe: true,
    subArvore: [],
    posicoes: [],
  });
  const { posicoes } = await obterPosicoes(
    SESSAO_GESTORA,
    55,
    new Set(["rh.posicao.ver"]),
    deps
  );
  assert.deepEqual(posicoes, []);
  assert.deepEqual(trilhas, [
    { chave: "rh.posicao.ver", recurso: "colaborador.salario", registro: "55" },
  ]);
});

test("só a chave de equipe: alvo fora da sub-árvore é 404 e não deixa trilha", async () => {
  const { deps, trilhas } = montarDepsPosicoes({
    meuVinculo: 10,
    ehVinculoMeu: false,
    existe: true,
    subArvore: [20],
    posicoes: [POSICAO_EXEMPLO],
  });
  await assert.rejects(
    obterPosicoes(SESSAO_GESTORA, 99, new Set(["rh.posicao.ver.equipe"]), deps),
    (erro: unknown) => erro instanceof ErroHttp && erro.status === 404
  );
  assert.deepEqual(trilhas, []);
});

test("id fantasma é 404 ANTES da trilha — ler quem não existe não é leitura de ninguém", async () => {
  const { deps, trilhas } = montarDepsPosicoes({
    meuVinculo: 10,
    ehVinculoMeu: false,
    existe: false,
    subArvore: [],
    posicoes: [],
  });
  await assert.rejects(
    obterPosicoes(SESSAO_GESTORA, 424242, new Set(["rh.posicao.ver"]), deps),
    (erro: unknown) => erro instanceof ErroHttp && erro.status === 404
  );
  assert.deepEqual(trilhas, []);
});

// ------------------------------------------------------- raça-cor individual (A5:b)
// Mesmo desvio da posição: a leitura do TITULAR sobre si não é leitura de
// terceiro e não deixa trilha; a de terceiro continua gravando sempre —
// inclusive "não declarada".

function montarDepsRacaCor(cenario: {
  pessoaDoAlvo: number | null;
  minhaPessoa: number | null;
  racaCor: string | null;
}): { deps: DepsRacaCor; trilhas: string[] } {
  const trilhas: string[] = [];
  const deps: DepsRacaCor = {
    lerRacaCorDoColaborador: async () =>
      cenario.pessoaDoAlvo === null
        ? null
        : { pessoa_id: cenario.pessoaDoAlvo, raca_cor: cenario.racaCor },
    pessoaIdDoUsuario: async () => cenario.minhaPessoa,
    registrarLeituraSensivel: async (entrada) => {
      trilhas.push(entrada.chavePermissao);
    },
  };
  return { deps, trilhas };
}

test("raça-cor de terceiro grava trilha com rh.colaborador.sensivel.ver", async () => {
  const { deps, trilhas } = montarDepsRacaCor({
    pessoaDoAlvo: 5,
    minhaPessoa: 9,
    racaCor: "parda",
  });
  const visao = await obterRacaCorColaborador(SESSAO_GESTORA, 12, deps);
  assert.equal(visao.raca_cor, "parda");
  assert.deepEqual(trilhas, ["rh.colaborador.sensivel.ver"]);
});

test("a PRÓPRIA raça-cor (mesma pessoa da sessão) não deixa trilha", async () => {
  const { deps, trilhas } = montarDepsRacaCor({
    pessoaDoAlvo: 5,
    minhaPessoa: 5,
    racaCor: null,
  });
  const visao = await obterRacaCorColaborador(SESSAO_GESTORA, 12, deps);
  assert.equal(visao.raca_cor, null);
  assert.deepEqual(trilhas, []);
});

test("raça-cor de colaborador inexistente é 404 sem trilha", async () => {
  const { deps, trilhas } = montarDepsRacaCor({
    pessoaDoAlvo: null,
    minhaPessoa: 5,
    racaCor: null,
  });
  await assert.rejects(
    obterRacaCorColaborador(SESSAO_GESTORA, 424242, deps),
    (erro: unknown) => erro instanceof ErroHttp && erro.status === 404
  );
  assert.deepEqual(trilhas, []);
});
