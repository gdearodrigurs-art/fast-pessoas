import { comTransacao, consultar } from "../../lib/banco";
import { chamarClaudeEstruturado } from "../../lib/claude";
import {
  contemPiiObvio,
  limparContextoLivre,
} from "../../lib/desidentificar";
import { ErroHttp } from "../../lib/sessao";
import type { PayloadSessao } from "../identidade/esquemas";
import type { MemoriaCalculo } from "../avaliacao/calculo";
import { buscarResultado } from "../avaliacao/repositorio";
import type { AvisoPdi } from "./calculo";
import { validarFocos } from "./calculo";
import {
  esquemaConteudoPdi,
  type ConteudoPdi,
  type EntrevistaPdi,
} from "./esquemas";
import {
  ESQUEMA_SAIDA_PDI,
  INSTRUCAO_PDI,
  montarPromptPdi,
  type AvaliacaoAnonima,
} from "./instrucao";
import {
  atualizarConteudo,
  buscarPdi,
  contextoDoCiclo,
  homologar,
  inserirPdi,
  listarCiclosParaPdi,
  listarPdis,
  materializarAcoes,
  registrarLeituraPdi,
  submeter,
} from "./repositorio";

// Quem pode o quê. "amplo" = tem avaliacao.resultado.ver (dp/diretoria): vê/gera
// para qualquer ciclo. O gestor só age nos ciclos em que é o avaliador.
async function permissoes(usuarioId: number): Promise<{
  amplo: boolean;
  gerar: boolean;
  homologar: boolean;
}> {
  const linhas = await consultar<{
    amplo: boolean;
    gerar: boolean;
    homologar: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'avaliacao.resultado.ver') AS amplo,
            sistema.tem_permissao($1, 'pdi.gerar')               AS gerar,
            sistema.tem_permissao($1, 'pdi.homologar')           AS homologar`,
    [usuarioId]
  );
  return {
    amplo: linhas[0]?.amplo ?? false,
    gerar: linhas[0]?.gerar ?? false,
    homologar: linhas[0]?.homologar ?? false,
  };
}

/** Monta o payload ANÔNIMO (só competências e notas; nunca nome/CPF/matrícula). */
function avaliacaoAnonima(
  memoria: MemoriaCalculo,
  percentual: number,
  faixaRotulo: string,
  recomendacao: string,
  modeloNome: string
): AvaliacaoAnonima {
  const competencias = [];
  for (const pilar of memoria.pilares) {
    for (const indicador of pilar.indicadores) {
      if (indicador.nota !== null && !indicador.nao_observado) {
        competencias.push({
          pilar: pilar.nome,
          indicador: indicador.nome,
          nota: indicador.nota,
        });
      }
    }
  }
  return {
    modelo: modeloNome,
    percentual_final: percentual,
    faixa: faixaRotulo,
    recomendacao,
    competencias,
  };
}

export interface PdiGeradoResumo {
  id: number;
  conteudo: ConteudoPdi;
  avisos: AvisoPdi[];
  tokens: { entrada: number; saida: number };
}

/**
 * O coração do fluxo: lê o resultado (restrito — o gestor NUNCA o vê, só o
 * servidor), desidentifica, chama a IA, valida com o motor, grava o rascunho e
 * registra a leitura sensível — tudo na mesma transação de escrita.
 */
export async function gerarPdi(
  sessao: PayloadSessao,
  dados: { ciclo_id: number; entrevista: EntrevistaPdi }
): Promise<PdiGeradoResumo> {
  const contexto = await contextoDoCiclo(dados.ciclo_id);
  if (!contexto) throw new ErroHttp(404, "Ciclo não encontrado.");

  const { amplo } = await permissoes(sessao.usuario_id);
  const ehAvaliador = contexto.avaliador_usuario_id === sessao.usuario_id;
  if (!amplo && !ehAvaliador) {
    // Ausência, não vazamento: não confirma que o ciclo existe a quem não alcança.
    throw new ErroHttp(404, "Ciclo não encontrado.");
  }

  const resultado = await buscarResultado(dados.ciclo_id);
  if (!resultado) {
    throw new ErroHttp(
      409,
      "A avaliação ainda não foi consolidada — não há resultado para gerar o PDI."
    );
  }

  const avaliacao = avaliacaoAnonima(
    resultado.memoria_calculo,
    resultado.percentual,
    resultado.faixa_rotulo,
    resultado.recomendacao,
    contexto.modelo_nome
  );

  const { limpo, avisos: avisosDesid } = limparContextoLivre(
    dados.entrevista.contexto_livre ?? ""
  );
  const entrevistaLimpa: EntrevistaPdi = {
    ...dados.entrevista,
    contexto_livre: limpo ? limpo : undefined,
  };

  const user = montarPromptPdi(avaliacao, entrevistaLimpa);
  if (contemPiiObvio(user)) {
    throw new ErroHttp(
      422,
      "Ainda há dado pessoal óbvio no contexto — remova antes de gerar."
    );
  }

  const resposta = await chamarClaudeEstruturado({
    system: INSTRUCAO_PDI,
    user,
    schema: ESQUEMA_SAIDA_PDI,
  });

  let conteudo: ConteudoPdi;
  try {
    conteudo = esquemaConteudoPdi.parse(JSON.parse(resposta.texto));
  } catch {
    throw new ErroHttp(
      502,
      "A IA devolveu um PDI em formato inesperado. Tente gerar novamente."
    );
  }

  const avisos: AvisoPdi[] = [
    ...avisosDesid.map((mensagem) => ({
      tipo: "desidentificacao" as const,
      mensagem,
    })),
    ...validarFocos(resultado.memoria_calculo, conteudo.focos),
  ];

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const novo = await inserirPdi(cliente, {
      pessoa_id: contexto.pessoa_id,
      ciclo_id: dados.ciclo_id,
      parametros: entrevistaLimpa,
      rascunho_ia: conteudo,
      conteudo,
      avisos,
      modelo_ia: resposta.modelo,
      gerado_por: sessao.usuario_id,
    });
    await registrarLeituraPdi(cliente, {
      usuarioId: sessao.usuario_id,
      registroId: String(novo),
    });
    return novo;
  });

  return { id, conteudo, avisos, tokens: resposta.tokens };
}

async function carregarPdi(id: number) {
  const pdi = await buscarPdi(id);
  if (!pdi) throw new ErroHttp(404, "PDI não encontrado.");
  return pdi;
}

// Ver: o autor, quem tem alcance amplo, OU quem homologa (RH revisa antes).
export async function verPdi(sessao: PayloadSessao, id: number) {
  const pdi = await carregarPdi(id);
  const pode = await permissoes(sessao.usuario_id);
  if (!pode.amplo && !pode.homologar && pdi.gerado_por !== sessao.usuario_id) {
    throw new ErroHttp(404, "PDI não encontrado.");
  }
  const { gerado_por: _ignorado, ...visivel } = pdi;
  void _ignorado;
  return visivel;
}

// Editar/submeter: só o autor do rascunho (ou alcance amplo).
async function pdiParaEditar(sessao: PayloadSessao, id: number) {
  const pdi = await carregarPdi(id);
  const { amplo } = await permissoes(sessao.usuario_id);
  if (!amplo && pdi.gerado_por !== sessao.usuario_id) {
    throw new ErroHttp(404, "PDI não encontrado.");
  }
  return pdi;
}

export async function ajustarPdi(
  sessao: PayloadSessao,
  id: number,
  conteudo: ConteudoPdi
): Promise<void> {
  const pdi = await pdiParaEditar(sessao, id);
  if (pdi.status !== "rascunho") {
    throw new ErroHttp(409, "Só um rascunho pode ser editado.");
  }
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const n = await atualizarConteudo(cliente, id, conteudo);
    if (n === 0) throw new ErroHttp(409, "O PDI mudou de estado — recarregue.");
  });
}

export async function submeterPdi(
  sessao: PayloadSessao,
  id: number
): Promise<void> {
  const pdi = await pdiParaEditar(sessao, id);
  if (pdi.status !== "rascunho") {
    throw new ErroHttp(409, "Só um rascunho pode ser submetido à homologação.");
  }
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const n = await submeter(cliente, id, sessao.usuario_id);
    if (n === 0) throw new ErroHttp(409, "O PDI mudou de estado — recarregue.");
  });
}

/** Homologa e MATERIALIZA os focos como ações do colaborador (portal). */
export async function homologarPdi(
  sessao: PayloadSessao,
  id: number
): Promise<{ acoes_criadas: number }> {
  const pdi = await buscarPdi(id);
  if (!pdi) throw new ErroHttp(404, "PDI não encontrado.");
  if (pdi.status !== "aguardando_homologacao") {
    throw new ErroHttp(
      409,
      "Só um PDI aguardando homologação pode ser homologado."
    );
  }
  if (pdi.ciclo_id === null) {
    throw new ErroHttp(409, "PDI sem ciclo de origem — não dá para materializar.");
  }
  const contexto = await contextoDoCiclo(pdi.ciclo_id);
  if (!contexto) throw new ErroHttp(409, "Ciclo de origem não encontrado.");

  const acoes = await comTransacao(sessao.usuario_id, async (cliente) => {
    const n = await homologar(cliente, id, sessao.usuario_id);
    if (n === 0) throw new ErroHttp(409, "O PDI mudou de estado — recarregue.");
    return materializarAcoes(cliente, {
      pdiId: id,
      colaboradorId: contexto.colaborador_id,
      responsavelId: sessao.usuario_id,
      horizonteMeses: pdi.parametros.horizonte_meses,
      conteudo: pdi.conteudo,
    });
  });
  return { acoes_criadas: acoes };
}

export async function listarPainel(sessao: PayloadSessao) {
  const pode = await permissoes(sessao.usuario_id);
  const [pdis, ciclos] = await Promise.all([
    listarPdis(sessao.usuario_id, pode.amplo || pode.homologar),
    pode.gerar
      ? listarCiclosParaPdi(sessao.usuario_id, pode.amplo)
      : Promise.resolve([]),
  ]);
  return {
    pdis,
    ciclos,
    pode: { gerar: pode.gerar, homologar: pode.homologar },
  };
}
