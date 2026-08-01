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
 

const { comTriggersDesligados, log, executarSozinho } = require('./comum');

/**
 * Contas REAIS preservadas — as que não pertencem à demonstração.
 *
 * Antes isto era `const USUARIO_REAL_ID = 2`, e o id 2 era o da conta do dono
 * NESTE banco, por coincidência de ordem de criação. Em qualquer outro banco
 * — instalação nova, cópia local, produção — o admin recebe outro id, e a
 * limpeza o apagava como se fosse dado de demonstração. Pior: a conferência
 * vinha DEPOIS do DELETE, então a mensagem "abortando para não perder o
 * acesso" era impressa com o acesso já perdido. Reproduzido num banco local
 * onde o admin nasceu com id 1.
 *
 * A regra agora é o que a conta É, não o id que ela calhou de receber: quem
 * NÃO tem e-mail do domínio da demonstração fica. E a contagem é conferida
 * ANTES de apagar qualquer coisa.
 */
const DOMINIO_DEMO = '@fastdemo.local';

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

  // ---- ponto e banco de horas (0027) — tudo aqui é dado de demonstração,
  // criado por 15-ponto.js. O que é CATÁLOGO da migration e NÃO sai:
  // rh.jornada_versao (as 3 jornadas), rh.regra_banco_horas_versao (a regra
  // padrão da empresa) e rh.feriado nacional. Ordem filho → pai: movimento e
  // apuração apontam para colaborador e para a apuração; marcação aponta para
  // o lote; escala aponta para jornada e colaborador.
  'rh.banco_horas_movimento',
  'rh.apuracao_ponto',
  'rh.intercorrencia_ponto',
  'rh.marcacao',
  'rh.lote_importacao_ponto',
  'rh.escala_colaborador',
  // PARCIAL (ver CONDICAO_PARCIAL): a regra padrão da empresa é catálogo e
  // fica; só as versões com escopo saem. Precisa vir DEPOIS de apuracao_ponto
  // (que a referencia) e ANTES de cargo/estabelecimento/colaborador.
  'rh.regra_banco_horas_versao',

  // ---- clima (respostas; as perguntas do CHECK-IN são catálogo)
  'rh_clima.checkin_resposta',

  // ---- pesquisa de clima (0022) — módulo próprio, ao lado do check-in.
  // Aqui NADA é catálogo: pesquisa, questionário, resposta, participação e
  // plano de ação são todos dados de demonstração, criados por 13-pesquisas.js.
  // Ordem filho → pai: plano e resposta/participação apontam para pesquisa;
  // resposta aponta também para pergunta_pesquisa.
  'rh_clima.plano_acao',
  'rh_clima.resposta_pesquisa',
  'rh_clima.participacao_pesquisa',
  'rh_clima.pergunta_pesquisa',
  'rh_clima.pesquisa',

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
  // A avaliação psicossocial da NR-1 (0029) referencia rh.aso: cai ANTES dele.
  'rh.avaliacao_psicossocial',
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
  // A cadeia de aprovação e o pedido de movimentação (0021) apontam para
  // rh.demanda: saem antes dela. `demanda_movimentacao` também referencia
  // posicao_colaborador/lotacao, limpas mais abaixo — esta ordem cobre as duas.
  'rh.etapa_aprovacao_demanda',
  'rh.demanda_movimentacao',
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
  // ---- catálogos da estrutura do grupo (migration 0047). Vêm ANTES de
  // rh.estabelecimento: empresa_grupo.origem_estabelecimento_id (o rastro do
  // backfill que partiu "unidade" em três) aponta para lá.
  'rh.centro_custo_versao',
  'rh.centro_custo',
  'rh.empresa_grupo_versao',
  'rh.empresa_grupo',
  'rh.estabelecimento_versao',
  // PARCIAL: feriado de UNIDADE aponta para o estabelecimento e sai; o
  // nacional é catálogo da 0027 e fica.
  'rh.feriado',
  'rh.estabelecimento',
];

/**
 * Tabelas MISTAS — parte é catálogo semeado por migration, parte é dado de
 * demonstração. Entram na ORDEM_LIMPEZA na posição correta das FKs, mas com
 * um recorte: só o que a demo criou sai.
 *
 * As condições são literais deste arquivo (nunca vêm de fora): a validação de
 * PADRAO_TABELA continua cobrindo o nome da tabela.
 */
const CONDICAO_PARCIAL = {
  'rh.regra_banco_horas_versao':
    'estabelecimento_id IS NOT NULL OR cargo_id IS NOT NULL OR colaborador_id IS NOT NULL',
  'rh.feriado': 'estabelecimento_id IS NOT NULL',
};

// Triggers a desligar: append-only (audit.bloquear_mutacao) e congelamento de
// vigência/versão encerrada bloqueiam DELETE. Desligamos os triggers de
// APLICAÇÃO de todas as tabelas tocadas — os de FK continuam ativos.
const TABELAS_COM_TRIGGER = [...ORDEM_LIMPEZA, 'sistema.usuario', 'rh.pessoa'];

async function semear(cliente) {
  const removidos = {};
  // Quantas contas reais existiam ANTES da limpeza. A guarda de saída compara contra isto, e
  // não contra "pelo menos uma": numa bancada nova eram zero e continuam zero, e isso não é
  // perda de acesso — é banco vazio.
  let reaisAntes = 0;

  await comTriggersDesligados(cliente, TABELAS_COM_TRIGGER, async () => {
    // UM DELETE POR IDA AO BANCO, na ordem filho → pai.
    //
    // Já foi um statement só (55 DELETE juntos), para economizar round-trip num
    // banco remoto. Não dá mais: com o ponto semeado a limpeza passa de 10 mil
    // marcações e o lote inteiro estourava o `statement_timeout` de 2 min do
    // servidor — o timeout é POR STATEMENT, então o que era uma economia virou
    // um teto. Separado, cada tabela tem o orçamento inteiro para si e a
    // mensagem de erro aponta a tabela exata. O custo é ~55 × a latência da
    // conexão, ordens de grandeza abaixo do que a semeadura toda leva.
    for (const tabela of ORDEM_LIMPEZA) {
      const condicao = CONDICAO_PARCIAL[tabela];
      const sql = condicao
        ? `DELETE FROM ${tabela} WHERE ${condicao}`
        : `DELETE FROM ${tabela}`;
       
      const resultado = await cliente.query(sql);
      if (resultado.rowCount > 0) removidos[tabela] = resultado.rowCount;
    }

    // CONFERÊNCIA ANTES DE APAGAR. A guarda antiga conferia depois, então
    // avisava "abortando para não perder o acesso" com o acesso já perdido.
    // A guarda protege CONTA REAL de ser apagada junto com a demonstração. Ela precisa saber
    // distinguir dois casos que dão o mesmo "zero contas reais":
    //
    //   banco EM USO sem conta real  -> a limpeza deixaria todo mundo sem acesso. Aborta.
    //   banco VAZIO (bancada nova)   -> não há o que proteger. Segue.
    //
    // Sem a segunda linha, a bancada por frente do ponto 2 do arnês não nasce: o banco é criado,
    // as 52 migrations entram, e o semeador para no primeiro módulo dizendo que não achou conta
    // real — num banco que ainda não tem conta nenhuma. Foi o que aconteceu na primeira bancada
    // que este projeto tentou criar, minutos depois de a permissão de CREATEDB existir.
    const { rows: antes } = await cliente.query(
      `SELECT count(*)::int                                        AS total,
              count(*) FILTER (WHERE email NOT LIKE $1)::int       AS reais
         FROM sistema.usuario`,
      [`%${DOMINIO_DEMO}`]
    );
    if (antes[0].total > 0 && antes[0].reais === 0) {
      throw new Error(
        `Nenhuma conta real encontrada (nenhum e-mail fora de ${DOMINIO_DEMO}), ` +
          `e existem ${antes[0].total} conta(s) de demonstração. ` +
          'A limpeza apagaria TODOS os acessos — abortando antes de tocar em nada. ' +
          'Rode `node --env-file=.env db/seed-admin.js <email> "<Nome>"` primeiro.'
      );
    }
    reaisAntes = antes[0].reais;

    // Usuários: some com a demonstração, ficam as contas reais.
    const usuarios = await cliente.query(
      'DELETE FROM sistema.usuario WHERE email LIKE $1',
      [`%${DOMINIO_DEMO}`]
    );
    if (usuarios.rowCount > 0) removidos['sistema.usuario'] = usuarios.rowCount;

    // Pessoas: DEPOIS dos vínculos (ORDEM_LIMPEZA) e DEPOIS das contas — as
    // duas apontam para cá (migration 0046). Some quem ficou sem nenhuma das
    // duas, o que preserva a pessoa do usuário real caso ele tenha ficha.
    const pessoas = await cliente.query(
      `DELETE FROM rh.pessoa p
        WHERE NOT EXISTS (SELECT 1 FROM rh.colaborador c WHERE c.pessoa_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM sistema.usuario u WHERE u.pessoa_id = p.id)`
    );
    if (pessoas.rowCount > 0) removidos['rh.pessoa'] = pessoas.rowCount;
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

  // Guarda de saída: as contas reais têm que continuar lá. Redundante com a
  // conferência de entrada, e é para ser mesmo — esta pega o caso de a
  // limpeza ter derrubado a conta por um caminho que ninguém previu (CASCADE
  // de uma FK nova, por exemplo).
  //
  // A comparação é contra o que HAVIA ANTES, não contra "pelo menos uma". Numa bancada nova
  // eram zero antes e são zero depois, e isso não é perda — é banco vazio. Exigir "> 0" aqui
  // reprovava a bancada no último passo, depois de as 52 migrations e quinze módulos já terem
  // rodado. É a mesma guarda da entrada errando pelo mesmo motivo, e por isso as duas foram
  // consertadas juntas.
  const { rows } = await cliente.query(
    'SELECT count(*)::int AS total FROM sistema.usuario WHERE email NOT LIKE $1',
    [`%${DOMINIO_DEMO}`]
  );
  if (rows[0].total < reaisAntes) {
    throw new Error(
      `As contas reais (e-mail fora de ${DOMINIO_DEMO}) sumiram na limpeza — ` +
        'algum caminho não previsto as derrubou. Restaure antes de seguir.'
    );
  }

  return { removidos };
}

module.exports = { semear, ORDEM_LIMPEZA, DOMINIO_DEMO };

if (require.main === module) {
  executarSozinho('00-limpar', semear);
}
