import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ===========================================================================
// GUARDAS DE ROTA — testes de FORMA do código-fonte (consertos A6/A7/A8 da
// revisão adversarial).
//
// Por que ler o fonte em vez de invocar a rota: Route Handler do Next depende
// de cookies()/redirect() de request scope — não roda em node:test sem HTTP.
// A REGRA de cada guarda é provada nos testes de domínio (documentos-conduta);
// o que este arquivo fixa é QUAL guarda cada rota usa — exatamente o que os
// consertos mudaram e que uma refatoração desavisada reverteria em silêncio.
//
// A suíte roda COMPILADA em .tmp-testes/tests (CJS): o fonte real fica dois
// níveis acima.
// ===========================================================================

const RAIZ_SRC = join(__dirname, "..", "..", "src");

function fonte(relativo: string): string {
  return readFileSync(join(RAIZ_SRC, relativo), "utf8");
}

// ---------------------------------------------------------------- A6: organograma reconfere usuario.ativo

test("organograma usa exigirSessao (reconfere usuario.ativo) — a guarda local copiada morreu (A6)", () => {
  const rota = fonte(join("app", "api", "organograma", "route.ts"));
  assert.match(rota, /await exigirSessao\(\)/);
  assert.doesNotMatch(rota, /exigirSessaoCompleta/);

  const servico = fonte(join("dominios", "organograma", "servico.ts"));
  assert.doesNotMatch(servico, /export function exigirSessaoCompleta/);
});

// ---------------------------------------------------------------- A7: identidade reconfere usuario.ativo

const ROTAS_IDENTIDADE = [
  join("app", "api", "identidade", "trocar-senha", "route.ts"),
  join("app", "api", "identidade", "2fa", "iniciar", "route.ts"),
  join("app", "api", "identidade", "2fa", "confirmar", "route.ts"),
  join("app", "api", "identidade", "2fa", "desativar", "route.ts"),
  join("app", "api", "identidade", "2fa", "situacao", "route.ts"),
];

test("trocar-senha e as 2fa/* reconferem usuario.ativo no banco (A7)", () => {
  for (const caminho of ROTAS_IDENTIDADE) {
    const rota = fonte(caminho);
    assert.match(
      rota,
      /await garantirUsuarioAtivo\(sessao\.usuario_id\)/,
      `${caminho} deveria reconferir usuario.ativo`
    );
  }
});

// ---------------------------------------------------------------- A8: regularização usa as variantes SEM a tranca; o resto herda

test("as rotas de REGULARIZAÇÃO usam as variantes sem a tranca da ciência (A8/B4)", () => {
  const keyless = [
    join("app", "api", "documentos", "pendencias", "minhas", "route.ts"),
    join("app", "api", "documentos", "[id]", "ciencia", "route.ts"),
  ];
  for (const caminho of keyless) {
    assert.match(
      fonte(caminho),
      /exigirSessaoParaRegularizacao\(\)/,
      `${caminho} deveria usar a variante keyless de regularização`
    );
  }

  const comChave = [
    join("app", "api", "documentos", "[id]", "recusa", "route.ts"),
    join("app", "api", "documentos", "[id]", "download", "route.ts"),
    // GET /api/documentos está no conjunto do bloqueado NO PROXY ("o painel
    // acha o documento por ela") — a tranca da aplicação não pode fechá-la.
    join("app", "api", "documentos", "route.ts"),
  ];
  for (const caminho of comChave) {
    assert.match(
      fonte(caminho),
      /exigirPermissaoParaRegularizacao\("documento\.ver"\)/,
      `${caminho} deveria conferir documento.ver pela variante de regularização`
    );
  }
  // O ENVIO (POST /api/documentos) continua herdando a tranca (A8): quem deve
  // ciência não publica documento.
  assert.match(
    fonte(join("app", "api", "documentos", "route.ts")),
    /exigirPermissao\("documento\.enviar"\)/
  );

  const paginas = [
    join("app", "documentos", "page.tsx"),
    join("app", "ciencia-pendente", "page.tsx"),
  ];
  for (const caminho of paginas) {
    assert.match(
      fonte(caminho),
      /exigirSessaoDePaginaParaRegularizacao\(\)/,
      `${caminho} deveria usar a variante de página de regularização`
    );
  }
});

test("ato-testemunhas: confirmação passa pela regularização; a gestão barra o bloqueado NA ROTA (A1/A8)", () => {
  const rota = fonte(
    join("app", "api", "documentos", "[id]", "ato-testemunhas", "route.ts")
  );
  // A testemunha (possivelmente ela mesma bloqueada) confirma com a variante.
  assert.match(rota, /exigirSessaoParaRegularizacao\(\)/);
  // O ramo de gestão (desfecho) barra o claim ANTES da chave (A1) …
  assert.match(rota, /exigirCienciaRegularParaGerirCiclo\(await lerSessao\(\)\)/);
  // … e a chave continua sendo conferida pela guarda COM a tranca (A8).
  assert.match(rota, /exigirPermissao\(CHAVE_CONDUTA_GERIR\)/);
});
