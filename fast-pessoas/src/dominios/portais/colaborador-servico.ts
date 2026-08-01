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
 * Também não há chave de permissão para o portal em si: qualquer sessão
 * autenticada vê o PRÓPRIO portal, do mesmo modo que qualquer sessão vê a
 * própria ficha. Cada BLOCO, porém, respeita a chave do seu domínio (férias
 * exige `ferias.programar`, documentos `documento.ver`, e assim por diante):
 * um perfil recomposto em /perfis que perca uma chave perde o bloco, não o
 * portal inteiro.
 *
 * SALÁRIO: ausente. Ver o comentário de `MeusDados` em colaborador-esquemas.ts.
 */

import { ROTULOS_TIPO_CICLO } from "../avaliacao/esquemas";
import {
  atendeCriterio,
  ROTULOS_CATEGORIA,
  ROTULOS_PARENTESCO,
  interpretarDescricaoSolicitacao,
} from "../beneficios/esquemas";
import {
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
import { ErroHttp, lerSessao } from "../../lib/sessao";
import {
  ANDAMENTO_CICLO,
  BlocoAvaliacoes,
  BlocoBeneficios,
  BlocoCheckin,
  BlocoDocumentos,
  BlocoFerias,
  BlocoSolicitacoes,
  DIAS_ALERTA_FERIAS,
  EXPLICACAO_TREINAMENTOS,
  MeusDados,
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
    return { ativos: [], elegiveis_sem_adesao: [], dependentes: [] };
  }
  const [adesoes, dependentes, beneficios, solicitacoes] = await Promise.all([
    listarAdesoesDoColaborador(colaboradorId),
    listarDependentes(colaboradorId),
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

  return {
    ativos,
    elegiveis_sem_adesao: elegiveis,
    // CPF do dependente fica FORA: minimização por desenho (migration 0009).
    // Nome, parentesco e nascimento bastam para a pessoa conferir quem está
    // coberto pelo plano.
    dependentes: dependentes.map((dependente) => ({
      id: dependente.id,
      nome: dependente.nome,
      parentesco_rotulo: ROTULOS_PARENTESCO[dependente.parentesco],
      nascimento: dependente.nascimento,
    })),
  };
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
    throw new ErroHttp(
      409,
      "Sua conta não está vinculada a uma ficha de colaborador — procure o DP."
    );
  }

  // Oito chaves numa consulta só — ver `chavesConcedidas`.
  const concedidas = await chavesConcedidas(sessao.usuario_id, [
    CHAVE_FERIAS,
    CHAVE_DEMANDAS,
    CHAVE_BENEFICIOS,
    CHAVE_DOCUMENTOS,
    CHAVE_CHECKIN,
    ...CHAVES_RCF_IMPRIMIVEL,
  ]);
  const pode = {
    ferias: concedidas.has(CHAVE_FERIAS),
    solicitacoes: concedidas.has(CHAVE_DEMANDAS),
    beneficios: concedidas.has(CHAVE_BENEFICIOS),
    documentos: concedidas.has(CHAVE_DOCUMENTOS),
    checkin: concedidas.has(CHAVE_CHECKIN),
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

  const [blocoFerias, blocoSolicitacoes, blocoBeneficios, blocoDocumentos, blocoCheckin, avaliacoes] =
    await Promise.all([
      pode.ferias ? montarBlocoFerias(sessao) : Promise.resolve(null),
      pode.solicitacoes
        ? montarBlocoSolicitacoes(sessao.usuario_id)
        : Promise.resolve(null),
      pode.beneficios
        ? montarBlocoBeneficios(sessao.usuario_id, colaboradorId)
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
    documentos: blocoDocumentos,
    avaliacoes,
    checkin: blocoCheckin,
    treinamentos: { disponivel: false, explicacao: EXPLICACAO_TREINAMENTOS },
  };
}
