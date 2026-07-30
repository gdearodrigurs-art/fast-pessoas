import { z } from "zod";

// ==================================================================
// Portais — visões consolidadas sobre dado que JÁ EXISTE
// ==================================================================
// Origem: feedback da analista de RH (docs/08-analise-feedback-analista-rh.md,
// seção 6) — "painel do gestor: equipe, férias, avaliações, pendências,
// turnover, treinamentos, alertas".
//
// Este domínio NÃO tem tabela própria e NÃO escreve nada: é leitura que junta
// o que os módulos já guardam. Toda mutação continua na tela do módulo (o
// portal só aponta para lá). Sem migration nesta onda.
//
// Regras herdadas do projeto que valem aqui:
//   - escopo SEMPRE pela relação gestor→liderado VIGENTE (rh.relacao_gestor,
//     fim_vigencia IS NULL) — o papel `gestor` no login só habilita a tela;
//   - cada bloco só entra no payload se a chave do módulo autorizar (nenhuma
//     chave nova foi criada);
//   - dado sensível AUSENTE, não mascarado: o portal mostra o FATO
//     ("afastado hoje", "ASO vencido") e nunca o tipo de afastamento, o CID,
//     a restrição clínica, o motivo do desligamento, a nota/percentual da
//     avaliação ou remuneração.

// ------------------------------------------------------------------ entrada

/** Query da rota: gestor escolhido pelo seletor (DP/RH/diretoria). */
export const esquemaConsultaPortal = z.object({
  gestor_id: z.coerce
    .number("Gestor inválido")
    .int("Gestor inválido")
    .positive("Gestor inválido")
    .optional(),
});

export type ConsultaPortal = z.infer<typeof esquemaConsultaPortal>;

// ------------------------------------------------------------------ réguas

/** Janela do bloco de férias e do painel de vencimento (art. 137). */
export const JANELA_FERIAS_DIAS = 90;

/** Janela do turnover: 12 meses móveis. */
export const JANELA_TURNOVER_MESES = 12;

/**
 * Antecedência do alerta de contrato de experiência. 45 e 90 são marcos
 * LEGAIS (CLT 445/451) e a decisão tem de sair ANTES do vencimento — 15 dias
 * é o aviso que dá tempo de conversar com a pessoa.
 */
export const ANTECEDENCIA_EXPERIENCIA_DIAS = 15;

/** Antecedência do alerta de ASO a vencer (mesma régua do painel de SST). */
export const ANTECEDENCIA_ASO_DIAS = 30;

// ------------------------------------------------------------------ rótulos

export const ROTULO_TREINAMENTOS =
  "Treinamentos da equipe dependem do módulo de Treinamento & Desenvolvimento, " +
  "que não existe neste sistema — hoje o controle vive no Sults. O bloco fica " +
  "aqui, vazio e honesto, em vez de sumir da tela: quando o módulo entrar, é " +
  "esta caixa que passa a listar treinados por curso, carga e pendência.";

/** Grau do alerta — o front decide a cor a partir daqui, sem regra própria. */
export type Gravidade = "critico" | "atencao" | "informativo";

// ------------------------------------------------------------------ tempo de casa

/**
 * Tempo de casa legível a partir dos dias corridos desde a admissão.
 * Puro (testável sem banco) e usado só na exibição.
 */
export function tempoDeCasa(diasDesdeAdmissao: number): string {
  if (diasDesdeAdmissao < 0) return "a admitir";
  const anos = Math.floor(diasDesdeAdmissao / 365);
  const meses = Math.floor((diasDesdeAdmissao % 365) / 30);
  if (anos === 0 && meses === 0) {
    return `${diasDesdeAdmissao} ${diasDesdeAdmissao === 1 ? "dia" : "dias"}`;
  }
  if (anos === 0) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const parteAnos = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  if (meses === 0) return parteAnos;
  return `${parteAnos} e ${meses} ${meses === 1 ? "mês" : "meses"}`;
}
