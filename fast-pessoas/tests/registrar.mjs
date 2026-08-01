// tests/registrar.mjs — liga o resolvedor antes de qualquer teste carregar.
//
// Entra pela linha de comando: node --import ./tests/registrar.mjs --test "tests/**/*.test.ts"
// Precisa ser um arquivo à parte porque register() tem que rodar ANTES do primeiro import,
// e o próprio resolvedor é carregado como módulo separado, na thread de loaders.
import { register } from "node:module";

register("./resolvedor.mjs", import.meta.url);
