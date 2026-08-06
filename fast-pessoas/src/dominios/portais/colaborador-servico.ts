/**
 * Portal do colaborador — montagem da visão única.
 *
 * O que esta camada faz: junta, no ponto de vista de quem só quer resolver a
 * própria vida, dado que JÁ EXISTE nos domínios. Cada bloco é lido pelo
 * serviço/repositório do domínio dono (ferias, demandas, beneficios,
 * documentos, clima, colaboradores) e reprojetado num payload enxuto. As duas
 * únicas consultas próprias (avaliações do avaliado e PDI) estão em
 * colaborador-repositorio.ts.
 *
 * ---------------------------------------------------------------------------
 * DEFESA CONTRA IDOR — a decisão de desenho mais importante deste arquivo
 * ---------------------------------------------------------------------------
 * `montarPortal` recebe APENAS a sessão. Não existe, em nenhum ponto do
 * caminho (rota → serviço → repositório), um parâmetro `colaborador_id`:
 * o alvo é sempre `colaboradorIdDoUsuario(sessao.usuario_id)`. Quem quiser
 * ver a ficha de outra pessoa usa /colaboradores, que tem escopo próprio
 * (`rh.colaborador.ver` + relacao_gestor) e nega o resto com 404. Aqui não há
 * o que autorizar por id porque não há id de entrada — o furo clássico
 * "/portal?colaborador_id=999" não tem por onde nascer.
 *
 * A onda H5 abriu a PRIMEIRA escrita deste portal (manter os próprios
 * dependentes) e a mesma forma foi mantida, porque escrita é onde IDOR dói
 * mais: nenhuma das quatro operações aceita `colaborador_id`, o titular sai
 * sempre da sessão, e o id de linha que PATCH/DELETE precisam nomear é
 * reconferido contra o titular dentro da transação, com a linha travada — id de
 * outra pessoa responde o mesmo 404 que id inexistente. Ver o bloco "meus
 * dependentes (H5)" mais abaixo.
 *
 * Também não há chave de permissão para o portal em si: qualquer sessão
 * autenticada vê o PRÓPRIO portal, do mesmo modo que qualquer sessão vê a
 * própria ficha. Cada BLOCO, porém, respeita a chave do seu domínio (férias
 * exige `ferias.programar`, documentos `documento.ver`, dependentes
 * `dependente.proprio.manter`, e assim por diante): um perfil recomposto em
 * /perfis que perca uma chave perde o bloco, não o portal inteiro.
 *
 * SALÁRIO: ausente. Ver o comentário de `MeusDados` em colaborador-esquemas.ts.
 */

import type { PoolClient } from "pg";
import { mensagemSemFicha } from "../../lib/ficha-de-colaborador";
import { ROTULOS_TIPO_CICLO } from "../avaliacao/esquemas";
import {
  atendeCriterio,
  ROTULOS_CATEGORIA,
  ROTULOS_PARENTESCO,
  interpretarDescricaoSolicitacao,
} from "../beneficios/esquemas";
import {
  atualizarDependente as atualizarDependenteNoBanco,
  buscarDependenteParaAtualizar,
  excluirDependente,
  inserirDependente,
  listarAdesoesDoColaborador,
  listarBeneficios,
  listarDependentes,
  listarSolicitacoesDoUsuario,
  perfilPorUsuario,
} from "../beneficios/repositorio";
import { AVISO_TRANSPARENCIA } from "../clima/esquemas";
import { obterCheckinDoDia } from "../clima/servico";
import { ROTULOS_VINCULO, ROTULOS_STATUS } from "../colaboradores/esquemas";
import { colaboradorIdDoUsuario } from "../colaboradores/repositorio";
import { obterColaborador } from "../colaboradores/servico";
import {
  rotuloStatusExibicao,
  STATUS_ATIVOS,
} from "../demandas/esquemas";
import { listarDoSolicitante } from "../demandas/repositorio";
import {
  listar as listarDocumentosNoBanco,
  vinculosDoUsuario,
} from "../documentos/repositorio";
import {
  nivelAlerta,
  ROTULOS_STATUS_PERIODO,
  ROTULOS_STATUS_PROGRAMACAO,
} from "../ferias/esquemas";
import { montarVisao as montarVisaoFerias } from "../ferias/servico";
import { PayloadSessao } from "../identidade/esquemas";
import { comTransacao } from "../../lib/banco";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { ErroHttp, exigirPermissao, lerSessao } from "../../lib/sessao";
import {
  ANDAMENTO_CICLO,
  BlocoAvaliacoes,
  BlocoBeneficios,
  BlocoCheckin,
  BlocoDependentes,
  BlocoDocumentos,
  BlocoFerias,
  BlocoSolicitacoes,
  DIAS_ALERTA_FERIAS,
  EXPLICACAO_TREINAMENTOS,
  MeuDependente,
  MeuDependenteEdicao,
  MeuDependenteNovo,
  MeusDados,
  PARENTESCOS_POSSIVEIS,
  PortalColaborador,
  ROTULOS_STATUS_PDI,
  tempoDeCasa,
} from "./colaborador-esquemas";
import {
  chavesConcedidas,
  listarCiclosDoAvaliado,
  listarPdiDoColaborador,
} from "./colaborador-repositorio";

const CHAVE_FERIAS = "ferias.programar";
const CHAVE_DEMANDAS = "demanda.criar";
const CHAVE_BENEFICIOS = "adesao.solicitar";
const CHAVE_DOCUMENTOS = "documento.ver";
const CHAVE_CHECKIN = "clima.responder";
/** Manter os PRÓPRIOS dependentes — onda H5, migration 0056. */
const CHAVE_DEPENDENTES = "dependente.proprio.manter";
/** O mesmo nome que o DP grava em audit.alteracao: uma tabela, uma trilha. */
const TABELA_DEPENDENTE = "rh.dependente";
/** Quem pode abrir o RCF imprimível em /cargos/[id]/rcf (guarda daquela tela). */
const CHAVES_RCF_IMPRIMIVEL = [
  "rh.cargo.administrar",
  "rh.cargo.ver",
  "rh.colaborador.ver",
] as const;

// ------------------------------------------------------------------ guarda

/**
 * Sessão válida, sem chave especial. Espelha `exigirPermissao` de
 * lib/sessao.ts nas duas checagens que valem para todo mundo (autenticado e
 * 2FA concluído) e omite só a terceira — a chave — porque não existe chave a
 * conferir: o recurso é o próprio usuário. Mesmo padrão de
 * `exigirAcessoBeneficios` e `exigirSessaoDoModulo`, com a checagem de
 * `pendente_2fa` que ali só o proxy garantia.
 */
export async function exigirSessaoDoPortal(): Promise<PayloadSessao> {
  const sessao = await lerSessao();
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  if (sessao.pendente_2fa) {
    throw new ErroHttp(
      403,
      "Configure a autenticação em duas etapas para continuar"
    );
  }
  return sessao;
}

// ------------------------------------------------------------------ apoio

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Hoje na régua de exibição do projeto (banco em UTC, tela em SP). */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

// ------------------------------------------------------------------ blocos

async function montarBlocoFerias(sessao: PayloadSessao): Promise<BlocoFerias> {
  // Reuso deliberado do serviço de férias: além de listar, ele GERA os
  // períodos aquisitivos que faltam e marca os vencidos (gerador lazy do
  // domínio). Duplicar essa regra aqui seria criar uma segunda verdade sobre
  // saldo — e o saldo é assunto legal (art. 130/137). A visão administrativa
  // que ele devolve para DP/RH é descartada: o portal é a vida da pessoa.
  const visao = await montarVisaoFerias(sessao);

  const periodos = visao.periodos
    .filter((periodo) => periodo.status !== "gozado")
    .map((periodo) => ({
      id: periodo.id,
      inicio: periodo.inicio,
      fim: periodo.fim,
      saldo_disponivel: periodo.saldo_dias - periodo.dias_gozados,
      status: ROTULOS_STATUS_PERIODO[periodo.status],
      limite_concessivo: periodo.limite_concessivo,
      dias_ate_limite: periodo.dias_ate_limite,
      em_alerta: nivelAlerta(periodo.dias_ate_limite) !== null,
    }));

  const programadas = visao.programacoes
    .filter((programacao) =>
      ["solicitada", "aprovada", "em_gozo"].includes(programacao.status)
    )
    .map((programacao) => ({
      id: programacao.id,
      inicio: programacao.inicio,
      fim: programacao.fim,
      dias: programacao.dias,
      abono_dias: programacao.abono_dias,
      status: ROTULOS_STATUS_PROGRAMACAO[programacao.status],
      demanda_numero: programacao.demanda_numero,
    }));

  // Alerta em ordem de gravidade: vencido primeiro (art. 137 — o passivo já
  // existe), depois o que está perto de vencer.
  const vencidos = periodos.filter((periodo) => periodo.dias_ate_limite < 0);
  const vencendo = periodos.filter(
    (periodo) =>
      periodo.dias_ate_limite >= 0 &&
      periodo.dias_ate_limite <= DIAS_ALERTA_FERIAS
  );
  let alerta: string | null = null;
  if (vencidos.length > 0) {
    const periodo = vencidos[0];
    alerta =
      `Você tem ${vencidos.length} período aquisitivo com o prazo de concessão ` +
      `vencido (o mais antigo venceu em ${formatarData(periodo.limite_concessivo)}). ` +
      `Procure o seu gestor ou o DP para programar as férias.`;
  } else if (vencendo.length > 0) {
    const periodo = vencendo[0];
    alerta =
      `Programe suas férias: o período de ${formatarData(periodo.inicio)} a ` +
      `${formatarData(periodo.fim)} precisa ser gozado até ` +
      `${formatarData(periodo.limite_concessivo)} (faltam ${periodo.dias_ate_limite} dias).`;
  }

  return { saldo_total: visao.saldo_total, periodos, programadas, alerta };
}

async function montarBlocoSolicitacoes(
  usuarioId: number
): Promise<BlocoSolicitacoes> {
  // Escopo do próprio solicitante — a mesma consulta que alimenta a aba
  // "Minhas" de /demandas. A fila do DP e as aprovações do gestor não entram.
  const demandas = await listarDoSolicitante(usuarioId);
  const projetar = (demanda: (typeof demandas)[number]) => ({
    id: demanda.id,
    numero: demanda.numero,
    tipo_nome: demanda.tipo_nome,
    descricao: demanda.descricao,
    status: demanda.status,
    status_rotulo: rotuloStatusExibicao(
      demanda.status,
      demanda.recusada_na_aprovacao
    ),
    prazo: demanda.prazo,
    dias_ate_prazo: demanda.dias_ate_prazo,
    em_atraso:
      STATUS_ATIVOS.includes(demanda.status) && demanda.dias_ate_prazo < 0,
    encerrada: !STATUS_ATIVOS.includes(demanda.status),
  });
  const projetadas = demandas.map(projetar);
  return {
    em_aberto: projetadas.filter((demanda) => !demanda.encerrada),
    encerradas: projetadas.filter((demanda) => demanda.encerrada),
  };
}

async function montarBlocoBeneficios(
  usuarioId: number,
  colaboradorId: number
): Promise<BlocoBeneficios> {
  const perfil = await perfilPorUsuario(usuarioId);
  if (!perfil) {
    return { ativos: [], elegiveis_sem_adesao: [] };
  }
  const [adesoes, beneficios, solicitacoes] = await Promise.all([
    listarAdesoesDoColaborador(colaboradorId),
    listarBeneficios(true),
    listarSolicitacoesDoUsuario(usuarioId),
  ]);

  // valor/desconto entram porque são dado DELE: é o que sai do holerite dele.
  // O gestor não vê esses números (regra da migration 0009) — e não vê porque
  // este portal só existe na primeira pessoa.
  const vigentes = adesoes.filter((adesao) => adesao.fim === null);
  const ativos = vigentes.map((adesao) => ({
    id: adesao.id,
    beneficio_nome: adesao.beneficio_nome,
    categoria_rotulo: ROTULOS_CATEGORIA[adesao.categoria],
    status: adesao.status,
    inicio: adesao.inicio,
    valor: adesao.valor,
    desconto: adesao.desconto,
  }));

  // Não oferecer adesão que a pessoa já pediu e o DP ainda não efetivou. A
  // natureza do pedido é lida pela função do próprio domínio, que interpreta a
  // descrição que ele mesmo gerou.
  const chavesPendentes = new Set<string>();
  for (const solicitacao of solicitacoes) {
    if (!STATUS_ATIVOS.includes(solicitacao.status)) continue;
    const lido = interpretarDescricaoSolicitacao(solicitacao.descricao);
    if (lido !== null && lido.natureza === "adesao") {
      chavesPendentes.add(lido.chave);
    }
  }

  // Elegibilidade pela MESMA função do domínio de benefícios (atendeCriterio),
  // contra a regra ATIVA — nunca uma segunda interpretação do critério aqui.
  const elegiveis = beneficios
    .filter((beneficio) => beneficio.regra !== null)
    .filter((beneficio) =>
      atendeCriterio(beneficio.regra?.criterio ?? {}, {
        tipo_vinculo: perfil.tipo_vinculo,
        estabelecimento_id: perfil.estabelecimento_id,
      })
    )
    .filter(
      (beneficio) =>
        !vigentes.some((adesao) => adesao.beneficio_id === beneficio.id)
    )
    .map((beneficio) => ({
      beneficio_id: beneficio.id,
      nome: beneficio.nome,
      categoria_rotulo: ROTULOS_CATEGORIA[beneficio.categoria],
      valor_padrao: beneficio.regra?.valor_padrao ?? null,
      desconto_padrao: beneficio.regra?.desconto_padrao ?? null,
      solicitacao_pendente: chavesPendentes.has(beneficio.chave),
    }));

  return { ativos, elegiveis_sem_adesao: elegiveis };
}

// --------------------------------------------------------- meus dependentes (H5)
//
// A ÚNICA ESCRITA DO PORTAL, e a que mais precisava da defesa deste arquivo.
//
// Onda H5 (docs/10:110), confirmada pela Diretora de Pessoas: "dependentes pelo
// próprio usuário". Até aqui rh.dependente só tinha uma porta de escrita, a do
// DP (`adesao.gerir`, em /api/beneficios/dependentes). Essa porta CONTINUA
// aberta e inteira — o DP não perdeu nada. O que nasce é uma segunda porta, mais
// estreita, que só alcança uma pessoa.
//
// COMO A PORTA ESTREITA É ESTREITA, em três camadas:
//   1. o alvo sai de `colaboradorIdDoUsuario(sessao.usuario_id)` — igual ao
//      resto do portal. Nenhuma das quatro operações aceita `colaborador_id`;
//   2. UPDATE e DELETE precisam nomear a LINHA, e aí existe um id vindo da
//      requisição. Ele nomeia a linha, nunca a pessoa: `linhaDoTitular` relê a
//      linha com FOR UPDATE dentro da própria transação e compara o
//      `colaborador_id` dela com o da sessão. Não bate → 404, ausência e não
//      máscara, a mesma resposta que o id inexistente recebe. Quem sondar
//      /dependentes/48 não descobre nem que 48 existe;
//   3. a conferência e a escrita moram na MESMA transação, com a linha travada.
//      Conferir fora e escrever depois seria janela para troca de dono no meio.
//
// ESCOPO É O VÍNCULO CORRENTE, de propósito. Na transferência entre empresas os
// dependentes são COPIADOS para o vínculo novo (migration 0048), então a pessoa
// enxerga aqui os dependentes que valem para o contrato de hoje. As linhas do
// contrato antigo continuam existindo e continuam sendo a base do IRRF já
// calculado lá — deixá-las editáveis por esta porta seria reescrever o passado
// de uma folha fechada.

/** Nada de CPF no payload — ver o comentário de `MeuDependente`. */
function projetarDependente(dependente: {
  id: number;
  nome: string;
  parentesco: keyof typeof ROTULOS_PARENTESCO;
  nascimento: string;
  cpf: string | null;
}): MeuDependente {
  return {
    id: dependente.id,
    nome: dependente.nome,
    parentesco: dependente.parentesco,
    parentesco_rotulo: ROTULOS_PARENTESCO[dependente.parentesco],
    nascimento: dependente.nascimento,
    cpf_informado: dependente.cpf !== null,
  };
}

async function montarBlocoDependentes(
  colaboradorId: number
): Promise<BlocoDependentes> {
  const dependentes = await listarDependentes(colaboradorId);
  return {
    itens: dependentes.map(projetarDependente),
    parentescos_possiveis: PARENTESCOS_POSSIVEIS,
  };
}

/**
 * Guarda das quatro operações: chave conferida no banco + o colaborador da
 * sessão. Devolve o id do titular; quem não tem ficha não tem dependente para
 * manter (409, com a mensagem que já explica o que fazer).
 */
async function exigirTitular(): Promise<{
  sessao: PayloadSessao;
  colaboradorId: number;
}> {
  const sessao = await exigirPermissao(CHAVE_DEPENDENTES);
  const colaboradorId = await colaboradorIdDoUsuario(sessao.usuario_id);
  if (colaboradorId === null) {
    throw new ErroHttp(409, await mensagemSemFicha(sessao.usuario_id));
  }
  return { sessao, colaboradorId };
}

/**
 * A linha, travada, SE for do titular. Fora isso, 404 — o mesmo 404 do id que
 * não existe. É aqui que a defesa contra IDOR encosta no banco.
 */
async function linhaDoTitular(
  cliente: PoolClient,
  id: number,
  colaboradorId: number
) {
  const atual = await buscarDependenteParaAtualizar(cliente, id);
  if (!atual || atual.colaborador_id !== colaboradorId) {
    throw new ErroHttp(404, "Dependente não encontrado.");
  }
  return atual;
}

/**
 * Trilha com o DE e o PARA de verdade.
 *
 * O diff do DP (beneficios/servico.ts:1141) grava só o PARA, porque nasceu na
 * criação. Aqui a edição é do próprio interessado e é ela que a conferência do
 * IRRF vai querer ler: "quem trocou a data de nascimento do dependente, de quê
 * para quê, e quando". Sem o `de`, a trilha responde metade da pergunta.
 *
 * CPF continua fora, virando "informado"/"removido": a trilha de auditoria é
 * lida por gente que não precisa do CPF do filho de ninguém.
 */
function diffDependente(
  antes: { nome: string; nascimento: string; parentesco: string; cpf: string | null } | null,
  depois: {
    nome?: string;
    nascimento?: string;
    parentesco?: string;
    cpf?: string | null;
  }
): Diff {
  const diff: Diff = {};
  if (depois.nome !== undefined) {
    diff["Nome"] = { de: antes?.nome ?? null, para: depois.nome };
  }
  if (depois.nascimento !== undefined) {
    diff["Nascimento"] = { de: antes?.nascimento ?? null, para: depois.nascimento };
  }
  if (depois.parentesco !== undefined) {
    diff["Parentesco"] = {
      de: antes === null ? null : ROTULOS_PARENTESCO[antes.parentesco as keyof typeof ROTULOS_PARENTESCO],
      para: ROTULOS_PARENTESCO[depois.parentesco as keyof typeof ROTULOS_PARENTESCO],
    };
  }
  if (depois.cpf !== undefined) {
    diff["CPF"] = {
      de: antes === null ? null : antes.cpf ? "informado" : "não informado",
      para: depois.cpf ? "informado" : "removido",
    };
  }
  return diff;
}

export async function listarMeusDependentes(): Promise<BlocoDependentes> {
  const { colaboradorId } = await exigirTitular();
  // Sem audit.leitura_sensivel: a trilha de leitura existe para dado de
  // TERCEIRO (beneficios/servico.ts:1130 grava quando o leitor NÃO é o
  // titular). Aqui o leitor é sempre o titular — a mesma razão pela qual o
  // portal inteiro não grava leitura ao mostrar a própria ficha.
  return montarBlocoDependentes(colaboradorId);
}

export async function criarMeuDependente(
  dados: MeuDependenteNovo
): Promise<MeuDependente> {
  const { sessao, colaboradorId } = await exigirTitular();
  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const novoId = await inserirDependente(cliente, {
      // NÃO vem do corpo da requisição. Este é o ponto do arquivo em que isso
      // mais importa: é a única linha que decide de quem é o dependente.
      colaborador_id: colaboradorId,
      nome: dados.nome,
      nascimento: dados.nascimento,
      parentesco: dados.parentesco,
      cpf: dados.cpf ?? null,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_DEPENDENTE,
      registroId: String(novoId),
      diff: {
        Origem: { de: null, para: "portal do colaborador (o próprio titular)" },
        ...diffDependente(null, dados),
      },
    });
    return novoId;
  });
  const criado = (await listarDependentes(colaboradorId)).find(
    (item) => item.id === id
  );
  if (!criado) {
    throw new ErroHttp(500, "Falha ao carregar o dependente criado.");
  }
  return projetarDependente(criado);
}

export async function atualizarMeuDependente(
  id: number,
  dados: MeuDependenteEdicao
): Promise<MeuDependente> {
  const { sessao, colaboradorId } = await exigirTitular();
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const antes = await linhaDoTitular(cliente, id, colaboradorId);
    await atualizarDependenteNoBanco(cliente, id, dados);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_DEPENDENTE,
      registroId: String(id),
      diff: {
        Origem: { de: null, para: "portal do colaborador (o próprio titular)" },
        ...diffDependente(antes, dados),
      },
    });
  });
  const atualizado = (await listarDependentes(colaboradorId)).find(
    (item) => item.id === id
  );
  if (!atualizado) {
    throw new ErroHttp(500, "Falha ao recarregar o dependente.");
  }
  return projetarDependente(atualizado);
}

export async function removerMeuDependente(id: number): Promise<void> {
  const { sessao, colaboradorId } = await exigirTitular();
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await linhaDoTitular(cliente, id, colaboradorId);
    await excluirDependente(cliente, id);
    // A linha some da tabela; o que ela era fica na trilha. É o único registro
    // que sobra de uma dedução de IRRF que existiu e deixou de existir —
    // rh.dependente não tem vigência (ver docs/pendencias.md).
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "exclusao",
      tabela: TABELA_DEPENDENTE,
      registroId: String(id),
      diff: {
        Origem: { de: null, para: "portal do colaborador (o próprio titular)" },
        Nome: { de: atual.nome, para: null },
        Nascimento: { de: atual.nascimento, para: null },
        Parentesco: { de: ROTULOS_PARENTESCO[atual.parentesco], para: null },
      },
    });
  });
}

async function montarBlocoDocumentos(
  usuarioId: number
): Promise<BlocoDocumentos> {
  // Consulta o repositório do GED com escopo FIXO na própria pessoa
  // (`verTodos: false`) em vez de `listarDocumentos` do serviço: para quem tem
  // `documento.ver.todos` (RH/DP/diretoria) aquele serviço devolve o GED
  // inteiro, e "Meus documentos" é a pasta da pessoa, não o arquivo da empresa.
  // `incluirSensiveis: false` mantém documento sensível fora do portal — quem
  // precisa dele usa /documentos com a chave própria e gera trilha lá.
  //
  // "Pasta da PESSOA" é literal: `vinculosDoUsuario` traz todos os contratos
  // dela no grupo, e não só o corrente. Recortar pelo vínculo corrente sumia com
  // o documento do contrato anterior no dia da transferência entre empresas —
  // justamente quando o trabalhador mais precisa dele.
  const documentos = await listarDocumentosNoBanco({
    usuarioId,
    verTodos: false,
    vinculosDoUsuario: await vinculosDoUsuario(usuarioId),
    incluirSensiveis: false,
  });
  const projetadas = documentos.map((documento) => ({
    id: documento.id,
    titulo: documento.titulo,
    categoria: documento.categoria,
    geral: documento.colaborador_id === null,
    enviado_em: documento.enviado_em,
    ciencia_em: documento.minha_ciencia_em,
  }));
  // O GED não tem coluna "exige ciência": a ciência é registrada quando o
  // usuário confirma (rh.ciencia, append-only com hash). Logo, "aguardando
  // ciência" é derivado — todo documento visível sem a minha ciência. Evolução
  // registrada: quando houver `exige_ciencia` em rh.documento, este filtro
  // passa a olhar a coluna e a lista fica menor e mais honesta.
  return {
    aguardando_ciencia: projetadas.filter(
      (documento) => documento.ciencia_em === null
    ),
    com_ciencia: projetadas.filter((documento) => documento.ciencia_em !== null),
  };
}

async function montarBlocoAvaliacoes(
  colaboradorId: number
): Promise<BlocoAvaliacoes> {
  const [ciclos, pdi] = await Promise.all([
    listarCiclosDoAvaliado(colaboradorId),
    listarPdiDoColaborador(colaboradorId),
  ]);
  return {
    // Regra do MVP: o avaliado não vê o resultado. Sai o FATO (houve um ciclo
    // deste tipo e ele fechou nesta data) e nada mais. O rótulo de andamento é
    // o pobre de propósito (ANDAMENTO_CICLO), não o ROTULOS_STATUS_CICLO do
    // domínio — "Aguardando decisão" já contaria demais a quem é avaliado.
    ciclos: ciclos.map((ciclo) => ({
      id: ciclo.id,
      tipo: ciclo.tipo,
      tipo_rotulo: ROTULOS_TIPO_CICLO[ciclo.tipo],
      andamento: ANDAMENTO_CICLO[ciclo.status],
      concluida_em: ciclo.consolidado_em,
    })),
    pdi: pdi.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      prazo: item.prazo,
      status: item.status,
      status_rotulo: ROTULOS_STATUS_PDI[item.status] ?? item.status,
      responsavel_nome: item.responsavel_nome,
      em_atraso: item.status === "aberta" && item.dias_ate_prazo < 0,
    })),
  };
}

async function montarBlocoCheckin(
  sessao: PayloadSessao
): Promise<BlocoCheckin> {
  const checkin = await obterCheckinDoDia(sessao);
  const pendentes = checkin.perguntas.filter(
    (pergunta) => pergunta.resposta === null
  ).length;
  return {
    data_referencia: checkin.data_referencia,
    respondido: checkin.perguntas.length > 0 && pendentes === 0,
    perguntas_pendentes: pendentes,
    // Texto único do domínio de clima — o portal não reescreve a promessa de
    // confidencialidade com outras palavras.
    aviso_transparencia: AVISO_TRANSPARENCIA,
  };
}

// ------------------------------------------------------------------ visão

export async function montarPortal(
  sessao: PayloadSessao
): Promise<PortalColaborador> {
  // ÚNICA origem do alvo: a sessão. Nunca um parâmetro da requisição.
  const colaboradorId = await colaboradorIdDoUsuario(sessao.usuario_id);
  if (colaboradorId === null) {
    throw new ErroHttp(409, await mensagemSemFicha(sessao.usuario_id));
  }

  // Oito chaves numa consulta só — ver `chavesConcedidas`.
  const concedidas = await chavesConcedidas(sessao.usuario_id, [
    CHAVE_FERIAS,
    CHAVE_DEMANDAS,
    CHAVE_BENEFICIOS,
    CHAVE_DOCUMENTOS,
    CHAVE_CHECKIN,
    CHAVE_DEPENDENTES,
    ...CHAVES_RCF_IMPRIMIVEL,
  ]);
  const pode = {
    ferias: concedidas.has(CHAVE_FERIAS),
    solicitacoes: concedidas.has(CHAVE_DEMANDAS),
    beneficios: concedidas.has(CHAVE_BENEFICIOS),
    documentos: concedidas.has(CHAVE_DOCUMENTOS),
    checkin: concedidas.has(CHAVE_CHECKIN),
    dependentes: concedidas.has(CHAVE_DEPENDENTES),
  };
  const podeAbrirRcfImprimivel = CHAVES_RCF_IMPRIMIVEL.some((chave) =>
    concedidas.has(chave)
  );

  // A ficha vem do serviço de colaboradores com escopo resolvido lá dentro —
  // para quem não tem `rh.colaborador.ver` o alcance é "próprio" e este id é o
  // único que passa. Reuso, e não consulta nova, justamente para herdar essa
  // guarda. `linha_do_tempo` é descartada: é a leitura de gestão, não a do dono.
  const { colaborador } = await obterColaborador(sessao, colaboradorId);

  const meus_dados: MeusDados = {
    colaborador_id: colaborador.id,
    nome_completo: colaborador.nome_completo,
    matricula: colaborador.matricula,
    // O portal parava de existir na borda do contrato corrente. `vinculos` já
    // vem recortado pelo escopo de quem lê — e para a PRÓPRIA pessoa o escopo
    // é a pessoa —, então aqui basta tirar o contrato que já está na tela.
    // Sem isto o portal calava sobre o contrato anterior no mesmo grupo, e o
    // trabalhador não tinha por onde saber que o ponto, o banco de horas e os
    // documentos dele continuavam guardados.
    contratos_anteriores: colaborador.vinculos
      .filter((vinculo) => vinculo.id !== colaborador.id)
      .map((vinculo) => ({
        colaborador_id: vinculo.id,
        matricula: vinculo.matricula,
        empresa_nome: vinculo.empresa_nome,
        data_admissao: vinculo.data_admissao,
        data_desligamento: vinculo.data_desligamento,
      })),
    cargo_nome: colaborador.cargo_nome,
    cargo_id: colaborador.rcf?.cargo_id ?? null,
    // O RCF imprimível (/cargos/[id]/rcf) exige chave de cargo/ficha; quem não
    // tem — o caso do funcionário — encontra o mesmo RCF na própria ficha.
    // Duas portas para o mesmo documento, nenhuma tela quebrada.
    rcf_href:
      colaborador.rcf === null
        ? null
        : podeAbrirRcfImprimivel
          ? `/cargos/${colaborador.rcf.cargo_id}/rcf`
          : `/colaboradores/${colaborador.id}`,
    unidade: colaborador.unidade,
    data_admissao: colaborador.data_admissao,
    dias_de_casa: colaborador.dias_desde_admissao,
    tempo_de_casa: tempoDeCasa(colaborador.data_admissao, hojeSaoPaulo()),
    gestor_nome: colaborador.gestor_nome,
    tipo_vinculo: ROTULOS_VINCULO[colaborador.tipo_vinculo],
    status: ROTULOS_STATUS[colaborador.status],
  };

  const [
    blocoFerias,
    blocoSolicitacoes,
    blocoBeneficios,
    blocoDependentes,
    blocoDocumentos,
    blocoCheckin,
    avaliacoes,
  ] = await Promise.all([
    pode.ferias ? montarBlocoFerias(sessao) : Promise.resolve(null),
    pode.solicitacoes
      ? montarBlocoSolicitacoes(sessao.usuario_id)
      : Promise.resolve(null),
    pode.beneficios
      ? montarBlocoBeneficios(sessao.usuario_id, colaboradorId)
      : Promise.resolve(null),
    pode.dependentes
      ? montarBlocoDependentes(colaboradorId)
      : Promise.resolve(null),
    pode.documentos
      ? montarBlocoDocumentos(sessao.usuario_id)
      : Promise.resolve(null),
    pode.checkin ? montarBlocoCheckin(sessao) : Promise.resolve(null),
    montarBlocoAvaliacoes(colaboradorId),
  ]);

  return {
    pode,
    meus_dados,
    ferias: blocoFerias,
    solicitacoes: blocoSolicitacoes,
    beneficios: blocoBeneficios,
    dependentes: blocoDependentes,
    documentos: blocoDocumentos,
    avaliacoes,
    checkin: blocoCheckin,
    treinamentos: { disponivel: false, explicacao: EXPLICACAO_TREINAMENTOS },
  };
}
