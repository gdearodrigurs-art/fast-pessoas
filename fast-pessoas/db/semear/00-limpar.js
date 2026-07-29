// db/semear/00-limpar.js — zera os dados de DEMONSTRAÇÃO, preservando o que é
// estrutural. Roda antes de todo módulo de semeadura; é o que torna
// `npm run db:demo` repetível (rodar duas vezes dá o mesmo banco).
//
// O QUE SAI: tudo que descreve pessoas, processos e movimento da empresa
//            fictícia — colaboradores, usuários de demo, folha calculada,
//            check-ins, demandas, avaliações, R&S, SST, GED, benefícios…
//
// O QUE FICA (NUNCA apagar):
//   • sistema.usuario id 2 (usuário real do dono do sistema);
//   • sistema.permissao / sistema.papel_permissao (RBAC das migrations);
//   • catálogos estruturais semeados pelas migrations:
//       rh.indicador, rh.tipo_demanda_versao, rh.tipo_desligamento_versao,
//       rh.roteiro_entrevista_versao, rh.checklist_admissao_versao,
//       rh.modelo_avaliacao_versao + rh.pilar_avaliacao +
//       rh.indicador_avaliacao + rh.faixa_resultado_versao,
//       rh.etapa_selecao_versao, rh_clima.pergunta_versao,
//       rh_folha.rubrica(+_versao), rh_folha.tabela_inss_versao,
//       rh_folha.tabela_irrf_versao, rh_folha.parametro_folha_versao,
//       rh_folha.caso_teste_folha;
//   • audit.alteracao e audit.leitura_sensivel — trilha é append-only por
//     decisão de arquitetura; histórico de auditoria NÃO se apaga por reset.
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const { comTriggersDesligados, log, executarSozinho } = require('./comum');

// Usuário real preservado (g.dearodrigurs@gmail.com).
const USUARIO_REAL_ID = 2;

/**
 * Ordem filho → pai, derivada das FKs das migrations 0001–0017.
 * Alterou schema? Confira as FKs novas antes de mexer aqui.
 */
const ORDEM_LIMPEZA = [
  // ---- folha própria (rh_folha): item → folha → competência
  'rh_folha.item_calculo',
  'rh_folha.folha_colaborador',
  'rh_folha.variavel_lancada',
  'rh_folha.competencia_folha',

  // ---- clima (respostas; as perguntas são catálogo)
  'rh_clima.checkin_resposta',

  // ---- notificações internas
  'sistema.notificacao',

  // ---- avaliação 360 (o modelo/pilares/indicadores/faixas são catálogo)
  'rh.resposta_item',
  'rh.avaliacao',
  'rh.decisao_avaliacao',
  'rh.resultado_avaliacao',
  'rh.ciclo_avaliacao',

  // ---- recrutamento e seleção (as etapas são catálogo)
  'rh.oferta',
  'rh.parecer_selecao',
  'rh.movimentacao_candidatura',
  'rh.candidatura',
  'rh.candidato',
  'rh.vaga',
  'rh.requisicao_vaga',

  // ---- desligamento (tipos e roteiro são catálogo)
  'rh.entrevista_desligamento',
  'rh.item_devolucao',
  'rh.verificacao_estabilidade',
  'rh.processo_desligamento',

  // ---- admissão (o checklist é catálogo)
  'rh.item_admissao',
  'rh.processo_admissao',

  // ---- SST (cat tem auto-referência: DELETE sem WHERE resolve de uma vez)
  'rh.cat',
  'rh.epi_entrega',
  'rh.epi_item',
  'rh.aso',

  // ---- férias e afastamentos
  'rh.programacao_ferias',
  'rh.periodo_aquisitivo',
  'rh.afastamento',

  // ---- benefícios (catálogo de benefício é dado de demo, não de migration)
  'rh.dependente',
  'rh.adesao',
  'rh.regra_elegibilidade_versao',
  'rh.beneficio',

  // ---- GED (ciência antes do documento; documento antes do colaborador)
  'rh.ciencia',
  'rh.documento',

  // ---- demandas (os tipos são catálogo)
  'rh.demanda_comentario',
  'rh.demanda_transicao',
  'rh.demanda',

  // ---- metas (o catálogo rh.indicador fica)
  'rh.meta_indicador_versao',

  // ---- núcleo de pessoas
  'rh.acao_aberta',
  'rh.feedback_formal',
  'rh.ocorrencia',
  'rh.relacao_gestor',
  'rh.posicao_colaborador',
  'rh.lotacao',
  'rh.evento_colaborador',
  'rh.colaborador',

  // ---- estrutura organizacional (depois de posição/lotação/requisição)
  'rh.tabela_salarial_versao',
  'rh.cargo_versao',
  'rh.cargo',
  'rh.estabelecimento_versao',
  'rh.estabelecimento',
];

// Triggers a desligar: append-only (audit.bloquear_mutacao) e congelamento de
// vigência/versão encerrada bloqueiam DELETE. Desligamos os triggers de
// APLICAÇÃO de todas as tabelas tocadas — os de FK continuam ativos.
const TABELAS_COM_TRIGGER = [...ORDEM_LIMPEZA, 'sistema.usuario'];

async function semear(cliente) {
  const removidos = {};

  await comTriggersDesligados(cliente, TABELAS_COM_TRIGGER, async () => {
    // Um único statement com todos os DELETE: o banco é remoto e 55 idas e
    // voltas custariam mais que a limpeza inteira. Sem parâmetros, o pg usa o
    // protocolo simples e devolve um resultado por comando, na ordem enviada.
    const resultados = await cliente.query(
      ORDEM_LIMPEZA.map((tabela) => `DELETE FROM ${tabela}`).join('; ')
    );
    const lista = Array.isArray(resultados) ? resultados : [resultados];
    ORDEM_LIMPEZA.forEach((tabela, indice) => {
      const quantidade = lista[indice]?.rowCount ?? 0;
      if (quantidade > 0) removidos[tabela] = quantidade;
    });

    // Usuários: some com todo mundo, MENOS o usuário real (id 2).
    const usuarios = await cliente.query(
      'DELETE FROM sistema.usuario WHERE id <> $1',
      [USUARIO_REAL_ID]
    );
    if (usuarios.rowCount > 0) removidos['sistema.usuario'] = usuarios.rowCount;
  });

  const totais = Object.values(removidos).reduce((a, b) => a + b, 0);
  if (totais === 0) {
    log('00-limpar: banco já estava sem dados de demo.');
  } else {
    log(`00-limpar: ${totais} linha(s) removida(s) em ${Object.keys(removidos).length} tabela(s).`);
    for (const [tabela, quantidade] of Object.entries(removidos)) {
      log(`  - ${tabela}: ${quantidade}`);
    }
  }

  // Guarda de segurança: o usuário real tem que continuar lá.
  const { rows } = await cliente.query(
    'SELECT count(*)::int AS total FROM sistema.usuario WHERE id = $1',
    [USUARIO_REAL_ID]
  );
  if (rows[0].total !== 1) {
    throw new Error(
      `O usuário real (id ${USUARIO_REAL_ID}) sumiu na limpeza — abortando para não perder o acesso.`
    );
  }

  return { removidos };
}

module.exports = { semear, ORDEM_LIMPEZA, USUARIO_REAL_ID };

if (require.main === module) {
  executarSozinho('00-limpar', semear);
}
