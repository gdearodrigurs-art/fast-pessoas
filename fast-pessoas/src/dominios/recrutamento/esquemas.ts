import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";
import { cpfValido, TIPOS_VINCULO } from "../colaboradores/esquemas";
import {
  MIMES_PERMITIDOS,
  ROTULOS_MIME,
  TAMANHO_MAXIMO_BYTES,
} from "../documentos/esquemas";

// ------------------------------------------------------------------ requisição de vaga

export const MOTIVOS_REQUISICAO = ["reposicao", "aumento_quadro"] as const;

export type MotivoRequisicao = (typeof MOTIVOS_REQUISICAO)[number];

export const ROTULOS_MOTIVO_REQUISICAO: Record<MotivoRequisicao, string> = {
  reposicao: "Reposição",
  aumento_quadro: "Aumento de quadro",
};

export const STATUS_REQUISICAO = [
  "solicitada",
  "aprovada",
  "reprovada",
] as const;

export type StatusRequisicao = (typeof STATUS_REQUISICAO)[number];

export const ROTULOS_STATUS_REQUISICAO: Record<StatusRequisicao, string> = {
  solicitada: "Solicitada",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
};

// ------------------------------------------------------------------ vaga

export const STATUS_VAGA = [
  "aberta",
  "congelada",
  "fechada",
  "cancelada",
] as const;

export type StatusVaga = (typeof STATUS_VAGA)[number];

export const ROTULOS_STATUS_VAGA: Record<StatusVaga, string> = {
  aberta: "Aberta",
  congelada: "Congelada",
  fechada: "Fechada",
  cancelada: "Cancelada",
};

// ------------------------------------------------------------------ candidato

export const ORIGENS_CANDIDATO = [
  "indicacao",
  "site",
  "portal",
  "outro",
] as const;

export type OrigemCandidato = (typeof ORIGENS_CANDIDATO)[number];

export const ROTULOS_ORIGEM: Record<OrigemCandidato, string> = {
  indicacao: "Indicação",
  site: "Site",
  portal: "Portal externo",
  outro: "Outro",
};

/** Retenção estendida padrão do consentimento LGPD (banco de talentos). */
export const MESES_CONSENTIMENTO_PADRAO = 6;

// ------------------------------------------------------------------ candidatura e pipeline

export const STATUS_CANDIDATURA = [
  "ativa",
  "reprovada",
  "desistiu",
  "aprovada",
] as const;

export type StatusCandidatura = (typeof STATUS_CANDIDATURA)[number];

export const ROTULOS_STATUS_CANDIDATURA: Record<StatusCandidatura, string> = {
  ativa: "Em seleção",
  reprovada: "Reprovada",
  desistiu: "Desistiu",
  aprovada: "Aprovada",
};

/**
 * Catálogo controlado de motivos (Lei 9.029: nunca texto livre persistido
 * como motivo de desfecho negativo).
 */
export const MOTIVOS_MOVIMENTACAO = [
  "perfil",
  "experiencia",
  "salario",
  "comportamental",
  "desistencia",
  "outro",
] as const;

export type MotivoMovimentacao = (typeof MOTIVOS_MOVIMENTACAO)[number];

export const ROTULOS_MOTIVO_MOVIMENTACAO: Record<MotivoMovimentacao, string> = {
  perfil: "Perfil não aderente à vaga",
  experiencia: "Experiência insuficiente",
  salario: "Pretensão salarial",
  comportamental: "Aspecto comportamental",
  desistencia: "Desistência do candidato",
  outro: "Outro",
};

// ------------------------------------------------------------------ parecer

export const RECOMENDACOES_PARECER = [
  "aprovar",
  "reprovar",
  "duvida",
] as const;

export type RecomendacaoParecer = (typeof RECOMENDACOES_PARECER)[number];

export const ROTULOS_RECOMENDACAO: Record<RecomendacaoParecer, string> = {
  aprovar: "Aprovar",
  reprovar: "Reprovar",
  duvida: "Em dúvida",
};

// ------------------------------------------------------------------ pesquisa social (#13c, G3:a)

export const RESULTADOS_PESQUISA_SOCIAL = ["aprovado", "reprovado"] as const;

export type ResultadoPesquisaSocial =
  (typeof RESULTADOS_PESQUISA_SOCIAL)[number];

export const ROTULOS_RESULTADO_PESQUISA_SOCIAL: Record<
  ResultadoPesquisaSocial,
  string
> = {
  aprovado: "Pesquisa social aprovada",
  reprovado: "Pesquisa social reprovada",
};

/**
 * Retenção do desfecho + anexo (G3:a, N respondido pelo dono = 6): expurga-se
 * junto do descarte da candidatura recusada após 6 meses. Mesmo molde do
 * MESES_CONSENTIMENTO_PADRAO acima — prazo de política de dados, não parâmetro
 * operacional de tela.
 */
export const MESES_RETENCAO_PESQUISA_SOCIAL = 6;

/**
 * Data-limite do expurgo: candidatura descartada ATÉ esta data (inclusive) já
 * completou a janela de retenção. Aritmética de calendário em UTC, o mesmo
 * comportamento de somarMeses do consentimento (31/xx transborda para o mês
 * seguinte — aceito, igual lá).
 */
export function dataCorteExpurgo(
  hojeIso: string,
  meses: number = MESES_RETENCAO_PESQUISA_SOCIAL
): string {
  const [ano, mes, dia] = hojeIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1 - meses, dia))
    .toISOString()
    .slice(0, 10);
}

/**
 * A regra pura do GATE de avanço na etapa de pesquisa social: dela só se sai
 * para a frente com desfecho APROVADO. Sem desfecho, a etapa ainda não
 * aconteceu; REPROVADO não avança (decisão #13c) — o caminho é reprovar a
 * candidatura com motivo do catálogo (Lei 9.029) ou registrar a desistência.
 * Devolve a mensagem do bloqueio, ou null quando o avanço está livre.
 */
export function bloqueioDeAvancoPesquisaSocial(
  etapaTipo: string,
  resultado: ResultadoPesquisaSocial | null
): string | null {
  if (etapaTipo !== "pesquisa_social") return null;
  if (resultado === "aprovado") return null;
  if (resultado === "reprovado") {
    return "Pesquisa social reprovada não avança — reprove a candidatura com motivo do catálogo (ou registre a desistência).";
  }
  return "Registre o desfecho da pesquisa social antes de avançar o candidato.";
}

// ------------------------------------------------------------------ oferta

export const STATUS_OFERTA = ["enviada", "aceita", "recusada"] as const;

export type StatusOferta = (typeof STATUS_OFERTA)[number];

export const ROTULOS_STATUS_OFERTA: Record<StatusOferta, string> = {
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
};

// ------------------------------------------------------------------ validação de entrada

const esquemaCpf = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{11}$/.test(valor), {
    message: "CPF deve ter 11 dígitos",
  })
  .refine(cpfValido, { message: "CPF inválido" });

export const esquemaCriacaoRequisicao = z.object({
  cargo_id: z.number().int().positive(),
  estabelecimento_id: z.number().int().positive().nullable().optional(),
  motivo: z.enum(MOTIVOS_REQUISICAO),
  justificativa: z
    .string()
    .trim()
    .min(1, "A justificativa é obrigatória")
    .max(4000, "Justificativa longa demais"),
});

export type CriacaoRequisicao = z.infer<typeof esquemaCriacaoRequisicao>;

export const esquemaDecisaoRequisicao = z.object({
  decisao: z.enum(["aprovar", "reprovar"]),
  motivo: z
    .string()
    .trim()
    .min(1, "O motivo da decisão é obrigatório")
    .max(2000, "Motivo longo demais"),
});

export type DecisaoRequisicao = z.infer<typeof esquemaDecisaoRequisicao>;

export const esquemaCriacaoVaga = z.object({
  requisicao_id: z.number().int().positive(),
  titulo: z.string().trim().min(1, "Informe o título da vaga").max(200),
  prazo_alvo: esquemaData,
  /** Modelo de processo a congelar. Omitido: a vaga usa o GERAL (padrão). */
  modelo_versao_id: z.number().int().positive().optional(),
});

export type CriacaoVaga = z.infer<typeof esquemaCriacaoVaga>;

export const esquemaCriacaoModelo = z.object({
  nome: z.string().trim().min(1, "Informe o nome do modelo").max(120),
  etapa_ids: z
    .array(z.number().int().positive())
    .min(1, "Escolha ao menos uma etapa para o modelo"),
});

export type CriacaoModelo = z.infer<typeof esquemaCriacaoModelo>;

// ------------------------------------------------------------------ desenho do modelo de processo

export interface EtapaCatalogoSelecao {
  id: number;
  tipo: string;
  nome: string;
}

export type SequenciaValidada =
  | { ok: true; etapas: EtapaCatalogoSelecao[] }
  | { ok: false; status: 400 | 409; mensagem: string };

/**
 * A regra de desenho de um modelo de processo, pura (criar E reformular
 * passam por aqui): etapas do catálogo vigente, sem repetição, e a OFERTA
 * como ÚLTIMA etapa — o kanban trata a oferta como o fim do processo (esconde
 * "Avançar" na última etapa e só oferece "Registrar oferta" numa etapa tipo
 * oferta). Uma etapa DEPOIS da oferta deixaria a candidatura num beco: sem
 * avançar, sem ofertar e sem como recriá-la (UNIQUE vaga+candidato). Como o
 * catálogo tem no máximo uma etapa de oferta ativa, exigir que a última seja
 * de oferta já garante presença + terminalidade. O serviço traduz o resultado
 * em erro HTTP; aqui é só a regra, sem dependência de infraestrutura.
 */
export function validarSequenciaDeEtapas(
  catalogo: EtapaCatalogoSelecao[],
  etapaIds: number[]
): SequenciaValidada {
  const porId = new Map(catalogo.map((etapa) => [etapa.id, etapa]));
  const vistos = new Set<number>();
  const escolhidas: EtapaCatalogoSelecao[] = [];
  for (const id of etapaIds) {
    if (vistos.has(id)) {
      return {
        ok: false,
        status: 400,
        mensagem: "A mesma etapa aparece duas vezes no modelo.",
      };
    }
    const etapa = porId.get(id);
    if (!etapa) {
      return {
        ok: false,
        status: 409,
        mensagem: "Uma das etapas escolhidas não existe ou não está ativa.",
      };
    }
    vistos.add(id);
    escolhidas.push(etapa);
  }
  if (
    escolhidas.length === 0 ||
    escolhidas[escolhidas.length - 1].tipo !== "oferta"
  ) {
    return {
      ok: false,
      status: 409,
      mensagem:
        "A etapa de oferta tem que ser a última do modelo — é onde a proposta é registrada e o processo termina; nada pode vir depois dela.",
    };
  }
  return { ok: true, etapas: escolhidas };
}

/**
 * Troca do modelo congelado de uma vaga ABERTA e SEM candidatura (decisão G1:
 * reformular um modelo NÃO migra vaga aberta — quem quiser a versão nova troca
 * manualmente por aqui, enquanto ninguém entrou no pipeline).
 */
export const esquemaTrocaModeloVaga = z.object({
  modelo_versao_id: z.number().int().positive(),
});

export type TrocaModeloVaga = z.infer<typeof esquemaTrocaModeloVaga>;

export const esquemaCriacaoCandidato = z.object({
  nome: z.string().trim().min(3, "Informe o nome do candidato").max(200),
  email: z.email("E-mail inválido").max(254),
  telefone: z.string().trim().max(20).optional(),
  cpf: esquemaCpf.optional(),
  origem: z.enum(ORIGENS_CANDIDATO),
  consentimento_lgpd: z.boolean().refine((valor) => valor, {
    message:
      "O cadastro manual exige o consentimento LGPD registrado do candidato",
  }),
  /** Sem valor informado, o serviço aplica hoje + 6 meses (retenção padrão). */
  consentido_ate: esquemaData.optional(),
});

export type CriacaoCandidato = z.infer<typeof esquemaCriacaoCandidato>;

export const esquemaCriacaoCandidatura = z.object({
  vaga_id: z.number().int().positive(),
  candidato_id: z.number().int().positive(),
});

export type CriacaoCandidatura = z.infer<typeof esquemaCriacaoCandidatura>;

export const esquemaMovimentacao = z
  .object({
    acao: z.enum(["avancar", "reprovar"]),
    motivo_catalogo: z.enum(MOTIVOS_MOVIMENTACAO).optional(),
    observacao: z.string().trim().max(2000).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.acao === "reprovar" && !dados.motivo_catalogo) {
      contexto.addIssue({
        code: "custom",
        path: ["motivo_catalogo"],
        message: "Reprovação exige motivo do catálogo",
      });
    }
  });

export type Movimentacao = z.infer<typeof esquemaMovimentacao>;

export const esquemaParecer = z.object({
  recomendacao: z.enum(RECOMENDACOES_PARECER),
  observacoes: z
    .string()
    .trim()
    .min(1, "Escreva o parecer")
    .max(4000, "Parecer longo demais"),
});

export type CriacaoParecer = z.infer<typeof esquemaParecer>;

/**
 * Desfecho da pesquisa social + anexo OPCIONAL, no caminho JSON base64 do GED
 * (molde esquemaEnvioBase64 de api/documentos POST). O anexo vai para
 * rh.documento (categoria "outro", sensível) pelo armazenamento do GED; o
 * vínculo fica em rh.pesquisa_social.
 */
export const esquemaPesquisaSocial = z.object({
  resultado: z.enum(RESULTADOS_PESQUISA_SOCIAL),
  anexo: z
    .object({
      nome_arquivo: z
        .string()
        .trim()
        .min(1, "Informe o nome do arquivo")
        .max(255),
      mime: z
        .string()
        .trim()
        .max(100)
        .refine(
          (valor) => (MIMES_PERMITIDOS as readonly string[]).includes(valor),
          `Tipo de arquivo não aceito. Aceitos: ${MIMES_PERMITIDOS.map(
            (mime) => ROTULOS_MIME[mime]
          ).join(", ")}.`
        ),
      conteudo_base64: z
        .string()
        .min(1, "Conteúdo do arquivo ausente")
        // 10 MB em base64 ocupam ~13,4 MB de texto — rejeita antes de decodificar
        .max(
          Math.ceil((TAMANHO_MAXIMO_BYTES * 4) / 3) + 4,
          "Arquivo excede o limite de 10 MB"
        )
        .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Conteúdo base64 inválido"),
    })
    .optional(),
});

export type RegistroPesquisaSocial = z.infer<typeof esquemaPesquisaSocial>;

export const esquemaCriacaoOferta = z.object({
  valor: z
    .number()
    .positive("Informe um valor maior que zero")
    .max(9999999999, "Valor fora do intervalo aceito"),
  aprovacao_fora_banda: z.string().trim().min(1).max(2000).optional(),
});

export type CriacaoOferta = z.infer<typeof esquemaCriacaoOferta>;

export const esquemaRespostaOferta = z
  .object({
    resposta: z.enum(["aceita", "recusada"]),
    motivo_catalogo: z.enum(MOTIVOS_MOVIMENTACAO).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.resposta === "recusada" && !dados.motivo_catalogo) {
      contexto.addIssue({
        code: "custom",
        path: ["motivo_catalogo"],
        message: "Recusa exige motivo do catálogo",
      });
    }
  });

export type RespostaOferta = z.infer<typeof esquemaRespostaOferta>;

export const esquemaIniciarAdmissao = z.object({
  matricula: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Matrícula deve conter apenas números"),
  cpf: esquemaCpf,
  tipo_vinculo: z.enum(TIPOS_VINCULO),
  data_inicio_prevista: esquemaData,
  contrato_experiencia: z.boolean(),
});

export type IniciarAdmissao = z.infer<typeof esquemaIniciarAdmissao>;
