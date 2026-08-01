import { describe, it } from "node:test";
import { Rule, RuleTester } from "eslint";
// Namespace, não default: o pacote marca __esModule mas não exporta default, então
// `import parserTs from` devolveria undefined e o caso do `as const` cairia em erro
// de parsing em vez de testar a regra.
import * as parserTs from "@typescript-eslint/parser";

import regrasFast from "../eslint-regras/index.js";

// A suíte do projeto roda em node:test; o RuleTester do ESLint procura describe/it.
// Sem estas duas linhas ele executa tudo dentro de um único caso e o relatório perde
// o nome do que quebrou — que é a única coisa que o desenvolvedor lê quando fica
// vermelho.
(RuleTester as unknown as { describe: unknown }).describe = describe;
(RuleTester as unknown as { it: unknown }).it = it;

const telas = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const dominio = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const regras = regrasFast.rules as unknown as Record<string, Rule.RuleModule>;

// ---------------------------------------------------------------------------
// REGRA 1 — literal-em-formulario
// ---------------------------------------------------------------------------
// A lista de VÁLIDOS aqui vale tanto quanto a de inválidos: é ela que prova que a
// regra não acusa contador de recarga, aba, booleano de interface nem estado que
// vem de fora. Regra que acusa demais é regra desligada, e desligada não vale nada.

telas.run("literal-em-formulario", regras["literal-em-formulario"], {
  valid: [
    // Estado de UI pura — os três neutros. Hoje são 25 usos de useState(0) só de
    // contador de recarga em src/app, e um de escala de zoom no organograma.
    { code: "const [versao, setVersao] = useState(0);" },
    { code: "const [escala, setEscala] = useState(1);" },
    { code: "const [selecionado, setSelecionado] = useState(-1);" },

    // Campo que começa vazio — exatamente o que a correção FB-2 fez com férias.
    { code: 'const [dias, setDias] = useState("");' },
    { code: "const [tipo, setTipo] = useState(null);" },
    { code: "const [lista, setLista] = useState([]);" },
    { code: "const [form, setForm] = useState({});" },

    // Booleano de interface: aberto/fechado, carregando, expandido.
    { code: "const [aberto, setAberto] = useState(false);" },
    { code: "const [carregando, setCarregando] = useState(true);" },

    // Não é literal: veio de prop, de constante administrável ou do servidor.
    { code: "const [dias, setDias] = useState(limites.dias_maximos);" },
    { code: "const [dias, setDias] = useState(props.diasPadrao);" },
    { code: "const [agora, setAgora] = useState(new Date());" },
    { code: "const [x, setX] = useState(calcularInicial());" },
    { code: "const [x, setX] = useState(parametro ?? null);" },

    // String em useState fica calada por padrão: aba e filtro têm a mesma forma que
    // select de formulário, e ligar isso hoje pintaria 31 lugares de vermelho.
    { code: 'const [aba, setAba] = useState("dados");' },
    { code: 'const [filtroTipo, setFiltroTipo] = useState("todos");' },

    // defaultValue sem escolha feita.
    { code: "const t = <input defaultValue=\"\" />;" },
    { code: "const t = <input defaultValue={dados.nome} />;" },
    { code: "const t = <input defaultValue={0} />;" },

    // Outra função que por acaso recebe número: a regra só olha useState.
    { code: "const x = useMemo(() => 30, []);" },
    { code: "configurar(30);" },
  ],

  invalid: [
    {
      // O DEFEITO QUE CUSTOU: dias de férias iam ao POST sem ninguém escolher.
      // Custou uma frente inteira (FB-1 a FB-5) e a reescrita da tela de férias.
      code: "const [dias, setDias] = useState(30);",
      errors: [{ messageId: "numeroEmUseState", data: { valor: "30" } }],
    },
    {
      // Mesmo defeito, mesmo formulário: o abono de 10 dias.
      code: "const [abono, setAbono] = useState(10);",
      errors: [{ messageId: "numeroEmUseState" }],
    },
    {
      // Turnover de 20% chumbado na tela — o mesmo lote FB-3.
      code: "const [meta, setMeta] = useState(0.2);",
      errors: [{ messageId: "numeroEmUseState" }],
    },
    {
      // Número negativo chega como unário: sem este ramo, -30 passaria batido.
      code: "const [ajuste, setAjuste] = useState(-30);",
      errors: [{ messageId: "numeroEmUseState", data: { valor: "-30" } }],
    },
    {
      // `as const` não esconde o literal de baixo.
      code: "const [dias, setDias] = useState(30 as const);",
      errors: [{ messageId: "numeroEmUseState" }],
      languageOptions: { parser: parserTs },
    },
    {
      // Chamado como React.useState — mesma coisa, outra grafia.
      code: "const [dias, setDias] = React.useState(30);",
      errors: [{ messageId: "numeroEmUseState" }],
    },
    {
      // defaultValue é campo de formulário por definição: não há aba nem filtro aqui,
      // então string também conta. Zero ocorrências em src/app hoje — é preventiva.
      code: 'const t = <input defaultValue="integral" />;',
      errors: [{ messageId: "literalEmDefaultValue" }],
    },
    {
      code: "const t = <input defaultValue={30} />;",
      errors: [{ messageId: "literalEmDefaultValue" }],
    },
    {
      code: "const t = <select defaultValue={\"periodico\"} />;",
      errors: [{ messageId: "literalEmDefaultValue" }],
    },
    {
      // Com a opção ligada, a string do select passa a contar. É assim que o portão
      // fecha depois que os 14 selects de hoje forem tratados.
      code: 'const [tipo, setTipo] = useState("anual");',
      options: [{ stringsEmUseState: true }],
      errors: [{ messageId: "textoEmUseState", data: { valor: "anual" } }],
    },
  ],
});

// ---------------------------------------------------------------------------
// REGRA 2 — acesso-por-chave
// ---------------------------------------------------------------------------

dominio.run("acesso-por-chave", regras["acesso-por-chave"], {
  valid: [
    // O jeito certo: pergunta pela chave.
    { code: 'if (sessao.chaves.includes("colaborador.ver_todos")) { }' },
    { code: 'if (await temChave(sessao, "usuario.administrar")) { }' },

    // FALSO POSITIVO REAL nº 1 — `aba === "admin"` na ficha do colaborador
    // (ficha-colaborador.tsx:610 e :1865). "admin" ali é o nome de uma aba da tela.
    { code: 'if (aba === "admin") { mostrar(); }' },

    // FALSO POSITIVO REAL nº 2 — `nivel === "diretoria"` na cadeia de aprovação
    // (acoes-etapa.tsx:52, demandas/esquemas.ts:385, demandas/servico.ts:1717).
    // "diretoria" ali é o NÍVEL da cadeia, não o papel de quem está pedindo.
    { code: 'const comoDiretoria = nivel === "diretoria";' },
    { code: 'if (proxima.nivel === "diretoria") { encerrar(); }' },

    // Papel comparado com papel, sem nome escrito à mão: é o que a regra quer.
    { code: "if (papel === sessao.papel) { recusar(); }" },
    { code: "if (usuario.papel === atual.papel) { }" },

    // Nome de papel fora de comparação — rótulo, chave de dicionário, log.
    { code: 'const rotulo = ROTULOS_PAPEL["admin"];' },
    { code: 'registrar({ papel: "dp" });' },

    // Papel que não está na lista dos sete: "liderado" é lado de relação, não acesso.
    { code: 'const meu = liderancas.find((r) => r.papel === "liderado");' },

    // EXCEÇÃO 1 — trava anti-lockout: `travadasDoPapel` marca as chaves que o papel
    // admin não pode perder. Sem elas ninguém mais administra o sistema.
    {
      filename: "src/dominios/usuarios/servico.ts",
      code:
        "function travadasDoPapel(papel) {\n" +
        '  return papel === "admin" ? [...CHAVES_INDISPENSAVEIS_ADMIN] : [];\n' +
        "}",
    },
    {
      // EXCEÇÃO 1 (parte 2) — `atualizarUsuario` recusa desativar ou rebaixar o
      // último administrador ativo.
      filename: "src/dominios/usuarios/servico.ts",
      code:
        "async function atualizarUsuario(sessao, id, dados) {\n" +
        "  const deixaDeSerAdminAtivo =\n" +
        '    atual.papel === "admin" &&\n' +
        "    atual.ativo &&\n" +
        '    ((campos.papel !== undefined && campos.papel !== "admin") || campos.ativo === false);\n' +
        "  return deixaDeSerAdminAtivo;\n" +
        "}",
    },
    {
      // A exceção vale DENTRO da função, inclusive em arrow aninhada — o filtro do
      // último admin ativo mora dentro de um `.filter()`.
      filename: "src/dominios/usuarios/servico.ts",
      code:
        "async function atualizarUsuario(sessao, id) {\n" +
        '  const admins = lista.filter((u) => u.papel === "admin");\n' +
        "  return admins;\n" +
        "}",
    },
    {
      // EXCEÇÃO 2 — colisão de palavra: em rh.relacao_gestor a coluna `papel` vale
      // "gestor" ou "liderado", o LADO da relação de liderança.
      filename: "src/dominios/desligamento/servico.ts",
      code:
        "async function encerrarProcessoDesligamento(cliente, dados) {\n" +
        '  const orfaos = liderancas.filter((relacao) => relacao.papel === "gestor");\n' +
        "  return orfaos;\n" +
        "}",
    },
  ],

  invalid: [
    {
      // O DEFEITO QUE CUSTOU 70 FICHAS: o 2FA era exigido por nome de papel, então
      // um administrador podia dar acesso a 70 fichas a um perfil que entra só com
      // senha. Migration 0040 e a correção de identidade/servico.ts nasceram daqui.
      code: 'if (sessao.papel === "dp" || sessao.papel === "admin") { exigir2fa(); }',
      errors: [{ messageId: "papelNaDecisao" }, { messageId: "papelNaDecisao" }],
    },
    {
      // O ESCOPO QUE LEVAVA DE 1 PARA 70 COLABORADORES VISÍVEIS: mesma causa.
      code: 'const todos = sessao.papel === "rh" ? listarTodos() : listarMeus();',
      errors: [{ messageId: "papelNaDecisao", data: { papel: "rh" } }],
    },
    {
      // Ordem invertida conta igual.
      code: 'if ("gestor" === payload.papel) { aprovar(); }',
      errors: [{ messageId: "papelNaDecisao", data: { papel: "gestor" } }],
    },
    {
      // Desigualdade também é decisão de acesso.
      code: 'if (papel !== "diretoria") { negar(); }',
      errors: [{ messageId: "papelNaDecisao" }],
    },
    {
      code: 'if (usuario.papel == "lider_td") { }',
      errors: [{ messageId: "papelNaDecisao" }],
    },
    {
      code: 'if (usuario.papel != "recrutador") { }',
      errors: [{ messageId: "papelNaDecisao" }],
    },
    {
      // Em lista dá no mesmo — só muda a escrita.
      code: 'if (["admin", "dp"].includes(sessao.papel)) { liberar(); }',
      errors: [{ messageId: "papelNaDecisao", data: { papel: "admin" } }],
    },
    {
      // Em switch dá no mesmo.
      code: 'switch (sessao.papel) { case "gestor": aprovar(); break; }',
      errors: [{ messageId: "papelNaDecisao", data: { papel: "gestor" } }],
    },
    {
      // A EXCEÇÃO É POR FUNÇÃO, NÃO POR ARQUIVO: no mesmo usuarios/servico.ts, fora
      // das duas funções anti-lockout, a regra continua acusando. Desligar o arquivo
      // inteiro devolveria o buraco.
      filename: "src/dominios/usuarios/servico.ts",
      code:
        "export async function listarUsuarios(sessao) {\n" +
        '  if (sessao.papel === "admin") return listar();\n' +
        "  return [];\n" +
        "}",
      errors: [{ messageId: "papelNaDecisao" }],
    },
    {
      // E a exceção não vaza para outro arquivo com função de mesmo nome? Não: o
      // arquivo tem que casar também.
      filename: "src/dominios/folha/servico.ts",
      code:
        "function travadasDoPapel(papel) {\n" +
        '  return papel === "admin" ? [] : [];\n' +
        "}",
      errors: [{ messageId: "papelNaDecisao" }],
    },
  ],
});

// ---------------------------------------------------------------------------
// REGRA 3 — sem-parsefloat
// ---------------------------------------------------------------------------
// Medido em 01/08/2026 no PowerShell: ZERO ocorrências em src/dominios e db/.
// Preventiva e de custo zero — existe para que continue zero.

dominio.run("sem-parsefloat", regras["sem-parsefloat"], {
  valid: [
    // Inteiro é o que o domínio usa: centavo e minuto.
    { code: 'const centavos = Number.parseInt(texto, 10);' },
    { code: "const minutos = Math.round(segundos / 60);" },
    { code: "const n = Number(texto);" },
    // Nome parecido não conta.
    { code: "const x = parseFloatSeguro(texto);" },
    { code: "const y = obj.parseFloatDoBanco;" },
    // Propriedade de mesmo nome num objeto nosso não é a global.
    { code: "registrar({ parseFloat: false });" },
  ],

  invalid: [
    {
      // Somar float de hora já devolveu 346.90999999999997 neste projeto — o
      // corretor da folha registrou. Ele percebeu; o próximo pode não perceber.
      code: 'const horas = parseFloat(linha.horas);',
      errors: [{ messageId: "semParseFloat" }],
    },
    {
      code: 'const valor = Number.parseFloat(texto);',
      errors: [{ messageId: "semParseFloat" }],
    },
    {
      code: 'const valor = globalThis.parseFloat(texto);',
      errors: [{ messageId: "semParseFloat" }],
    },
    {
      // Guardar a função e chamar por outro nome não escapa.
      code: "const converter = parseFloat;",
      errors: [{ messageId: "semParseFloat" }],
    },
  ],
});
