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
    // Sandbox de ferramenta: worktrees do agente clonam o repo inteiro aqui dentro,
    // e o eslint acabava lintando uma segunda cópia do projeto.
    ".claude/**",
  ]),
  // Scripts CLI CommonJS: db/ (ferramentas, migrations, semeadores) e provas/.
  // Eles ficavam FORA do lint por "db/**" estar nos ignores — e é onde vivem as
  // ferramentas do arnês, o runner de migrations e os semeadores, ou seja, o portão
  // era cego justo para o código de que o resto depende. Dialeto diferente não é
  // motivo para não ter portão: é motivo para ter um portão próprio.
  {
    files: ["db/**/*.js", "provas/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
