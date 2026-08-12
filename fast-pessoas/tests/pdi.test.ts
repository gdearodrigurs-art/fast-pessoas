// Bateria do MOTOR GENÉRICO do PDI — src/dominios/pdi/calculo.ts.
//
// O motor não conhece indicador nenhum: lê o memoria_calculo da avaliação e
// (1) ordena as competências da mais fraca para a mais forte e (2) valida os
// focos que a IA propôs. Aqui provamos as três checagens de sanidade do nível 2
// (competência inventada, foco numa área forte, área mais fraca ignorada) e que
// tudo é relativo à distribuição da própria pessoa — sem limiar chumbado.
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
} from "../src/dominios/pdi/esquemas";
import {
  contemPiiObvio,
  limparContextoLivre,
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

test("validarFocos: foco na área forte E área fraca ignorada geram aviso", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    { competencia: "Conhecimento técnico do cargo" }, // nota 5, acima da mediana 4
  ]);
  const tipos = avisos.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ["area_fraca_ignorada", "foco_em_forte"]);
});

test("validarFocos: competência inventada é sinalizada", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    { competencia: "Inteligência emocional avançada" }, // não existe no modelo
  ]);
  assert.ok(avisos.some((a) => a.tipo === "competencia_desconhecida"));
});

test("validarFocos: focar a área mais fraca não gera aviso", () => {
  const avisos = validarFocos(memoriaExemplo(), [
    { competencia: "Assiduidade" }, // casa com "Assiduidade e compromisso" (nota 2)
  ]);
  assert.deepEqual(avisos, []);
});

test("validarFocos: sem respostas, sem avisos (nada a validar)", () => {
  const memoria = memoriaExemplo();
  for (const p of memoria.pilares) {
    for (const i of p.indicadores) {
      i.nota = null;
      i.nao_observado = true;
    }
  }
  assert.deepEqual(validarFocos(memoria, [{ competencia: "Qualquer" }]), []);
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

test("validarPontosCegos: com pontos cegos preenchidos, sem aviso", () => {
  const divs = divergenciasAutoLider(memoriaExemplo(), [
    respostaAuto("Assiduidade e compromisso", "Dever", 5),
  ]);
  assert.deepEqual(
    validarPontosCegos(divs, ["o colaborador superestima a assiduidade"]),
    []
  );
});

test("validarPontosCegos: sem divergências, nunca gera aviso", () => {
  assert.deepEqual(validarPontosCegos([], []), []);
});
