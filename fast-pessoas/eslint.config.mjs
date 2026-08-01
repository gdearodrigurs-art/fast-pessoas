import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import regrasFast from "./eslint-regras/index.js";

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
    // Saída de compilação da suíte (outDir do tsconfig.testes.json). O portão não
    // linta o que ele mesmo acabou de emitir: o tsc gera CommonJS e cada require()
    // do .js emitido virava erro no fonte que já passou limpo. Cada teste novo
    // acrescentava mais erros fantasmas.
    //
    // E fica registrada a dependência que isso expõe: `npm test` produz artefato que
    // `npm run lint` lê. Os dois portões não são independentes — rodar um sujava o
    // outro. Esta linha resolve hoje; se aparecer outro acoplamento assim, a saída é
    // tirar o outDir de dentro do projeto.
    ".tmp-testes/**",
    // Rascunho solto de agente na raiz. O .gitignore cobre `.tmp-*/` (pasta) e
    // deixava passar `.tmp-scan.js` (arquivo).
    ".tmp-*.js",
  ]),
  // Scripts CLI CommonJS: db/ (ferramentas, migrations, semeadores), provas/ e o
  // plugin de lint. Eles ficavam FORA do lint por "db/**" estar nos ignores — e é
  // onde vivem as ferramentas do arnês, o runner de migrations e os semeadores, ou
  // seja, o portão era cego justo para o código de que o resto depende. Dialeto
  // diferente não é motivo para não ter portão: é motivo para ter um portão próprio.
  {
    files: ["db/**/*.js", "provas/**/*.js", "eslint-regras/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // AS TRÊS REGRAS PRÓPRIAS. Eram prosa repetida em todo prompt de agente, e as três
  // foram violadas apesar de escritas. Cada uma tem, no cabeçalho do arquivo, o
  // defeito que a pagou:
  //   literal-em-formulario  campo que nasce escolhido — dias de férias e abono iam
  //                          ao POST sem ninguém escolher
  //   acesso-por-chave       2FA e escopo decididos por NOME de papel — uma caixa
  //                          marcada levava de 1 para 70 colaboradores visíveis
  //   sem-parsefloat         preventiva; hoje pega zero, medido
  //
  // O ESCOPO de cada uma é diferente, e a diferença foi medida, não suposta. Ao ligar
  // as três em `db/**` também, a regra do papel acusou db/semear/08-avaliacao.js:567 —
  // e ali o semeador escolhe uma PERSONA FICTÍCIA para assinar decisões da
  // demonstração. Isso é geração de dado, não decisão de acesso. Silenciar a linha
  // esconderia o critério; precisar o escopo o deixa escrito.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "regras-fast": regrasFast },
    rules: {
      // Decisão de acesso e formulário de usuário só existem no aplicativo.
      "regras-fast/literal-em-formulario": "error",
      "regras-fast/acesso-por-chave": "error",
      "regras-fast/sem-parsefloat": "error",
    },
  },
  {
    // A disciplina de dinheiro e hora vale também para as ferramentas e os semeadores:
    // é de lá que sai o dado contra o qual tudo é medido. Um semeador que gera valor
    // em float contamina toda medição feita em cima dele.
    files: ["db/**/*.js", "provas/**/*.js"],
    plugins: { "regras-fast": regrasFast },
    rules: {
      "regras-fast/sem-parsefloat": "error",
    },
  },
]);

export default eslintConfig;
