import { test } from "node:test";
import assert from "node:assert/strict";

import type { LinhaSubArvore } from "../src/dominios/organograma/esquemas";
import type { RegraBanco } from "../src/dominios/ponto/repositorio";
import {
  resumoPontoDaEquipe,
  type DepsResumoEquipe,
} from "../src/dominios/ponto/servico";
import { opcoesComContagemDaSubArvore } from "../src/dominios/portais/servico";

// ===========================================================================
// Decisão A2:a (docs/20): "minha equipe" é a SUB-ÁRVORE — liderados diretos e
// INDIRETOS, uma semântica só no sistema inteiro. O ponto (ponto.ver.equipe) e
// o portal do gestor usavam a relação DIRETA de rh.relacao_gestor e ficaram
// para trás quando a lista de colaboradores, o salário e o disciplinar
// migraram. Estes casos fixam a semântica nova nos dois módulos: apagar um
// deles é reabrir a diferença de alcance entre telas.
//
// A caminhada em si (ciclo, teto, raiz de fora) já é fixada em
// organograma-subarvore.test.ts; aqui o que se fixa é que ponto e portal
// CONSOMEM a sub-árvore — com o repositório trocado por dublês (molde
// DepsPosse, pendência 16.2), nada toca banco.
// ===========================================================================

// ---------------------------------------------------------------- ponto

test("resumo do time cobre o liderado INDIRETO — a equipe do ponto é a sub-árvore", async () => {
  // Gestora 1 lidera 2 (direto); 2 lidera 3 (indireto para a gestora).
  const chamadas: { gestor: number[]; idsConsultados: number[][] } = {
    gestor: [],
    idsConsultados: [],
  };
  const deps: DepsResumoEquipe = {
    lideradosDaSubArvore: async (gestorId) => {
      chamadas.gestor.push(gestorId);
      return [2, 3];
    },
    colaboradoresPorIds: async (ids) => {
      chamadas.idsConsultados.push(ids);
      return ids.map((id) => ({
        id,
        nome_completo: id === 2 ? "Direto Dias" : "Indireta Inês",
        matricula: `M-${id}`,
      }));
    },
    saldosBanco: async () => new Map([[2, 120], [3, -30]]),
    ultimasApuracoes: async () => new Map(),
    contarIntercorrenciasAbertas: async () => new Map([[3, 2]]),
    // Só o direto tem regra: saldo 120 > limite 60 = estourando.
    resolverRegraBanco: async (colaboradorId) =>
      colaboradorId === 2
        ? ({ limite_positivo_minutos: 60 } as RegraBanco)
        : null,
  };

  const resumo = await resumoPontoDaEquipe(1, deps);

  // A sub-árvore foi pedida para a gestora e é ELA que alimenta as consultas.
  assert.deepEqual(chamadas.gestor, [1]);
  assert.deepEqual(chamadas.idsConsultados, [[2, 3]]);
  // O liderado indireto está no resumo — antes só o direto aparecia.
  assert.deepEqual(
    resumo.liderados.map((linha) => linha.colaborador_id).sort(),
    [2, 3]
  );
  assert.equal(resumo.saldo_total_minutos, 90);
  assert.equal(resumo.acima_do_limite, 1);
  assert.equal(resumo.intercorrencias_abertas, 2);
});

test("gestor sem liderado nenhum tem resumo vazio (sem consulta por ids)", async () => {
  const deps: DepsResumoEquipe = {
    lideradosDaSubArvore: async () => [],
    colaboradoresPorIds: async (ids) => {
      assert.deepEqual(ids, []);
      return [];
    },
    saldosBanco: async () => new Map(),
    ultimasApuracoes: async () => new Map(),
    contarIntercorrenciasAbertas: async () => new Map(),
    resolverRegraBanco: async () => null,
  };
  const resumo = await resumoPontoDaEquipe(7, deps);
  assert.deepEqual(resumo.liderados, []);
  assert.equal(resumo.saldo_total_minutos, 0);
});

// ---------------------------------------------------------------- portal do gestor

function linha(id: number, gestor: number | null): LinhaSubArvore {
  return { colaborador_id: id, gestor_id: gestor };
}

test("seletor do portal conta a sub-árvore inteira, não só os diretos", () => {
  // Diretora 1 tem UM direto (2), que lidera 3 e 4. Gerente 2 tem dois.
  const quadro = [linha(1, null), linha(2, 1), linha(3, 2), linha(4, 2)];
  const opcoes = opcoesComContagemDaSubArvore(
    [
      { colaborador_id: 1, nome_completo: "Diretora", liderados: 1 },
      { colaborador_id: 2, nome_completo: "Gerente", liderados: 2 },
    ],
    quadro
  );
  // O número do seletor tem que bater com a tabela da tela (sub-árvore).
  assert.deepEqual(
    opcoes.map((opcao) => opcao.liderados),
    [3, 2]
  );
});
