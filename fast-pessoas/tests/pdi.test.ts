// Bateria do MOTOR GENÉRICO do PDI — src/dominios/pdi/calculo.ts.
//
// O motor não conhece indicador nenhum: lê o memoria_calculo da avaliação e
// (1) ordena as competências da mais fraca para a mais forte e (2) valida os
// focos e pontos cegos que a IA/gestor propôs — sempre AVISANDO, nunca
// bloqueando. Desde a Fase B (docs/19) a régua segue a pesquisa: focar numa
// FORÇA é desejável; avisa-se o contrário — plano só de lacunas, foco só de
// curso, ação sem indicador, e ponto cego com adjetivo de caráter.
//
// Nada toca banco nem API: o motor é puro, cabe no portão rápido.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  divergenciasAutoLider,
  selecionarCandidatos,
  validarFocos,
  validarPontosCegos,
  type RespostaAuto,
} from "../src/dominios/pdi/calculo";
import {
  esquemaConteudoPdi,
  esquemaEntrevistaPdi,
  type AcaoPdi,
  type FocoPdi,
} from "../src/dominios/pdi/esquemas";
import {
  contemPiiObvio,
  limparContextoLivre,
  nomesProvaveis,
} from "../src/lib/desidentificar";
import type {
  MemoriaCalculo,
  MemoriaIndicador,
  MemoriaPilar,
} from "../src/dominios/avaliacao/calculo";

function indicador(
  nome: string,
  nota: number | null,
  naoObservado = false
): MemoriaIndicador {
  return {
    indicador_id: Math.abs(hash(nome)),
    nome,
    peso: 33,
    peso_normalizado: naoObservado ? null : 33,
    nota,
    nao_observado: naoObservado,
  };
}

function pilar(
  nome: string,
  notaPilar: number | null,
  indicadores: MemoriaIndicador[]
): MemoriaPilar {
  return {
    pilar_id: Math.abs(hash(nome)),
    nome,
    peso: 50,
    peso_normalizado: notaPilar === null ? null : 50,
    excluido: notaPilar === null,
    respondidos: indicadores.filter((i) => i.nota !== null).length,
    nao_observados: indicadores.filter((i) => i.nao_observado).length,
    nota_pilar: notaPilar,
    indicadores,
  };
}

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return h || 1;
}

// Modelo de exemplo: notas 2, 4 (pilar Dever) e 5, 3 (pilar Desenvolvimento).
// notas = [2,3,4,5] → mediana = 4; mais fraca = "Assiduidade" (2).
function memoriaExemplo(): MemoriaCalculo {
  return {
    versao_memoria: 1,
    modelo: { id: 1, versao: 1, nome: "Modelo padrão" },
    escala: { minima: 1, maxima: 5, normalizacao: "nota/5" },
    regras: { nao_observado: "…", arredondamento: "…", faixa: "…" },
    pilares: [
      pilar("Dever", 60, [
        indicador("Assiduidade e compromisso", 2),
        indicador("Cumprimento de normas", 4),
      ]),
      pilar("Desenvolvimento (CHA)", 80, [
        indicador("Conhecimento técnico do cargo", 5),
        indicador("Atitude e proatividade", 3),
      ]),
    ],
    percentual: 70,
    faixa: {
      id: 3,
      minimo: 60,
      maximo: 80,
      rotulo: "Desenvolver para liderança",
      recomendacao: "desenvolver",
    },
    calculado_em: "2026-08-11T00:00:00.000Z",
  };
}

/** Uma ação "limpa" (todos os campos preenchidos); os testes sobrescrevem o que precisam. */
function acaoLimpa(over: Partial<AcaoPdi> = {}): AcaoPdi {
  return {
    descricao: "fazer algo concreto",
    prazo_sugerido: "60 dias",
    modalidade: "experiencia",
    indicador: "evidência observável por um terceiro",
    apoio: "gestor",
    tipo: "ampliar_forca",
    ...over,
  };
}

function foco(competencia: string, acoes: AcaoPdi[] = [acaoLimpa()]): FocoPdi {
  return { competencia, porque: "porque", objetivo: "objetivo", acoes };
}

test("selecionarCandidatos ordena da mais fraca para a mais forte", () => {
  const candidatos = selecionarCandidatos(memoriaExemplo());
  assert.deepEqual(
    candidatos.indicadores.map((i) => i.nome),
    [
      "Assiduidade e compromisso",
      "Atitude e proatividade",
      "Cumprimento de normas",
      "Conhecimento técnico do cargo",
    ]
  );
  assert.equal(candidatos.mais_fraco?.nome, "Assiduidade e compromisso");
  assert.equal(candidatos.recomendacao, "desenvolver");
  // Pilares também rankeados (Dever 60 antes de Desenvolvimento 80).
  assert.deepEqual(
    candidatos.pilares.map((p) => p.nome),
    ["Dever", "Desenvolvimento (CHA)"]
  );
});

test("indicador não observado fica fora dos candidatos", () => {
  const memoria = memoriaExemplo();
  memoria.pilares[0].indicadores.push(
    indicador("Responsabilidade com recursos", null, true)
  );
  const candidatos = selecionarCandidatos(memoria);
  assert.ok(
    !candidatos.indicadores.some((i) => i.nome.startsWith("Responsabilidade"))
  );
});

test("validarFocos: área mais fraca ignorada avisa; focar numa força não", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Conhecimento técnico do cargo"), // nota 5, a mais forte
  ]);
  // A régua antiga (foco_em_forte) morreu: focar numa força é desejável.
  assert.deepEqual(
    avisos.map((a) => a.tipo),
    ["area_fraca_ignorada"]
  );
});

test("validarFocos: competência inventada é sinalizada", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Inteligência emocional avançada"), // não existe no modelo
  ]);
  assert.ok(avisos.some((a) => a.tipo === "competencia_desconhecida"));
});

test("validarFocos: focar a área mais fraca (plano limpo) não gera aviso", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Assiduidade"), // casa com "Assiduidade e compromisso" (nota 2)
  ]);
  assert.deepEqual(avisos, []);
});

test("validarFocos: plano só de lacunas avisa (começar pelas forças)", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Assiduidade", [acaoLimpa({ tipo: "enderecar_lacuna" })]),
  ]);
  assert.ok(avisos.some((a) => a.tipo === "sem_foco_de_forca"));
});

test("validarFocos: foco só de formação avisa", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Assiduidade", [acaoLimpa({ modalidade: "formacao" })]),
  ]);
  assert.ok(avisos.some((a) => a.tipo === "foco_so_curso"));
});

test("validarFocos: ação sem indicador avisa", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Assiduidade", [acaoLimpa({ indicador: "" })]),
  ]);
  assert.ok(avisos.some((a) => a.tipo === "acao_sem_indicador"));
});

test("validarFocos: campo em branco pula a checagem de forma (o humano pode limpar)", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    foco("Assiduidade", [acaoLimpa({ modalidade: undefined, tipo: undefined })]),
  ]);
  const tipos = avisos.map((a) => a.tipo);
  assert.ok(!tipos.includes("sem_foco_de_forca"));
  assert.ok(!tipos.includes("foco_so_curso"));
});

test("validarFocos: sem respostas, plano limpo, sem avisos", () => {
  const memoria = memoriaExemplo();
  for (const p of memoria.pilares) {
    for (const i of p.indicadores) {
      i.nota = null;
      i.nao_observado = true;
    }
  }
  assert.deepEqual(validarFocos(memoria, [foco("Qualquer")]), []);
});

test("esquemaConteudoPdi aceita um plano válido e preenche pontos_cegos", () => {
  const analisado = esquemaConteudoPdi.parse({
    focos: [
      {
        competencia: "Assiduidade e compromisso",
        porque: "Nota mais baixa na avaliação.",
        objetivo: "Reduzir atrasos e faltas.",
        acoes: [{ descricao: "Combinar meta de pontualidade", prazo_sugerido: "60 dias" }],
      },
    ],
    resumo: "Plano focado no ponto mais fraco.",
  });
  assert.deepEqual(analisado.pontos_cegos, []);
});

test("esquemaConteudoPdi: ponto cego objeto novo e string antiga convivem (coerção)", () => {
  const r = esquemaConteudoPdi.parse({
    focos: [foco("Assiduidade e compromisso")],
    pontos_cegos: [
      {
        competencia: "Assiduidade",
        direcao: "superavaliado",
        texto: "em reuniões você decide antes de ouvir os pares",
      },
      "forma antiga em string simples",
    ],
    resumo: "ok",
  });
  assert.equal(r.pontos_cegos.length, 2);
  assert.equal(r.pontos_cegos[1].texto, "forma antiga em string simples");
  assert.equal(r.pontos_cegos[1].competencia, "");
});

test("esquemaAcaoPdi: modalidade vazia vira ausência; enum inválido é rejeitado", () => {
  const ok = esquemaConteudoPdi.parse({
    focos: [
      {
        competencia: "X",
        porque: "y",
        objetivo: "z",
        acoes: [{ descricao: "abc", prazo_sugerido: "30d", modalidade: "" }],
      },
    ],
    resumo: "r",
  });
  assert.equal(ok.focos[0].acoes[0].modalidade, undefined);
  const bad = esquemaConteudoPdi.safeParse({
    focos: [
      {
        competencia: "X",
        porque: "y",
        objetivo: "z",
        acoes: [{ descricao: "abc", prazo_sugerido: "30d", modalidade: "curso" }],
      },
    ],
    resumo: "r",
  });
  assert.equal(bad.success, false);
});

test("esquemaConteudoPdi: aceita a prosa longa que a IA gera (regressão do 502)", () => {
  // O structured output não impõe tamanho de texto; a IA escreve ponto cego em
  // SBI, indicador e apoio bem acima de 500 chars. Os tetos do zod têm de dar
  // essa folga — este teste barra quem apertá-los de novo.
  const r = esquemaConteudoPdi.safeParse({
    focos: [
      {
        competencia: "Resultado",
        porque: "b".repeat(1800),
        objetivo: "c".repeat(1800),
        nivel_atual: "acompanha o resultado com apoio do gestor",
        nivel_desejado: "apura, explica e defende os próprios números sozinho",
        acoes: [
          {
            descricao: "d".repeat(1200),
            prazo_sugerido: "a partir do 2º mês, mensalmente até o 6º, com check-in quinzenal",
            modalidade: "experiencia",
            indicador: "e".repeat(1500),
            apoio: "f".repeat(900),
            tipo: "enderecar_lacuna",
          },
        ],
      },
    ],
    pontos_cegos: [
      { competencia: "Resultado", direcao: "superavaliado", texto: "g".repeat(900) },
    ],
    resumo: "h".repeat(1200),
  });
  assert.equal(r.success, true);
});

test("esquemaConteudoPdi rejeita plano sem focos ou ação vazia", () => {
  assert.equal(
    esquemaConteudoPdi.safeParse({ focos: [], resumo: "x" }).success,
    false
  );
  assert.equal(
    esquemaConteudoPdi.safeParse({
      focos: [
        { competencia: "X", porque: "y", objetivo: "z", acoes: [] },
      ],
      resumo: "x",
    }).success,
    false
  );
});

test("esquemaEntrevistaPdi valida horizonte e peso", () => {
  assert.equal(
    esquemaEntrevistaPdi.safeParse({
      peso_avaliacao: 100,
      tipo: "ciclo",
      horizonte_meses: 6,
      foco_prioritario: "ia_decide",
    }).success,
    true
  );
  // horizonte fora de 3/6/12 é inválido.
  assert.equal(
    esquemaEntrevistaPdi.safeParse({
      peso_avaliacao: 100,
      tipo: "ciclo",
      horizonte_meses: 5,
      foco_prioritario: "ia_decide",
    }).success,
    false
  );
});

test("limparContextoLivre redige CPF, e-mail e telefone e sinaliza nome", () => {
  const { limpo, avisos } = limparContextoLivre(
    "Falar com João Silva, CPF 123.456.789-09, e-mail joao@fast.com, tel (11) 99999-8888"
  );
  assert.ok(!limpo.includes("123.456.789-09"));
  assert.ok(!limpo.includes("joao@fast.com"));
  assert.ok(!limpo.includes("99999-8888"));
  assert.ok(avisos.some((a) => a.includes("CPF")));
  assert.ok(avisos.some((a) => a.includes("nome próprio")));
});

test("limparContextoLivre não mexe em texto sem PII", () => {
  const texto = "mudou de setor há 3 meses e ainda se adapta ao novo time";
  const { limpo, avisos } = limparContextoLivre(texto);
  assert.equal(limpo, texto);
  assert.deepEqual(avisos, []);
});

test("contemPiiObvio pega CPF e ignora texto limpo", () => {
  assert.equal(contemPiiObvio("o CPF é 123.456.789-09"), true);
  assert.equal(contemPiiObvio("texto sem qualquer dado pessoal"), false);
});

// ------------------------------------------------------------------ pontos cegos (auto × líder)

function respostaAuto(
  indicadorNome: string,
  pilarNome: string,
  nota: number | null,
  naoObservado = false
): RespostaAuto {
  return {
    indicador_nome: indicadorNome,
    pilar_nome: pilarNome,
    nota,
    nao_observado: naoObservado,
  };
}

test("divergenciasAutoLider: só onde os dois deram nota, por magnitude", () => {
  // Líder: Assiduidade 2, Cumprimento 4, Conhecimento 5, Atitude 3.
  const auto: RespostaAuto[] = [
    respostaAuto("Assiduidade e compromisso", "Dever", 4), // líder 2 → +2
    respostaAuto("Cumprimento de normas", "Dever", 4), // líder 4 → 0 (sai)
    respostaAuto("Conhecimento técnico do cargo", "Desenvolvimento (CHA)", 3), // líder 5 → -2
    respostaAuto("Atitude e proatividade", "Desenvolvimento (CHA)", null, true), // não observado (sai)
  ];
  const divs = divergenciasAutoLider(memoriaExemplo(), auto);
  assert.equal(divs.length, 2);
  const assid = divs.find((d) => d.competencia.startsWith("Assiduidade"));
  assert.equal(assid?.nota_colaborador, 4);
  assert.equal(assid?.nota_lider, 2);
  assert.equal(assid?.gap, 2);
  const conhec = divs.find((d) => d.competencia.startsWith("Conhecimento"));
  assert.equal(conhec?.gap, -2);
});

test("divergenciasAutoLider: sem autoavaliação, sem divergências", () => {
  assert.deepEqual(divergenciasAutoLider(memoriaExemplo(), []), []);
});

test("validarPontosCegos: havia divergência e o PDI não trouxe cegos → aviso", () => {
  const divs = divergenciasAutoLider(memoriaExemplo(), [
    respostaAuto("Assiduidade e compromisso", "Dever", 5),
  ]);
  const avisos = validarPontosCegos(divs, []);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].tipo, "ponto_cego_ignorado");
});

test("validarPontosCegos: com pontos cegos (objeto) preenchidos, sem aviso", () => {
  const divs = divergenciasAutoLider(memoriaExemplo(), [
    respostaAuto("Assiduidade e compromisso", "Dever", 5),
  ]);
  assert.deepEqual(
    validarPontosCegos(divs, [
      { texto: "em reuniões você costuma decidir antes de ouvir os pares" },
    ]),
    []
  );
});

test("validarPontosCegos: ponto cego com adjetivo de caráter é sinalizado", () => {
  const avisos = validarPontosCegos(
    [],
    [{ texto: "você é arrogante nas reuniões" }]
  );
  assert.ok(avisos.some((a) => a.tipo === "ponto_cego_como_traco"));
});

test("validarPontosCegos: sem divergências, nunca gera aviso", () => {
  assert.deepEqual(validarPontosCegos([], []), []);
});

// Guarda de nome próprio no contexto livre (achado MB1 da revisão geral): o
// serviço BLOQUEIA a geração quando nomesProvaveis não é vazio, para o nome não
// ir à IA externa. Aqui provamos a detecção (2+ palavras capitalizadas), a
// ausência de falso positivo em texto comum, e a limitação conhecida (nome
// isolado não é detectável).
test("nomesProvaveis: detecta nome próprio (2+ palavras capitalizadas), sem repetir", () => {
  assert.deepEqual(nomesProvaveis("conversar com Joao Silva sobre metas"), [
    "Joao Silva",
  ]);
  assert.deepEqual(
    nomesProvaveis("Maria Souza e Maria Souza de novo"),
    ["Maria Souza"],
    "nomes repetidos entram uma vez só"
  );
});

test("nomesProvaveis: texto sem nome próprio não gera falso positivo", () => {
  assert.deepEqual(nomesProvaveis("melhorar a comunicação com o gestor"), []);
  assert.deepEqual(nomesProvaveis("focar na entrega dentro do prazo"), []);
});

test("nomesProvaveis: nome ISOLADO não é detectável (limitação documentada)", () => {
  // "Joao" sozinho não casa (exige 2+ maiúsculas); o PDI é anônimo por design.
  assert.deepEqual(nomesProvaveis("falar com Joao amanha"), []);
});
