import { createHash } from "node:crypto";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { notificar, notificarLote } from "../notificacoes/servico";
import { ArmazenamentoDocumentos, armazenamentoBytea } from "./armazenamento";
import {
  CategoriaDocumento,
  envioEntraNoCiclo,
  EstadoPendencia,
  estadoDaPendencia,
  formatarTamanho,
  MetadadosEnvio,
  MIMES_PERMITIDOS,
  modoDeVisualizacao,
  pendenciaBloqueia,
  ROTULOS_CATEGORIA,
  ROTULOS_MIME,
  SituacaoPendencia,
  TAMANHO_MAXIMO_BYTES,
} from "./esquemas";
import {
  AtoDoCiclo,
  atosDoDocumento,
  buscarAto,
  buscarAtoDoUsuario,
  buscarColaborador,
  buscarLiberacao,
  buscarMetadados,
  buscarRecusa,
  buscarTestemunha,
  buscarUsuarioBasico,
  cienciaExiste,
  confirmarTestemunha,
  DocumentoLista,
  inserirAto,
  inserirCiencia,
  inserirLiberacao,
  inserirRecusa,
  inserirTestemunha,
  listar,
  MetadadosDocumento,
  PendenciaLinha,
  pendenciasDoUsuario,
  QuadroPessoa,
  quadroDoCiclo,
  registrarDesfecho,
  registrarLeituraSensivel,
  TestemunhoPendente,
  testemunhosPendentesDoUsuario,
  usuariosAtivos,
  usuariosPendentesDoDocumento,
  vinculosDoUsuario,
} from "./repositorio";

const TABELA_DOCUMENTO = "rh.documento";
const TABELA_CIENCIA = "rh.ciencia";
// A chave de ENVIO (`documento.enviar`) é conferida na porta da rota
// (POST /api/documentos) e não aqui: este serviço só lê e registra ciência.
// Escopo de leitura tem chave PRÓPRIA (migration 0024): quem envia arquivo não
// herda, por isso, o direito de ler o documento de todo o quadro — era o furo
// que deixava recrutador e T&D vendo contrato de qualquer pessoa.
const CHAVE_VER_TODOS = "documento.ver.todos";
const CHAVE_SENSIVEL_VER = "documento.sensivel.ver";

// Ponto único de troca por object storage — o serviço só conhece a interface.
const armazenamento: ArmazenamentoDocumentos = armazenamentoBytea;

export interface ArquivoEnvio {
  nome: string;
  mime: string;
  conteudo: Buffer;
}

async function temPermissao(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return linhas[0]?.autorizado === true;
}

/**
 * Visibilidade de um documento específico. Escopo "todos" segue a chave
 * documento.ver.todos (RH/DP/diretoria) — checagem por chave, nunca por papel.
 * Fora do escopo ou sensível sem documento.sensivel.ver: 404 — ausência,
 * não máscara; quem não pode ver nem sabe que o documento existe.
 */
async function exigirVisibilidade(
  sessao: PayloadSessao,
  metadados: MetadadosDocumento
): Promise<void> {
  const verTodos = await temPermissao(sessao.usuario_id, CHAVE_VER_TODOS);
  if (!verTodos && metadados.colaborador_id !== null) {
    // Pela PESSOA, não pelo contrato corrente: o documento do vínculo anterior
    // no mesmo grupo continua sendo de quem está pedindo.
    const meusVinculos = await vinculosDoUsuario(sessao.usuario_id);
    if (!meusVinculos.includes(metadados.colaborador_id)) {
      throw new ErroHttp(404, "Documento não encontrado.");
    }
  }
  if (
    metadados.sensivel &&
    !(await temPermissao(sessao.usuario_id, CHAVE_SENSIVEL_VER))
  ) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
}

async function gravarLeituraSensivel(
  usuarioId: number,
  registroIds: string[]
): Promise<void> {
  if (registroIds.length === 0) return;
  await comTransacao(usuarioId, async (cliente) => {
    for (const registroId of registroIds) {
      await registrarLeituraSensivel(cliente, {
        usuarioId,
        chavePermissao: CHAVE_SENSIVEL_VER,
        recurso: TABELA_DOCUMENTO,
        registroId,
      });
    }
  });
}

export async function listarDocumentos(
  sessao: PayloadSessao,
  incluirSensiveis: boolean
): Promise<DocumentoLista[]> {
  if (
    incluirSensiveis &&
    !(await temPermissao(sessao.usuario_id, CHAVE_SENSIVEL_VER))
  ) {
    throw new ErroHttp(403, "Sem permissão para ver documentos sensíveis.");
  }
  const verTodos = await temPermissao(sessao.usuario_id, CHAVE_VER_TODOS);
  const vinculos = verTodos ? [] : await vinculosDoUsuario(sessao.usuario_id);
  const documentos = await listar({
    usuarioId: sessao.usuario_id,
    verTodos,
    vinculosDoUsuario: vinculos,
    incluirSensiveis,
  });
  if (incluirSensiveis) {
    await gravarLeituraSensivel(
      sessao.usuario_id,
      documentos
        .filter((documento) => documento.sensivel)
        .map((documento) => String(documento.id))
    );
  }
  return documentos;
}

export async function enviarDocumento(
  sessao: PayloadSessao,
  metadados: MetadadosEnvio,
  arquivo: ArquivoEnvio
): Promise<DocumentoLista> {
  if (arquivo.conteudo.length === 0) {
    throw new ErroHttpCampo(400, "O arquivo está vazio.", "arquivo");
  }
  if (arquivo.conteudo.length > TAMANHO_MAXIMO_BYTES) {
    throw new ErroHttpCampo(
      413,
      "Arquivo excede o limite de 10 MB.",
      "arquivo"
    );
  }
  const nomeArquivo = arquivo.nome.trim().slice(0, 255) || "documento";
  // A trava mora AQUI, e não só no esquema de entrada: o caminho multipart não
  // passa por zod nenhum — a rota lê `arquivo.type` do File e entrega direto.
  // Os dois caminhos (multipart e base64) convergem neste ponto, então é aqui
  // que a lista fechada vale para os dois.
  const mime = arquivo.mime.trim().slice(0, 100);
  if (!(MIMES_PERMITIDOS as readonly string[]).includes(mime)) {
    throw new ErroHttpCampo(
      415,
      `Tipo de arquivo não aceito${mime ? ` (${mime})` : ""}. Aceitos: ${MIMES_PERMITIDOS.map(
        (permitido) => ROTULOS_MIME[permitido]
      ).join(", ")}.`,
      "arquivo"
    );
  }

  // B5: a ciência exige LER ATÉ O FIM — logo o documento do ciclo precisa ser
  // exibível no navegador. Word entraria no acervo mas nunca colheria ciência;
  // melhor recusar na porta do que criar pendência impossível de cumprir.
  if (
    metadados.exige_ciencia &&
    modoDeVisualizacao(mime) === "nao_exibivel"
  ) {
    throw new ErroHttpCampo(
      400,
      "Documento que exige ciência precisa ser exibível no navegador (PDF, texto ou imagem): a ciência só habilita ao ler até o fim.",
      "arquivo"
    );
  }

  // A4: publicar no CICLO (exige_ciencia/bloqueante/versão nova na cadeia) é
  // gestão do rito, não envio comum — recrutador e T&D têm documento.enviar,
  // mas criar pendência para o quadro inteiro (ou bloquear o acesso de todos)
  // pede a chave de gestão do ciclo, rh.conduta.gerir (dp/diretoria, 0086).
  if (
    envioEntraNoCiclo(metadados) &&
    !(await temPermissao(sessao.usuario_id, CHAVE_CONDUTA_GERIR))
  ) {
    throw new ErroHttp(
      403,
      "Publicar no ciclo de ciência (exigir ciência, bloquear acesso ou substituir versão) exige a permissão de gestão do ciclo (rh.conduta.gerir)."
    );
  }

  let colaboradorNome: string | null = null;
  if (metadados.colaborador_id !== null) {
    const colaborador = await buscarColaborador(metadados.colaborador_id);
    if (!colaborador) {
      throw new ErroHttpCampo(400, "Colaborador não encontrado.", "colaborador_id");
    }
    colaboradorNome = colaborador.nome_completo;
  }

  // Versão nova na cadeia (B3): o anterior precisa existir, ser do acervo
  // geral e ainda ser a ponta — cadeia é linha, não árvore. O UNIQUE parcial
  // da 0086 fecha a corrida; aqui a recusa vira mensagem de campo.
  let tituloAnterior: string | null = null;
  if (metadados.substitui_documento_id !== null) {
    const anterior = await buscarMetadados(metadados.substitui_documento_id);
    if (!anterior || anterior.colaborador_id !== null) {
      throw new ErroHttpCampo(
        400,
        "Documento a substituir não encontrado no acervo geral.",
        "substitui_documento_id"
      );
    }
    if (anterior.substituido_por_id !== null) {
      throw new ErroHttpCampo(
        409,
        "Este documento já foi substituído — publique a versão nova a partir da versão vigente.",
        "substitui_documento_id"
      );
    }
    tituloAnterior = anterior.titulo;
  }

  // Hash calculado no servidor — o cliente nunca informa o hash.
  const hashSha256 = createHash("sha256")
    .update(arquivo.conteudo)
    .digest("hex");

  const guardado = await comTransacao(sessao.usuario_id, async (cliente) => {
    const documento = await armazenamento.guardar(cliente, {
      colaborador_id: metadados.colaborador_id,
      categoria: metadados.categoria,
      titulo: metadados.titulo,
      nome_arquivo: nomeArquivo,
      mime,
      tamanho_bytes: arquivo.conteudo.length,
      conteudo: arquivo.conteudo,
      sensivel: metadados.sensivel,
      hash_sha256: hashSha256,
      enviado_por_usuario: sessao.usuario_id,
      exige_ciencia: metadados.exige_ciencia,
      bloqueante: metadados.bloqueante,
      prazo_ciencia_dias: metadados.prazo_ciencia_dias,
      substitui_documento_id: metadados.substitui_documento_id,
    });
    const diff: Diff = {
      "Título": { de: null, para: metadados.titulo },
      Categoria: {
        de: null,
        para: ROTULOS_CATEGORIA[metadados.categoria as CategoriaDocumento],
      },
      Arquivo: { de: null, para: nomeArquivo },
      Tamanho: { de: null, para: formatarTamanho(arquivo.conteudo.length) },
      Colaborador: { de: null, para: colaboradorNome ?? "Geral (todos)" },
      "Sensível": { de: null, para: metadados.sensivel ? "Sim" : "Não" },
      "SHA-256": { de: null, para: hashSha256 },
    };
    if (metadados.exige_ciencia) {
      diff["Exige ciência"] = {
        de: null,
        para: metadados.bloqueante
          ? "Sim — bloqueante (trava o acesso até a ciência)"
          : metadados.prazo_ciencia_dias !== null
            ? `Sim — prazo de ${metadados.prazo_ciencia_dias} dia(s)`
            : "Sim — sem prazo",
      };
    }
    if (metadados.substitui_documento_id !== null) {
      diff["Substitui"] = {
        de: null,
        para: `${tituloAnterior} (#${metadados.substitui_documento_id})`,
      };
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_DOCUMENTO,
      registroId: String(documento.id),
      diff,
    });
    // B1/B3: publicar no ciclo AVISA todo o quadro — aviso neutro, o documento
    // fica na tela de destino. Versão nova reabre para todos; o aviso
    // acompanha. Quem publicou não é avisado da própria ação.
    if (metadados.exige_ciencia) {
      const ativos = await usuariosAtivos(cliente);
      await notificarLote(
        cliente,
        ativos
          .filter((usuarioId) => usuarioId !== sessao.usuario_id)
          .map((usuarioId) => ({
            usuarioId,
            tipo: "documento.ciencia_pendente",
            titulo: metadados.bloqueante
              ? "Documento exige sua ciência para continuar usando o sistema"
              : "Documento aguardando sua ciência",
            corpo: metadados.substitui_documento_id !== null
              ? "Uma versão nova foi publicada e reabre a ciência para todos."
              : "Leia o documento até o fim e registre a ciência.",
            link: "/documentos",
          }))
      );
    }
    return documento;
  });

  return {
    id: guardado.id,
    colaborador_id: metadados.colaborador_id,
    colaborador_nome: colaboradorNome,
    categoria: metadados.categoria,
    titulo: metadados.titulo,
    nome_arquivo: nomeArquivo,
    mime,
    tamanho_bytes: arquivo.conteudo.length,
    sensivel: metadados.sensivel,
    enviado_por: sessao.nome,
    enviado_em: guardado.enviado_em,
    minha_ciencia_em: null,
    exige_ciencia: metadados.exige_ciencia,
    bloqueante: metadados.bloqueante,
    prazo_ciencia_dias: metadados.prazo_ciencia_dias,
    substitui_documento_id: metadados.substitui_documento_id,
    substituido_por_id: null,
    minha_recusa_em: null,
  };
}

export async function baixarDocumento(
  sessao: PayloadSessao,
  id: number
): Promise<{ metadados: MetadadosDocumento; conteudo: Buffer }> {
  const metadados = await buscarMetadados(id);
  if (!metadados) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  await exigirVisibilidade(sessao, metadados);
  if (metadados.sensivel) {
    await gravarLeituraSensivel(sessao.usuario_id, [String(id)]);
  }
  const conteudo = await armazenamento.lerConteudo(id);
  if (!conteudo) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  return { metadados, conteudo };
}

export async function darCiencia(
  sessao: PayloadSessao,
  documentoId: number
): Promise<{ dada_em: string; hash_no_momento: string }> {
  const metadados = await buscarMetadados(documentoId);
  if (!metadados) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  await exigirVisibilidade(sessao, metadados);
  // Versão vigente só (0086): documento substituído não colhe ciência nova —
  // a pendência aponta a ponta da cadeia. As ciências antigas ficam intactas.
  if (metadados.substituido_por_id !== null) {
    throw new ErroHttp(
      409,
      "Este documento foi substituído por uma versão nova — registre a ciência na versão vigente."
    );
  }
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const ciencia = await inserirCiencia(cliente, {
        documentoId,
        usuarioId: sessao.usuario_id,
        hashNoMomento: metadados.hash_sha256,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_CIENCIA,
        registroId: String(ciencia.id),
        diff: {
          Documento: {
            de: null,
            para: `${metadados.titulo} (#${metadados.id})`,
          },
          "Hash no momento": { de: null, para: metadados.hash_sha256 },
        },
      });
      return {
        dada_em: ciencia.dada_em,
        hash_no_momento: metadados.hash_sha256,
      };
    });
  } catch (erro) {
    if (violacaoUnica(erro)) {
      throw new ErroHttp(409, "Ciência já registrada para este documento.");
    }
    throw erro;
  }
}

// ===========================================================================
// CICLO DE CIÊNCIA (0086) — decisões B1–B6 de docs/20.
//
// A pendência é DERIVADA (repositorio.pendenciasDoUsuario); o significado dela
// (estado e bloqueio) mora nas funções puras de esquemas.ts — um lugar só.
// Aqui ficam as regras de fluxo: quem pode o quê, em que ordem, e a trilha.
// ===========================================================================

const TABELA_RECUSA = "rh.documento_recusa";
const TABELA_ATO = "rh.conduta_ato";
const TABELA_LIBERACAO = "rh.conduta_liberacao";
const CHAVE_CONDUTA_GERIR = "rh.conduta.gerir";
const CHAVE_CONDUTA_LIBERAR = "rh.conduta.liberar";

function situacaoDaPendencia(linha: PendenciaLinha): SituacaoPendencia {
  return {
    bloqueante: linha.bloqueante,
    temCiencia: false, // a consulta só devolve pendência SEM ciência
    temRecusa: linha.recusada_em !== null,
    temAto: linha.ato_id !== null,
    temLiberacao: linha.liberado_em !== null,
    vencida: linha.vencida,
  };
}

export interface PendenciaVisao {
  documento_id: number;
  titulo: string;
  categoria: string;
  bloqueante: boolean;
  data_limite: string | null;
  vencida: boolean;
  estado: EstadoPendencia;
  bloqueia: boolean;
  recusada_em: string | null;
}

export interface VisaoPendencias {
  bloqueada: boolean;
  /** A pendência que trava o acesso — null quando o acesso está livre. */
  bloqueio: PendenciaVisao | null;
  pendencias: PendenciaVisao[];
  /** Atos em que EU sou testemunha ainda não confirmada. */
  testemunhos: TestemunhoPendente[];
}

function paraVisao(linha: PendenciaLinha): PendenciaVisao {
  const situacao = situacaoDaPendencia(linha);
  return {
    documento_id: linha.documento_id,
    titulo: linha.titulo,
    categoria: linha.categoria,
    bloqueante: linha.bloqueante,
    data_limite: linha.data_limite,
    vencida: linha.vencida,
    estado: estadoDaPendencia(situacao),
    bloqueia: pendenciaBloqueia(situacao),
    recusada_em: linha.recusada_em,
  };
}

/**
 * As pendências de ciência do usuário da sessão — o cartão do portal e a
 * lista da tela. Keyless de propósito: cada um só alcança as PRÓPRIAS
 * pendências (o filtro é o usuario_id da sessão, no SQL).
 */
export async function minhasPendencias(
  sessao: PayloadSessao
): Promise<VisaoPendencias> {
  const [linhas, testemunhos] = await Promise.all([
    pendenciasDoUsuario(sessao.usuario_id),
    testemunhosPendentesDoUsuario(sessao.usuario_id),
  ]);
  const pendencias = linhas.map(paraVisao);
  const bloqueio = pendencias.find((pendencia) => pendencia.bloqueia) ?? null;
  return { bloqueada: bloqueio !== null, bloqueio, pendencias, testemunhos };
}

/**
 * O CONTRATO DO GATE de 1º acesso (Onda 2): devolve a pendência que BLOQUEIA
 * o acesso deste usuário, ou null. Bloqueia quem: tem o documento bloqueante
 * pendente/recusado (B1/B6), ou tem ato formal registrado sem liberação (B6).
 * Vale para todos, inclusive DP/admin/diretoria (B4) — a exceção não existe
 * de propósito. O gate deve manter alcançáveis as rotas de regularização
 * (/documentos, /api/documentos/*, ciência/recusa e pendencias/minhas).
 */
export async function pendenciaBloqueante(
  usuarioId: number
): Promise<PendenciaVisao | null> {
  const linhas = await pendenciasDoUsuario(usuarioId);
  return linhas.map(paraVisao).find((pendencia) => pendencia.bloqueia) ?? null;
}

/**
 * Recusa registrada pelo PRÓPRIO usuário, com a sessão dele: "li e não
 * aceito", com o hash da versão recusada. Recusar NÃO destrava nada (B6) —
 * e não fecha a porta da ciência: a regularização fica sempre acessível.
 */
export async function registrarRecusa(
  sessao: PayloadSessao,
  documentoId: number,
  motivo: string | null
): Promise<{ recusada_em: string }> {
  const metadados = await buscarMetadados(documentoId);
  if (!metadados) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  await exigirVisibilidade(sessao, metadados);
  if (!metadados.exige_ciencia) {
    throw new ErroHttp(400, "Este documento não está no ciclo de ciência.");
  }
  if (metadados.substituido_por_id !== null) {
    throw new ErroHttp(
      409,
      "Este documento foi substituído por uma versão nova — a recusa vale na versão vigente."
    );
  }
  if (await cienciaExiste(documentoId, sessao.usuario_id)) {
    throw new ErroHttp(
      409,
      "Ciência já registrada — não é possível recusar um documento já assinado."
    );
  }
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const recusa = await inserirRecusa(cliente, {
        documentoId,
        usuarioId: sessao.usuario_id,
        hashNoMomento: metadados.hash_sha256,
        motivo,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_RECUSA,
        registroId: String(recusa.id),
        diff: {
          Documento: {
            de: null,
            para: `${metadados.titulo} (#${metadados.id})`,
          },
          "Hash no momento": { de: null, para: metadados.hash_sha256 },
          Motivo: { de: null, para: motivo ?? "não informado" },
        },
      });
      return { recusada_em: recusa.recusada_em };
    });
  } catch (erro) {
    if (violacaoUnica(erro)) {
      throw new ErroHttp(409, "Recusa já registrada para este documento.");
    }
    throw erro;
  }
}

/**
 * O ato formal do DP (B2): nasce de RECUSA ou PRAZO VENCIDO, com 2 testemunhas
 * usuárias do sistema. O DP pode abrir por recusa VERBAL (sem registro no
 * sistema); por prazo vencido, o servidor reconfere que o prazo de fato venceu
 * para aquela pessoa. Com o ato registrado, a pessoa fica bloqueada até
 * ciência ou liberação (B6).
 */
export async function abrirAtoTestemunhas(
  sessao: PayloadSessao,
  documentoId: number,
  dados: {
    usuario_id: number;
    origem: "recusa" | "prazo_vencido";
    descricao: string;
    testemunhas: number[];
  }
): Promise<{ id: number; aberto_em: string }> {
  const metadados = await buscarMetadados(documentoId);
  if (!metadados || metadados.colaborador_id !== null) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  if (!metadados.exige_ciencia) {
    throw new ErroHttp(400, "Este documento não está no ciclo de ciência.");
  }
  if (metadados.substituido_por_id !== null) {
    throw new ErroHttp(
      409,
      "Este documento foi substituído — o ato se abre na versão vigente."
    );
  }
  const alvo = await buscarUsuarioBasico(dados.usuario_id);
  if (!alvo || !alvo.ativo) {
    throw new ErroHttpCampo(400, "Usuário do ato não encontrado ou inativo.", "usuario_id");
  }
  if (await cienciaExiste(documentoId, dados.usuario_id)) {
    throw new ErroHttp(
      409,
      "Esta pessoa já deu ciência nesta versão — não há ato a lavrar."
    );
  }
  if (dados.testemunhas.includes(sessao.usuario_id)) {
    throw new ErroHttpCampo(
      400,
      "Quem abre o ato não pode ser testemunha dele.",
      "testemunhas"
    );
  }
  const nomesTestemunhas: string[] = [];
  for (const testemunhaId of dados.testemunhas) {
    const testemunha = await buscarUsuarioBasico(testemunhaId);
    if (!testemunha || !testemunha.ativo) {
      throw new ErroHttpCampo(
        400,
        "Testemunha não encontrada ou inativa.",
        "testemunhas"
      );
    }
    nomesTestemunhas.push(testemunha.nome);
  }
  let recusaId: number | null = null;
  if (dados.origem === "recusa") {
    const recusa = await buscarRecusa(documentoId, dados.usuario_id);
    recusaId = recusa?.id ?? null;
  } else {
    // Prazo vencido não é palavra do DP: o servidor reconfere no relógio civil.
    const pendencias = await pendenciasDoUsuario(dados.usuario_id);
    const pendencia = pendencias.find(
      (linha) => linha.documento_id === documentoId
    );
    if (!pendencia || !pendencia.vencida) {
      throw new ErroHttpCampo(
        400,
        "O prazo desta pessoa não venceu (ou não há prazo definido) — o ato por prazo vencido não se aplica.",
        "origem"
      );
    }
  }
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const ato = await inserirAto(cliente, {
        documentoId,
        usuarioId: dados.usuario_id,
        origem: dados.origem,
        recusaId,
        descricao: dados.descricao,
        abertoPor: sessao.usuario_id,
      });
      for (const testemunhaId of dados.testemunhas) {
        await inserirTestemunha(cliente, ato.id, testemunhaId);
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_ATO,
        registroId: String(ato.id),
        diff: {
          Documento: {
            de: null,
            para: `${metadados.titulo} (#${metadados.id})`,
          },
          Pessoa: { de: null, para: alvo.nome },
          Origem: {
            de: null,
            para: dados.origem === "recusa" ? "Recusa" : "Prazo vencido",
          },
          Testemunhas: { de: null, para: nomesTestemunhas.join(" · ") },
          "Descrição": { de: null, para: dados.descricao },
        },
      });
      // As testemunhas precisam agir (confirmar com a própria sessão) — aviso
      // neutro; e a pessoa do ato fica sabendo que o registro formal existe.
      await notificarLote(
        cliente,
        dados.testemunhas.map((usuarioId) => ({
          usuarioId,
          tipo: "documento.testemunho_pendente",
          titulo: "Você foi indicado como testemunha de um ato",
          corpo:
            "Confirme o testemunho na página de Documentos, no quadro do ciclo de ciência.",
          link: "/documentos",
        }))
      );
      await notificar(cliente, {
        usuarioId: dados.usuario_id,
        tipo: "documento.ato_registrado",
        titulo: "Registro formal aberto sobre pendência de ciência",
        corpo: "Procure o DP para regularizar a situação.",
        link: "/documentos",
      });
      return ato;
    });
  } catch (erro) {
    if (violacaoUnica(erro)) {
      throw new ErroHttp(
        409,
        "Já existe ato registrado para esta pessoa nesta versão."
      );
    }
    throw erro;
  }
}

/**
 * Confirmação da testemunha COM A PRÓPRIA SESSÃO (B2): hash da versão + data,
 * reusando o mecanismo da ciência. Keyless de propósito: a autorização é SER
 * a testemunha indicada — quem não é recebe 404 (ausência, não máscara).
 */
export async function confirmarTestemunho(
  sessao: PayloadSessao,
  documentoId: number,
  atoId: number
): Promise<{ confirmado_em: string }> {
  const ato = await buscarAto(atoId);
  if (!ato || ato.documento_id !== documentoId) {
    throw new ErroHttp(404, "Ato não encontrado.");
  }
  const testemunha = await buscarTestemunha(atoId, sessao.usuario_id);
  if (!testemunha) {
    throw new ErroHttp(404, "Ato não encontrado.");
  }
  if (testemunha.confirmado_em !== null) {
    throw new ErroHttp(409, "Testemunho já confirmado.");
  }
  const metadados = await buscarMetadados(documentoId);
  if (!metadados) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const confirmadoEm = await confirmarTestemunha(cliente, {
      atoId,
      usuarioId: sessao.usuario_id,
      hashNoMomento: metadados.hash_sha256,
    });
    if (confirmadoEm === null) {
      // Corrida entre o pré-check e a transação.
      throw new ErroHttp(409, "Testemunho já confirmado.");
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "testemunho_confirmado",
      tabela: TABELA_ATO,
      registroId: String(atoId),
      diff: {
        Testemunho: { de: "pendente", para: "confirmado" },
        "Hash no momento": { de: null, para: metadados.hash_sha256 },
      },
    });
    return { confirmado_em: confirmadoEm };
  });
}

/** Desfecho narrado pelo DP — fecha a história do ato no quadro do ciclo. */
export async function registrarDesfechoAto(
  sessao: PayloadSessao,
  documentoId: number,
  atoId: number,
  desfecho: string
): Promise<{ desfecho_em: string }> {
  const ato = await buscarAto(atoId);
  if (!ato || ato.documento_id !== documentoId) {
    throw new ErroHttp(404, "Ato não encontrado.");
  }
  if (ato.desfecho !== null) {
    throw new ErroHttp(409, "Desfecho já registrado para este ato.");
  }
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const desfechoEm = await registrarDesfecho(cliente, {
      atoId,
      desfecho,
      usuarioId: sessao.usuario_id,
    });
    if (desfechoEm === null) {
      throw new ErroHttp(409, "Desfecho já registrado para este ato.");
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "desfecho_ato",
      tabela: TABELA_ATO,
      registroId: String(atoId),
      diff: { Desfecho: { de: null, para: desfecho } },
    });
    return { desfecho_em: desfechoEm };
  });
}

/**
 * Costuras de liberarAcesso com o banco — o que os testes trocam por dublês
 * (molde DepsPosse, pendência 16.2). Produção nunca passa o parâmetro: a rota
 * chama como sempre e cai em DEPS_LIBERAR_REAIS.
 */
export interface DepsLiberar {
  buscarMetadados: typeof buscarMetadados;
  buscarUsuarioBasico: typeof buscarUsuarioBasico;
  buscarLiberacao: typeof buscarLiberacao;
  pendenciasDoUsuario: typeof pendenciasDoUsuario;
  buscarAtoDoUsuario: typeof buscarAtoDoUsuario;
  inserirLiberacao: typeof inserirLiberacao;
  registrarAlteracao: typeof registrarAlteracao;
  notificar: typeof notificar;
  comTransacao: typeof comTransacao;
}

const DEPS_LIBERAR_REAIS: DepsLiberar = {
  buscarMetadados,
  buscarUsuarioBasico,
  buscarLiberacao,
  pendenciasDoUsuario,
  buscarAtoDoUsuario,
  inserirLiberacao,
  registrarAlteracao,
  notificar,
  comTransacao,
};

/**
 * Liberação explícita (B6 modificado): o único destrave que não é ciência.
 * A rota já exigiu rh.conduta.liberar; aqui se confere que HÁ o que liberar —
 * liberar quem não está bloqueado viraria ruído na trilha — e que a liberação
 * é de OUTRA pessoa: quem se auto-liberasse esvaziaria o bloqueio (B4 diz que
 * ele vale para todos, inclusive quem tem a chave).
 */
export async function liberarAcesso(
  sessao: PayloadSessao,
  documentoId: number,
  usuarioId: number,
  justificativa: string,
  deps: DepsLiberar = DEPS_LIBERAR_REAIS
): Promise<{ liberado_em: string }> {
  // A5(b): AUTO-liberação não existe. O ato foi desenhado como controle de
  // segunda pessoa (B6: "usuário de maior patente" destrava o bloqueado) —
  // a própria mão liberando a própria pendência anularia o B4.
  if (usuarioId === sessao.usuario_id) {
    throw new ErroHttp(
      403,
      "Você não pode liberar o próprio acesso — a liberação exige um segundo par de olhos."
    );
  }
  const metadados = await deps.buscarMetadados(documentoId);
  if (!metadados || metadados.colaborador_id !== null) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  // A5(a): alvo desativado não recebe liberação (molde abrirAtoTestemunhas) —
  // conta desligada não usa o sistema; a liberação seria ruído na trilha.
  const alvo = await deps.buscarUsuarioBasico(usuarioId);
  if (!alvo || !alvo.ativo) {
    throw new ErroHttpCampo(
      400,
      "Usuário não encontrado ou inativo.",
      "usuario_id"
    );
  }
  if (await deps.buscarLiberacao(documentoId, usuarioId)) {
    throw new ErroHttp(409, "Liberação já registrada para esta pessoa.");
  }
  const pendencias = await deps.pendenciasDoUsuario(usuarioId);
  const pendencia = pendencias
    .map(paraVisao)
    .find((linha) => linha.documento_id === documentoId);
  if (!pendencia || !pendencia.bloqueia) {
    throw new ErroHttp(
      400,
      "Esta pessoa não está bloqueada por este documento — não há o que liberar."
    );
  }
  const ato = await deps.buscarAtoDoUsuario(documentoId, usuarioId);
  try {
    return await deps.comTransacao(sessao.usuario_id, async (cliente) => {
      const liberacao = await deps.inserirLiberacao(cliente, {
        documentoId,
        usuarioId,
        atoId: ato?.id ?? null,
        justificativa,
        liberadoPor: sessao.usuario_id,
      });
      await deps.registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_LIBERACAO,
        registroId: String(liberacao.id),
        diff: {
          Documento: {
            de: null,
            para: `${metadados.titulo} (#${metadados.id})`,
          },
          Pessoa: { de: null, para: alvo.nome },
          Justificativa: { de: null, para: justificativa },
          Acesso: { de: "bloqueado", para: "liberado" },
        },
      });
      await deps.notificar(cliente, {
        usuarioId,
        tipo: "documento.acesso_liberado",
        titulo: "Seu acesso ao sistema foi regularizado",
        corpo: "A pendência que travava o acesso foi liberada pela gestão.",
        link: "/documentos",
      });
      return { liberado_em: liberacao.liberado_em };
    });
  } catch (erro) {
    if (violacaoUnica(erro)) {
      throw new ErroHttp(409, "Liberação já registrada para esta pessoa.");
    }
    throw erro;
  }
}

/**
 * Lembrete aos pendentes (B1): aviso neutro para quem ainda não deu ciência
 * na versão vigente. Disparo manual do DP — sem agendador no projeto, o
 * lembrete é um ato de gestão, não um cron fantasma.
 */
export async function enviarLembrete(
  sessao: PayloadSessao,
  documentoId: number
): Promise<{ avisados: number }> {
  const metadados = await buscarMetadados(documentoId);
  if (!metadados || metadados.colaborador_id !== null) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  if (!metadados.exige_ciencia) {
    throw new ErroHttp(400, "Este documento não está no ciclo de ciência.");
  }
  if (metadados.substituido_por_id !== null) {
    throw new ErroHttp(
      409,
      "Este documento foi substituído — o lembrete vale na versão vigente."
    );
  }
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const pendentes = (
      await usuariosPendentesDoDocumento(cliente, documentoId)
    ).filter((usuarioId) => usuarioId !== sessao.usuario_id);
    await notificarLote(
      cliente,
      pendentes.map((usuarioId) => ({
        usuarioId,
        tipo: "documento.lembrete_ciencia",
        titulo: "Lembrete: documento aguardando sua ciência",
        corpo: "Leia o documento até o fim e registre a ciência.",
        link: "/documentos",
      }))
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "lembrete_ciencia",
      tabela: TABELA_DOCUMENTO,
      registroId: String(documentoId),
      diff: {
        Lembrete: {
          de: null,
          para: `${pendentes.length} pendente(s) avisado(s)`,
        },
      },
    });
    return { avisados: pendentes.length };
  });
}

// ------------------------------------------------------------------ quadro do ciclo

export interface PessoaDoCiclo extends QuadroPessoa {
  estado: EstadoPendencia;
  bloqueia: boolean;
}

export interface VisaoCiclo {
  documento: {
    id: number;
    titulo: string;
    categoria: string;
    exige_ciencia: boolean;
    bloqueante: boolean;
    prazo_ciencia_dias: number | null;
    substituido_por_id: number | null;
  };
  pessoas: PessoaDoCiclo[];
  atos: AtoDoCiclo[];
}

/**
 * O quadro do ciclo por documento — quem assinou / recusou / pendente /
 * liberado, os atos e as testemunhas. Servido só a rh.conduta.gerir (a rota
 * confere). O quadro mostra estado de conformidade, não conteúdo sensível.
 */
export async function cicloDoDocumento(documentoId: number): Promise<VisaoCiclo> {
  const metadados = await buscarMetadados(documentoId);
  if (!metadados || metadados.colaborador_id !== null) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  if (!metadados.exige_ciencia) {
    throw new ErroHttp(400, "Este documento não está no ciclo de ciência.");
  }
  const [pessoas, atos] = await Promise.all([
    quadroDoCiclo(documentoId),
    atosDoDocumento(documentoId),
  ]);
  return {
    documento: {
      id: metadados.id,
      titulo: metadados.titulo,
      categoria: metadados.categoria,
      exige_ciencia: metadados.exige_ciencia,
      bloqueante: metadados.bloqueante,
      prazo_ciencia_dias: metadados.prazo_ciencia_dias,
      substituido_por_id: metadados.substituido_por_id,
    },
    pessoas: pessoas.map((pessoa) => {
      const situacao: SituacaoPendencia = {
        bloqueante: metadados.bloqueante,
        temCiencia: pessoa.ciencia_em !== null,
        temRecusa: pessoa.recusada_em !== null,
        temAto: pessoa.ato_id !== null,
        temLiberacao: pessoa.liberado_em !== null,
        vencida: pessoa.vencida,
      };
      return {
        ...pessoa,
        estado: estadoDaPendencia(situacao),
        bloqueia: pendenciaBloqueia(situacao),
      };
    }),
    atos,
  };
}

export { CHAVE_CONDUTA_GERIR, CHAVE_CONDUTA_LIBERAR };
