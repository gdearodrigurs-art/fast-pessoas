import { z } from "zod";

export const CATEGORIAS_DOCUMENTO = [
  "contrato",
  "holerite",
  "politica",
  "comunicado",
  "atestado",
  "outro",
] as const;

export type CategoriaDocumento = (typeof CATEGORIAS_DOCUMENTO)[number];

/**
 * Categoria OCULTA do anexo da pesquisa social (decisão G3:a, conserto A2).
 *
 * Fica FORA de `CATEGORIAS_DOCUMENTO` de propósito, e as três consequências
 * são intencionais:
 *   1. o envio comum do GED (esquemaEnvioMultipart/Base64) NÃO a aceita — só o
 *      registro da pesquisa social (dominios/recrutamento) grava nela;
 *   2. ela não aparece em ABA NENHUMA do acervo: `listar()` a exclui SEMPRE
 *      (repositorio.ts) — o anexo só sai pela rota própria da candidatura ou
 *      pelo download genérico, ambos sob rs.gerir;
 *   3. `decidirVisibilidade` exige rs.gerir — documento.sensivel.ver NÃO basta
 *      (era a porta lateral: diretoria via o anexo sem gerir a seleção).
 */
export const CATEGORIA_PESQUISA_SOCIAL = "pesquisa_social";

// Chaves que a decisão de visibilidade do acervo consome (eixo 4 — decisão por
// chave, nunca por papel). Moram aqui porque a REGRA (decidirVisibilidade) é
// pura e mora aqui; o serviço as consulta no banco e aplica a regra.
export const CHAVE_DOCUMENTO_SENSIVEL_VER = "documento.sensivel.ver";
export const CHAVE_RS_GERIR = "rs.gerir";

export interface ChavesDeAcervo {
  /** documento.ver.todos — RH/DP/diretoria enxergam o acervo inteiro. */
  verTodos: boolean;
  /** documento.sensivel.ver — abre os sensíveis COMUNS, não a pesquisa social. */
  sensivelVer: boolean;
  /** rs.gerir — a ÚNICA chave que alcança o anexo da pesquisa social. */
  rsGerir: boolean;
}

export interface DecisaoVisibilidade {
  visivel: boolean;
  /**
   * Chave que precisa ir a `audit.leitura_sensivel` quando o conteúdo sai —
   * a que DE FATO autorizou (eixo 8). null = leitura comum, sem trilha.
   */
  chaveTrilha: string | null;
}

/**
 * A regra de visibilidade de UM documento do acervo, pura e num lugar só.
 * O serviço (`exigirVisibilidade`) traz os fatos (chaves e vínculos do
 * usuário) e converte `visivel: false` em 404 — ausência, não máscara.
 */
export function decidirVisibilidade(
  documento: {
    colaborador_id: number | null;
    sensivel: boolean;
    categoria: string;
  },
  chaves: ChavesDeAcervo,
  vinculosDoUsuario: readonly number[]
): DecisaoVisibilidade {
  // A2: anexo de pesquisa social só existe para quem gere a seleção. A chave
  // de sensível NÃO basta — o documento é sensível E de categoria própria, e
  // a categoria manda. A trilha grava rs.gerir, a chave que autorizou.
  if (documento.categoria === CATEGORIA_PESQUISA_SOCIAL) {
    return chaves.rsGerir
      ? { visivel: true, chaveTrilha: CHAVE_RS_GERIR }
      : { visivel: false, chaveTrilha: null };
  }
  if (
    !chaves.verTodos &&
    documento.colaborador_id !== null &&
    !vinculosDoUsuario.includes(documento.colaborador_id)
  ) {
    return { visivel: false, chaveTrilha: null };
  }
  if (documento.sensivel && !chaves.sensivelVer) {
    return { visivel: false, chaveTrilha: null };
  }
  return {
    visivel: true,
    chaveTrilha: documento.sensivel ? CHAVE_DOCUMENTO_SENSIVEL_VER : null,
  };
}

export const ROTULOS_CATEGORIA: Record<CategoriaDocumento, string> = {
  contrato: "Contrato",
  holerite: "Holerite",
  politica: "Política",
  comunicado: "Comunicado",
  atestado: "Atestado",
  outro: "Outro",
};

/**
 * As duas abas do acervo. Separam o que a empresa PUBLICA para todo mundo do
 * que é DA PESSOA — são leituras diferentes do mesmo acervo, não permissões
 * diferentes: quem pode ver menos continua vendo menos nas duas.
 */
export const ABAS_DOCUMENTO = ["publicacoes", "pessoa"] as const;

export type AbaDocumento = (typeof ABAS_DOCUMENTO)[number];

export const ROTULOS_ABA: Record<AbaDocumento, string> = {
  publicacoes: "Políticas e comunicados",
  pessoa: "Documentos da pessoa",
};

/**
 * Toda categoria mora em exatamente uma aba. O `Record` é exaustivo de
 * propósito: acrescentar categoria em `CATEGORIAS_DOCUMENTO` sem dizer a aba
 * dela não compila. Sem isso, a categoria nova sumiria das duas abas e o
 * documento ficaria invisível sem ninguém perceber.
 */
export const ABA_DA_CATEGORIA: Record<CategoriaDocumento, AbaDocumento> = {
  politica: "publicacoes",
  comunicado: "publicacoes",
  contrato: "pessoa",
  holerite: "pessoa",
  atestado: "pessoa",
  outro: "pessoa",
};

/** Categoria desconhecida (dado antigo) cai em "Documentos da pessoa". */
export function abaDaCategoria(categoria: string): AbaDocumento {
  return (
    ABA_DA_CATEGORIA[categoria as CategoriaDocumento] ?? ABA_DA_CATEGORIA.outro
  );
}

export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

const esquemaTitulo = z
  .string()
  .trim()
  .min(3, "Informe o título do documento")
  .max(200);

const esquemaNomeArquivo = z
  .string()
  .trim()
  .min(1, "Informe o nome do arquivo")
  .max(255);

/**
 * Lista fechada do que pode ser guardado no GED.
 *
 * Esta lista NÃO é administrável pela tela, e é de propósito: o eixo "nada
 * chumbado" trata de limite, prazo e lista de NEGÓCIO — o que pode virar
 * arquivo no servidor é fronteira de segurança. Deixar um operador acrescentar
 * `application/x-msdownload` por uma tela seria entregar a chave.
 *
 * PDF é obrigatório aqui: é o formato que a assinatura gov.br exige.
 */
export const MIMES_PERMITIDOS = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "image/jpeg",
  "image/png",
] as const;

export const ROTULOS_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word (.doc)",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word (.docx)",
  "text/plain": "Texto",
  "image/jpeg": "Imagem JPEG",
  "image/png": "Imagem PNG",
};

/**
 * Como o pop-up "Visualizar" trata cada tipo aceito.
 *
 * O `Record` é exaustivo sobre `MIMES_PERMITIDOS`: liberar um formato novo no
 * GED obriga a dizer, aqui, como ele aparece na tela — ou não compila. É o que
 * impede o caso ruim, que é despejar binário como se fosse texto.
 *
 * Word não abre em navegador nenhum: `.doc` e `.docx` são zip/OLE, e o que
 * apareceria é lixo. Nesse caso o pop-up avisa e oferece o download.
 */
export type ModoVisualizacao = "texto" | "pdf" | "imagem" | "nao_exibivel";

export const MODO_VISUALIZACAO: Record<
  (typeof MIMES_PERMITIDOS)[number],
  ModoVisualizacao
> = {
  "application/pdf": "pdf",
  "application/msword": "nao_exibivel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "nao_exibivel",
  "text/plain": "texto",
  "image/jpeg": "imagem",
  "image/png": "imagem",
};

/**
 * MIME fora da lista (arquivo guardado antes da lista fechada existir) cai em
 * `nao_exibivel`. O padrão é NÃO renderizar: melhor oferecer o download do que
 * arriscar mostrar bytes crus.
 */
export function modoDeVisualizacao(mime: string): ModoVisualizacao {
  return (
    MODO_VISUALIZACAO[mime as (typeof MIMES_PERMITIDOS)[number]] ??
    "nao_exibivel"
  );
}

export function rotuloDeMime(mime: string): string {
  return ROTULOS_MIME[mime] ?? mime;
}

const esquemaMime = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w.+-]+\/[\w.+-]+$/, "Tipo MIME inválido")
  .refine(
    (valor) => (MIMES_PERMITIDOS as readonly string[]).includes(valor),
    `Tipo de arquivo não aceito. Aceitos: ${MIMES_PERMITIDOS.map(
      (mime) => ROTULOS_MIME[mime]
    ).join(", ")}.`
  );

/**
 * Regras cruzadas do CICLO DE CIÊNCIA no envio (decisões B1/B3, docs/20):
 * bloqueante é um modo de exige_ciencia; prazo só existe na política não
 * bloqueante (o bloqueante trava desde o 1º acesso — prazo nele seria promessa
 * falsa); e o ciclo é do ACERVO GERAL — documento de colaborador não entra.
 * Os mesmos CHECKs existem no banco (0086); aqui viram mensagem de campo.
 */
function validarCicloEnvio(
  dados: {
    sensivel: boolean;
    exige_ciencia: boolean;
    bloqueante: boolean;
    prazo_ciencia_dias?: number;
    substitui_documento_id?: number;
    colaborador_id?: number;
  },
  contexto: z.core.$RefinementCtx
): void {
  // Documento SENSÍVEL não entra no ciclo: a pendência anunciaria o título a
  // todo o quadro, e a ciência exige ler até o fim — o que colide com a chave
  // documento.sensivel.ver, que esconde o documento de quem não a tem. Quem
  // não pode VER não pode ficar devendo ciência do que não vê.
  if (dados.sensivel && (dados.exige_ciencia || dados.bloqueante)) {
    contexto.addIssue({
      code: "custom",
      path: ["sensivel"],
      message:
        "Documento sensível não entra no ciclo de ciência — publique-o sem exigir ciência, ou publique no ciclo uma versão não sensível.",
    });
  }
  if (dados.bloqueante && !dados.exige_ciencia) {
    contexto.addIssue({
      code: "custom",
      path: ["bloqueante"],
      message: "Documento bloqueante precisa exigir ciência.",
    });
  }
  if (dados.prazo_ciencia_dias !== undefined && !dados.exige_ciencia) {
    contexto.addIssue({
      code: "custom",
      path: ["prazo_ciencia_dias"],
      message: "Prazo de ciência só vale para documento que exige ciência.",
    });
  }
  if (dados.prazo_ciencia_dias !== undefined && dados.bloqueante) {
    contexto.addIssue({
      code: "custom",
      path: ["prazo_ciencia_dias"],
      message:
        "Documento bloqueante não tem prazo: ele trava o acesso desde o primeiro acesso.",
    });
  }
  if (dados.exige_ciencia && dados.colaborador_id !== undefined) {
    contexto.addIssue({
      code: "custom",
      path: ["exige_ciencia"],
      message:
        "O ciclo de ciência é do acervo geral — documento de colaborador não exige ciência de todos.",
    });
  }
  if (
    dados.substitui_documento_id !== undefined &&
    dados.colaborador_id !== undefined
  ) {
    contexto.addIssue({
      code: "custom",
      path: ["substitui_documento_id"],
      message:
        "Versão nova na cadeia é do acervo geral — documento de colaborador não substitui.",
    });
  }
}

/**
 * O envio PUBLICA NO CICLO de ciência? (A4) Pendência para o quadro inteiro,
 * bloqueio de acesso ou versão nova reabrindo a cadeia é gestão do rito, não
 * envio comum de arquivo: além de documento.enviar (a porta da rota), o
 * serviço exige rh.conduta.gerir (dp/diretoria, 0086) quando isto é true.
 */
export function envioEntraNoCiclo(metadados: {
  exige_ciencia: boolean;
  bloqueante: boolean;
  substitui_documento_id: number | null;
}): boolean {
  return (
    metadados.exige_ciencia ||
    metadados.bloqueante ||
    metadados.substitui_documento_id !== null
  );
}

const booleanoMultipart = z
  .enum(["true", "false"])
  .transform((valor) => valor === "true");

const esquemaPrazoDias = z.coerce
  .number("Prazo inválido")
  .int("Prazo inválido")
  .min(1, "Prazo mínimo: 1 dia")
  .max(365, "Prazo máximo: 365 dias");

/** Metadados vindos de multipart/form-data — todo campo chega como texto. */
export const esquemaEnvioMultipart = z
  .object({
    categoria: z.enum(CATEGORIAS_DOCUMENTO),
    titulo: esquemaTitulo,
    sensivel: z.enum(["true", "false"]).transform((valor) => valor === "true"),
    colaborador_id: z.coerce
      .number("Colaborador inválido")
      .int("Colaborador inválido")
      .positive("Colaborador inválido")
      .optional(),
    exige_ciencia: booleanoMultipart,
    bloqueante: booleanoMultipart,
    prazo_ciencia_dias: esquemaPrazoDias.optional(),
    substitui_documento_id: z.coerce
      .number("Documento substituído inválido")
      .int("Documento substituído inválido")
      .positive("Documento substituído inválido")
      .optional(),
  })
  .superRefine(validarCicloEnvio);

/** Envio em JSON com o conteúdo em base64 — alternativa ao multipart. */
export const esquemaEnvioBase64 = z
  .object({
    categoria: z.enum(CATEGORIAS_DOCUMENTO),
    titulo: esquemaTitulo,
    sensivel: z.boolean(),
    colaborador_id: z.number().int().positive().optional(),
    exige_ciencia: z.boolean().default(false),
    bloqueante: z.boolean().default(false),
    prazo_ciencia_dias: z.number().int().min(1).max(365).optional(),
    substitui_documento_id: z.number().int().positive().optional(),
    nome_arquivo: esquemaNomeArquivo,
    mime: esquemaMime,
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
  .superRefine(validarCicloEnvio);

export type EnvioBase64 = z.infer<typeof esquemaEnvioBase64>;

/** Metadados normalizados que o serviço recebe, seja qual for o formato de envio. */
export interface MetadadosEnvio {
  categoria: CategoriaDocumento;
  titulo: string;
  sensivel: boolean;
  colaborador_id: number | null;
  exige_ciencia: boolean;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  substitui_documento_id: number | null;
}

// ===========================================================================
// Ciclo de ciência (0086) — entradas das rotas do ciclo
// ===========================================================================

/** Recusa do PRÓPRIO usuário: "li e não aceito". Motivo é opcional. */
export const esquemaRecusa = z.object({
  motivo: z.string().trim().min(1).max(500).optional(),
});

/**
 * Abertura do ato formal pelo DP (B2): a pessoa, de onde o ato nasce e as DUAS
 * testemunhas — usuários do sistema, distintos entre si e da pessoa do ato.
 */
export const esquemaAbrirAto = z
  .object({
    usuario_id: z.number().int().positive(),
    origem: z.enum(["recusa", "prazo_vencido"]),
    descricao: z
      .string()
      .trim()
      .min(5, "Descreva o ato (mínimo 5 caracteres)")
      .max(2000),
    testemunhas: z
      .array(z.number().int().positive())
      .length(2, "O ato exige exatamente 2 testemunhas"),
  })
  .superRefine((dados, contexto) => {
    if (dados.testemunhas[0] === dados.testemunhas[1]) {
      contexto.addIssue({
        code: "custom",
        path: ["testemunhas"],
        message: "As 2 testemunhas precisam ser pessoas diferentes.",
      });
    }
    if (dados.testemunhas.includes(dados.usuario_id)) {
      contexto.addIssue({
        code: "custom",
        path: ["testemunhas"],
        message: "A pessoa do ato não pode ser testemunha do próprio ato.",
      });
    }
  });

/** Ações sobre um ato já aberto: confirmar testemunho ou registrar desfecho. */
export const esquemaAcaoAto = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("confirmar"),
    ato_id: z.number().int().positive(),
  }),
  z.object({
    acao: z.literal("desfecho"),
    ato_id: z.number().int().positive(),
    desfecho: z
      .string()
      .trim()
      .min(5, "Descreva o desfecho (mínimo 5 caracteres)")
      .max(2000),
  }),
]);

/** Liberação explícita (B6) — chave rh.conduta.liberar. */
export const esquemaLiberar = z.object({
  usuario_id: z.number().int().positive(),
  justificativa: z
    .string()
    .trim()
    .min(5, "Justifique a liberação (mínimo 5 caracteres)")
    .max(2000),
});

// ===========================================================================
// Ciclo de ciência — a REGRA de estado e bloqueio, pura e num lugar só.
// O repositório traz os FATOS (tem ciência? recusa? ato? liberação? venceu?);
// estas funções dizem o que os fatos significam. B1/B4/B6 moram aqui.
// ===========================================================================

export interface SituacaoPendencia {
  /** O documento é o bloqueante (Código de Conduta). */
  bloqueante: boolean;
  temCiencia: boolean;
  temRecusa: boolean;
  /** Existe ato formal registrado (recusa ou prazo vencido). */
  temAto: boolean;
  temLiberacao: boolean;
  /** O prazo (quando existe) já venceu para este usuário. */
  vencida: boolean;
}

export type EstadoPendencia =
  | "assinado"
  | "liberado"
  | "recusado"
  | "vencido"
  | "pendente";

export const ROTULOS_ESTADO_PENDENCIA: Record<EstadoPendencia, string> = {
  assinado: "Ciência dada",
  liberado: "Liberado",
  recusado: "Recusou",
  vencido: "Prazo vencido",
  pendente: "Pendente",
};

/** O estado que o quadro do ciclo exibe para uma pessoa numa versão. */
export function estadoDaPendencia(situacao: SituacaoPendencia): EstadoPendencia {
  if (situacao.temCiencia) return "assinado";
  if (situacao.temLiberacao) return "liberado";
  if (situacao.temRecusa) return "recusado";
  if (situacao.vencida) return "vencido";
  return "pendente";
}

/**
 * O acesso desta pessoa está BLOQUEADO por esta pendência?
 *
 *   * ciência ou liberação destravam SEMPRE (a rota de regularização nunca
 *     fecha — B4);
 *   * documento bloqueante pendente trava (B1), inclusive recusado (B6:
 *     recusar não destrava);
 *   * política não bloqueante só trava quando o DP REGISTRA O ATO (B6:
 *     "vencido com ato registrado segue bloqueado até liberação") — prazo
 *     vencido sozinho lembra, não trava (B1).
 */
export function pendenciaBloqueia(situacao: SituacaoPendencia): boolean {
  if (situacao.temCiencia || situacao.temLiberacao) return false;
  return situacao.bloqueante || situacao.temAto;
}
