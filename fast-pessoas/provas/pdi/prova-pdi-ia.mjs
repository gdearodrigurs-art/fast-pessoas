// Prova da FRONTEIRA EXTERNA do PDI — a primeira chamada de rede que este projeto
// faz para fora do banco. Prova três coisas de uma vez:
//   (1) a chave ANTHROPIC_API_KEY do .env.local-db funciona;
//   (2) o Opus 5 devolve um PDI em JSON estruturado válido (structured outputs);
//   (3) o dado que sai é ANÔNIMO — pseudônimo, sem nome/CPF/matrícula.
// A avaliação abaixo é FICTÍCIA (não é PII de ninguém). Roda com:
//   node --env-file=.env.local-db provas/pdi/prova-pdi-ia.mjs
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY ausente — cole a chave (sk-ant-...) no .env.local-db e rode de novo."
  );
  process.exit(1);
}

// -------- avaliação fictícia, JÁ anonimizada (é isto que sairia para a IA) --------
const avaliacao = {
  colaborador: "Colaborador-7A3F", // pseudônimo estável; nunca o nome real
  cargo: "Vendedor",
  modelo: "3 pilares (Dever 30 / Desenvolvimento-CHA 40 / Fit Cultural 30)",
  percentual_final: 62,
  faixa: "Desenvolver para liderança",
  recomendacao: "desenvolver",
  competencias: [
    { pilar: "Dever", indicador: "Assiduidade e compromisso", nota: 2 },
    { pilar: "Dever", indicador: "Cumprimento de normas", nota: 4 },
    { pilar: "Dever", indicador: "Responsabilidade com recursos", nota: 3 },
    { pilar: "Desenvolvimento (CHA)", indicador: "Conhecimento técnico do cargo", nota: 4 },
    { pilar: "Desenvolvimento (CHA)", indicador: "Habilidade na execução", nota: 3 },
    { pilar: "Desenvolvimento (CHA)", indicador: "Atitude e proatividade", nota: 2 },
    { pilar: "Fit Cultural", indicador: "Resultado", nota: 4 },
    { pilar: "Fit Cultural", indicador: "Velocidade", nota: 3 },
    { pilar: "Fit Cultural", indicador: "Determinação", nota: 4 },
    { pilar: "Fit Cultural", indicador: "Desenvolvimento", nota: 2 },
    { pilar: "Fit Cultural", indicador: "Disciplina", nota: 3 },
    { pilar: "Fit Cultural", indicador: "Resiliência", nota: 3 },
    { pilar: "Fit Cultural", indicador: "Colaboração", nota: 4 },
    { pilar: "Fit Cultural", indicador: "Comunicação", nota: 2 },
    { pilar: "Fit Cultural", indicador: "Reconhecimento", nota: 4 },
  ],
};

// -------- respostas da mini-entrevista (campo livre já desidentificado) --------
const entrevista = {
  peso_avaliacao: 100,
  tipo: "ciclo",
  horizonte_meses: 6,
  foco_prioritario: "ia_decide",
  contexto_livre:
    "o colaborador mudou de setor há 3 meses e ainda está se adaptando ao novo time",
};

// -------- contrato de saída (structured outputs) --------
const esquema = {
  type: "object",
  additionalProperties: false,
  properties: {
    focos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          competencia: { type: "string" },
          porque: { type: "string" },
          objetivo: { type: "string" },
          acoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                descricao: { type: "string" },
                prazo_sugerido: { type: "string" },
              },
              required: ["descricao", "prazo_sugerido"],
            },
          },
        },
        required: ["competencia", "porque", "objetivo", "acoes"],
      },
    },
    pontos_cegos: { type: "array", items: { type: "string" } },
    resumo: { type: "string" },
  },
  required: ["focos", "pontos_cegos", "resumo"],
};

const sistema = [
  "Você é um business partner de RH sênior da Fast (distribuidora de materiais de construção).",
  "Escreve um Plano de Desenvolvimento Individual (PDI) em português do Brasil, claro e prático, na voz da empresa.",
  "Regras:",
  "1. Trabalhe SOMENTE com os dados fornecidos — nunca invente notas nem informações.",
  "2. Os dados vêm ANONIMIZADOS; refira-se sempre a 'o colaborador', nunca a um nome.",
  "3. Proponha de 1 a 4 focos de desenvolvimento, priorizando as competências de nota mais baixa (1–5).",
  "4. Para cada foco: 'porque' ancorado nas notas, um 'objetivo' claro e de 1 a 3 'acoes' concretas com prazo dentro do horizonte informado.",
  "5. 'pontos_cegos' fica vazio por enquanto (ainda não há autoavaliação). Escreva um 'resumo' curto do plano.",
].join("\n");

const usuario = [
  "Gere o PDI para esta avaliação (dados anonimizados):",
  "",
  "AVALIAÇÃO:",
  JSON.stringify(avaliacao, null, 2),
  "",
  "PARÂMETROS DA ENTREVISTA:",
  JSON.stringify(entrevista, null, 2),
].join("\n");

const client = new Anthropic();

console.log("Chamando claude-opus-5 (structured outputs)…\n");
const inicio = Date.now();
const resposta = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  system: sistema,
  messages: [{ role: "user", content: usuario }],
  output_config: { format: { type: "json_schema", schema: esquema } },
});
const ms = Date.now() - inicio;

if (resposta.stop_reason === "refusal") {
  console.error("Recusa da IA:", resposta.stop_details);
  process.exit(1);
}

const bloco = resposta.content.find((b) => b.type === "text");
const pdi = JSON.parse(bloco.text);

console.log("================= PDI gerado pela IA =================\n");
for (const [i, foco] of pdi.focos.entries()) {
  console.log(`FOCO ${i + 1}: ${foco.competencia}`);
  console.log(`  Por quê:  ${foco.porque}`);
  console.log(`  Objetivo: ${foco.objetivo}`);
  for (const acao of foco.acoes) {
    console.log(`   • ${acao.descricao}  (${acao.prazo_sugerido})`);
  }
  console.log("");
}
console.log("RESUMO:", pdi.resumo);
console.log("\npontos_cegos:", JSON.stringify(pdi.pontos_cegos));

const u = resposta.usage;
const custo = (u.input_tokens / 1e6) * 5 + (u.output_tokens / 1e6) * 25;
console.log("\n================= custo/latência =================");
console.log(
  `tokens: ${u.input_tokens} entrada + ${u.output_tokens} saída | ` +
    `custo ≈ US$ ${custo.toFixed(4)} | ${(ms / 1000).toFixed(1)}s | modelo: ${resposta.model}`
);
