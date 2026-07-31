import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts CLI CommonJS (rodam com node --env-file, fora do bundle do app):
    "db/**",
    // Sandbox de ferramenta: worktrees do agente clonam o repo inteiro aqui dentro,
    // e o eslint acabava lintando uma segunda cópia de db/ (que "db/**" não alcança).
    ".claude/**",
  ]),
]);

export default eslintConfig;
