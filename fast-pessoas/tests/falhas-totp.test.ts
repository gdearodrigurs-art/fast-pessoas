import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PortasFalhasTotp,
  processarCodigoTotp,
} from "../src/dominios/identidade/falhas-totp";

// ===========================================================================
// Falhas CONSECUTIVAS de TOTP (decisão C1 modificada, docs/20).
//
// Prova a POLÍTICA com o contador MOCKADO (portas em memória):
//   - acerto ZERA o contador (consecutivas, não janela);
//   - a 5ª falha DESATIVA o usuário (com auditoria, autor = sistema);
//   - o último gestor de usuários ativo NUNCA é desativado — recebe bloqueio
//     temporário com a duração administrável;
//   - o limiar vem dos parâmetros, não de número chumbado (eixo 9).
//
//   - conta que JÁ caiu (duplo-clique da 5ª falha) não ganha bloqueio
//     temporário nem rastro falso de "último gestor".
//
// A metade de BANCO — incremento atômico, desativação condicionada por CHAVE
// de permissão ('usuario.administrar'), auditoria na mesma instrução e o
// advisory lock transacional que serializa duas desativações simultâneas
// (corrida dos dois-últimos-gestores) — vive em identidade/repositorio.ts e
// se prova ao vivo contra o banco.
// ===========================================================================

interface EstadoFalhas {
  falhas: number;
  ativo: boolean;
  bloqueadoMinutos: number | null;
  desativacoesAuditadas: number;
  bloqueiosAuditados: number;
}

function bancada(
  opcoes: {
    maxFalhasTotp?: number;
    bloqueioTotpMinutos?: number;
    ultimoGestorDeUsuarios?: boolean;
  } = {}
): { portas: PortasFalhasTotp; estado: EstadoFalhas } {
  const estado: EstadoFalhas = {
    falhas: 0,
    ativo: true,
    bloqueadoMinutos: null,
    desativacoesAuditadas: 0,
    bloqueiosAuditados: 0,
  };
  const portas: PortasFalhasTotp = {
    async registrarFalha() {
      estado.falhas += 1;
      return estado.falhas;
    },
    async zerarFalhas() {
      estado.falhas = 0;
      estado.bloqueadoMinutos = null;
    },
    async lerParametros() {
      return {
        maxFalhasTotp: opcoes.maxFalhasTotp ?? 5,
        bloqueioTotpMinutos: opcoes.bloqueioTotpMinutos ?? 15,
      };
    },
    async desativarComAuditoria() {
      // Espelha a porta real (repositorio.desativarPorFalhasTotp): conta JÁ
      // inativa vem antes de qualquer salvaguarda — o UPDATE tem `AND ativo`.
      if (!estado.ativo) return "ja_inativo";
      // Salvaguarda do último gestor: a porta real recusa quando não existe
      // OUTRO usuário ativo com a chave de gestão de usuários.
      if (opcoes.ultimoGestorDeUsuarios) return "ultimo_gestor";
      estado.ativo = false;
      estado.falhas = 0;
      estado.desativacoesAuditadas += 1;
      return "desativado";
    },
    async bloquearComAuditoria(_usuarioId, minutos) {
      estado.bloqueadoMinutos = minutos;
      estado.falhas = 0;
      estado.bloqueiosAuditados += 1;
    },
  };
  return { portas, estado };
}

const USUARIO = 7;

test("acerto ZERA o contador: 4 falhas + acerto → 0, e a falha seguinte é a 1ª de novo", async () => {
  const { portas, estado } = bancada();

  for (let i = 1; i <= 4; i++) {
    assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  }
  assert.equal(estado.falhas, 4);
  assert.equal(estado.ativo, true);

  // Acerto: contador volta a zero — consecutivas, não janela.
  assert.equal(await processarCodigoTotp(portas, USUARIO, true), "ok");
  assert.equal(estado.falhas, 0);

  // A próxima falha NÃO é a 5ª — o histórico morreu no acerto.
  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  assert.equal(estado.falhas, 1);
  assert.equal(estado.ativo, true);
  assert.equal(estado.desativacoesAuditadas, 0);
});

test("5ª falha consecutiva DESATIVA o usuário, com auditoria", async () => {
  const { portas, estado } = bancada();

  for (let i = 1; i <= 4; i++) {
    assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  }
  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "desativado");

  assert.equal(estado.ativo, false);
  assert.equal(estado.desativacoesAuditadas, 1);
  assert.equal(estado.bloqueiosAuditados, 0);
  // A desativação consome o contador: reativado pelo DP, recomeça do zero.
  assert.equal(estado.falhas, 0);
});

test("último gestor de usuários: 5ª falha BLOQUEIA temporariamente, nunca desativa", async () => {
  const { portas, estado } = bancada({ ultimoGestorDeUsuarios: true });

  for (let i = 1; i <= 4; i++) {
    assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  }
  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "bloqueado");

  assert.equal(estado.ativo, true, "o último gestor segue ATIVO");
  assert.equal(estado.bloqueadoMinutos, 15);
  assert.equal(estado.bloqueiosAuditados, 1);
  assert.equal(estado.desativacoesAuditadas, 0);
  // O bloqueio também consome o contador: vencido o prazo, recomeça do zero.
  assert.equal(estado.falhas, 0);
});

test("limiar batido numa conta que JÁ caiu (duplo-clique da 5ª falha): sem bloqueio temporário e sem rastro de 'último gestor'", async () => {
  const { portas, estado } = bancada();
  // A tentativa PARALELA acabou de desativar (e zerou o contador na mesma
  // instrução); esta chegou logo atrás com o incremento dela já feito.
  estado.ativo = false;
  estado.falhas = 4;

  // A conta está inativa — é isso que o chamador responde ("desativado"),
  // sem inventar consequência nova.
  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "desativado");

  assert.equal(
    estado.desativacoesAuditadas,
    0,
    "nenhuma auditoria NOVA de desativação — a tentativa paralela já gravou a dela"
  );
  assert.equal(
    estado.bloqueiosAuditados,
    0,
    "nenhum bloqueio temporário: a auditoria de 'último gestor' seria falsa"
  );
  assert.equal(estado.bloqueadoMinutos, null, "conta inativa não ganha bloqueio");
});

test("limiar e duração vêm dos parâmetros administráveis, não de número chumbado", async () => {
  const { portas, estado } = bancada({
    maxFalhasTotp: 3,
    bloqueioTotpMinutos: 45,
    ultimoGestorDeUsuarios: true,
  });

  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  // Com limiar 3, a 3ª falha já aplica a regra.
  assert.equal(await processarCodigoTotp(portas, USUARIO, false), "bloqueado");
  assert.equal(estado.bloqueadoMinutos, 45);
});

test("limiar REDUZIDO abaixo do contador atual: a próxima falha aplica a regra (>= e não ==)", async () => {
  const { portas, estado } = bancada({ maxFalhasTotp: 10 });

  for (let i = 1; i <= 7; i++) {
    assert.equal(await processarCodigoTotp(portas, USUARIO, false), "falha");
  }
  // A administração aperta o limiar de 10 para 5 com 7 falhas acumuladas.
  const portasApertadas: PortasFalhasTotp = {
    ...portas,
    async lerParametros() {
      return { maxFalhasTotp: 5, bloqueioTotpMinutos: 15 };
    },
  };
  assert.equal(
    await processarCodigoTotp(portasApertadas, USUARIO, false),
    "desativado"
  );
  assert.equal(estado.ativo, false);
});
