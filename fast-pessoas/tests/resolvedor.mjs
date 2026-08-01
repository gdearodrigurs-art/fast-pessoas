// tests/resolvedor.mjs — ensina o Node a achar os módulos do projeto.
//
// O Node 24 já executa TypeScript direto (type stripping), então a suíte roda sem compilar
// nada e sem dependência nova. Mas ele NÃO resolve duas coisas que o projeto usa em todo
// arquivo, porque as duas são convenção de empacotador e não de Node:
//
//   import { X } from "./esquemas"     -> ESM exige extensão; sem ela, ERR_MODULE_NOT_FOUND
//   import { Y } from "@/lib/banco"    -> o alias vive no tsconfig, que o Node não lê
//
// A alternativa era acrescentar tsx ou ts-node. Trinta linhas aqui custam menos que uma
// dependência a mais no portão que roda a cada commit: dependência é peso permanente, e o
// ponto 3 do arnês exige que o portão rápido seja mesmo rápido.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const EXTENSOES = [".ts", ".tsx", ".js", ".jsx"];

/** Acha o arquivo real de um caminho sem extensão: X.ts, X.tsx, ou X/index.ts. */
function acharArquivo(base) {
  if (existsSync(base) && path.extname(base)) return base;
  for (const ext of EXTENSOES) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTENSOES) {
    const indice = path.join(base, "index" + ext);
    if (existsSync(indice)) return indice;
  }
  return null;
}

export async function resolve(especificador, contexto, proximo) {
  // Alias "@/" do tsconfig: aponta para src/.
  if (especificador.startsWith("@/")) {
    const alvo = acharArquivo(path.join(SRC, especificador.slice(2)));
    if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true };
  }

  // Relativo sem extensão: "./esquemas", "../lib/banco".
  if (especificador.startsWith(".") && !path.extname(especificador)) {
    const daqui = contexto.parentURL ? path.dirname(fileURLToPath(contexto.parentURL)) : process.cwd();
    const alvo = acharArquivo(path.resolve(daqui, especificador));
    if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true };
  }

  return proximo(especificador, contexto);
}
