// db/snapshot.js — os números de referência da bancada, para o antes-e-depois.
//
// Substitui eu digitando "HE 50% = 27333 centavos" de memória dentro de cada prompt de
// agente. Número de referência que mora na cabeça de alguém não é referência: ninguém
// confere, e quando alguém confere já não dá para saber se o número mudou ou se a
// lembrança é que estava errada.
//
// Uso:
//   node --env-file=.env.local-db db/snapshot.js medir --banco fast_pessoas_dev
//   node --env-file=.env.local-db db/snapshot.js tirar antes-da-onda-j --banco fast_pessoas_dev
//   node db/snapshot.js listar
//   node db/snapshot.js comparar antes-da-onda-j depois-da-onda-j
//
// `listar` e `comparar` só leem arquivo — não pedem --banco nem --env-file. `medir` e
// `tirar` abrem conexão e têm trava.
//
// `medir` existe pelo mesmo motivo que `node db/mapa.js` sem "retrato" existe: ver os
// números não pode custar gravar a linha de base. Quem grava a referência apaga o
// próprio gatilho, e por isso `tirar` é do fechamento da onda; `medir` é de qualquer um,
// a qualquer hora, e não escreve nada.
//
// ------------------------------------------------------------------ o que é medido
//
// SÓ NÚMERO QUE NÃO DEPENDE DO RELÓGIO. O semeador tem 34 leituras de relógio, então
// qualquer número derivado de "hoje" — vencidos, a vencer, saldo corrente, idade —
// muda sozinho na virada do dia. Alarme que toca sozinho é alarme que ninguém lê, e
// alarme que ninguém lê é pior que alarme nenhum: dá a sensação de estar vigiado.
//
// Ficam: contagem de estrutura, integridade referencial (que tem que ser zero),
// parâmetro administrável, e soma em centavo inteiro de competência JÁ FECHADA —
// competência fechada não muda mais, é essa a única razão de ela poder entrar aqui.
//
// O que ficou de fora está no campo `excluidos` do próprio arquivo gravado, com o
// motivo ao lado. Exclusão sem motivo escrito vira exclusão esquecida.
const fs = require('fs');
const path = require('path');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocalOuPermissao,
  comBanco,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

// O repositório é a pasta acima de fast-pessoas — é lá que mora docs/.
const PASTA = path.join(__dirname, '..', '..', 'docs', 'snapshots');

// A sentinela do fechamento. O hook do PreToolUse já barra `snapshot.js … tirar`, mas
// aquilo é trava por GRAFIA: alias novo, script novo no package.json ou caminho diferente
// passam por cima — foi o que aconteceu com o `npm run mapa:retrato`, acrescentado duas
// horas antes do deny que devia cobri-lo. Hook guarda o que o agente faz direto; o que o
// nosso script faz, o script guarda. Por isso a trava está aqui também.
const SENTINELA = 'ARNES_FECHAMENTO';

const AJUDA = `
db/snapshot.js — os números de referência da bancada, para o antes-e-depois.

  medir                     mede o banco e imprime; NÃO grava nada
  tirar <nome>              mede o banco e grava docs/snapshots/<nome>.json
  listar                    lista os retratos já gravados
  comparar <a> <b>          imprime só o que mudou; sai 1 se mudou alguma coisa

Exemplos reais:
  node --env-file=.env.local-db db/snapshot.js medir --banco fast_pessoas_dev
  node --env-file=.env.local-db db/snapshot.js tirar antes-da-onda-j --banco fast_pessoas_dev
  node --env-file=.env.local-db db/snapshot.js tirar depois-da-onda-j --banco fast_pessoas_dev
  node db/snapshot.js listar
  node db/snapshot.js comparar antes-da-onda-j depois-da-onda-j

Bandeiras:
  --banco <nome>     obrigatória em "medir" e "tirar"; não existe valor padrão
  --json             saída de máquina (em "medir")
  --refazer          "tirar" por cima de um retrato que já existe
  --permitir-remoto  deixa "medir"/"tirar" rodarem fora do banco local

Gravar a linha de base é ato do fechamento da onda — quem retrata antes de alguém
julgar apaga o próprio gatilho. Para só ver os números, use "medir".
`;

// Cada medida carrega a consulta que a gerou, na mesma linha. É a regra do mapa de
// eixos aplicada aqui: número que decide coisa vem com o comando ao lado, senão ele
// vira folclore em duas ondas.
const MEDIDAS = [
  // ----------------------------------------------------------------- estrutura
  ['estrutura.pessoa', 'SELECT count(*) FROM rh.pessoa'],
  ['estrutura.vinculo', 'SELECT count(*) FROM rh.colaborador'],
  ['estrutura.vinculo_ativo', "SELECT count(*) FROM rh.colaborador WHERE status = 'ativo'"],
  ['estrutura.vinculo_desligado', "SELECT count(*) FROM rh.colaborador WHERE status = 'desligado'"],
  // Contar gente e contar contrato são coisas diferentes; esta linha é o que denuncia
  // quando as duas de cima começam a divergir por transferência entre CNPJs.
  [
    'estrutura.pessoa_com_mais_de_um_vinculo',
    'SELECT count(*) FROM (SELECT pessoa_id FROM rh.colaborador GROUP BY pessoa_id HAVING count(*) > 1) x',
  ],
  ['estrutura.empresa_grupo', 'SELECT count(*) FROM rh.empresa_grupo'],
  ['estrutura.empresa_ativa', 'SELECT count(*) FROM rh.empresa_grupo WHERE inativada_em IS NULL'],
  ['estrutura.estabelecimento', 'SELECT count(*) FROM rh.estabelecimento'],
  ['estrutura.centro_custo', 'SELECT count(*) FROM rh.centro_custo'],
  ['estrutura.centro_custo_ativo', 'SELECT count(*) FROM rh.centro_custo WHERE inativado_em IS NULL'],
  ['estrutura.lotacao', 'SELECT count(*) FROM rh.lotacao'],
  ['estrutura.cargo', 'SELECT count(*) FROM rh.cargo'],
  ['estrutura.cargo_versao', 'SELECT count(*) FROM rh.cargo_versao'],
  ['estrutura.posicao_colaborador', 'SELECT count(*) FROM rh.posicao_colaborador'],
  ['estrutura.relacao_gestor', 'SELECT count(*) FROM rh.relacao_gestor'],
  ['estrutura.dependente', 'SELECT count(*) FROM rh.dependente'],
  ['estrutura.usuario', 'SELECT count(*) FROM sistema.usuario'],
  ['estrutura.usuario_ativo', 'SELECT count(*) FROM sistema.usuario WHERE ativo'],

  // ----------------------------------------------------------------- acesso
  ['acesso.chave_permissao', 'SELECT count(*) FROM sistema.permissao'],
  ['acesso.chave_que_exige_2fa', 'SELECT count(*) FROM sistema.permissao WHERE exige_2fa'],
  ['acesso.papel', 'SELECT count(DISTINCT papel) FROM sistema.papel_permissao'],
  ['acesso.papel_permissao', 'SELECT count(*) FROM sistema.papel_permissao'],
  // Chave que nenhum papel tem é chave que ninguém exerce — ou sobra de migration, ou
  // permissão nova que ficou sem dono.
  [
    'acesso.chave_sem_nenhum_papel',
    'SELECT count(*) FROM sistema.permissao p WHERE NOT EXISTS ' +
      '(SELECT 1 FROM sistema.papel_permissao pp WHERE pp.chave = p.chave)',
  ],

  // ----------------------------------------------------------------- configuração
  ['config.jornada_versao', 'SELECT count(*) FROM rh.jornada_versao'],
  ['config.jornada_ativa', "SELECT count(*) FROM rh.jornada_versao WHERE status = 'ativa'"],
  // Jornada criada pela tela já nasceu sem os parâmetros do noturno uma vez. Enquanto
  // esta linha for zero, não nasceu de novo.
  [
    'config.jornada_sem_parametro_do_noturno',
    'SELECT count(*) FROM rh.jornada_versao WHERE hora_noturna_segundos IS NULL ' +
      'OR adicional_noturno_inicio IS NULL OR adicional_noturno_fim IS NULL ' +
      'OR intervalo_obrigatorio_acima_minutos IS NULL OR janela_arraste_minutos IS NULL',
  ],
  ['config.feriado', 'SELECT count(*) FROM rh.feriado'],
  ['config.rubrica', 'SELECT count(*) FROM rh_folha.rubrica'],
  ['config.rubrica_ativa', 'SELECT count(*) FROM rh_folha.rubrica WHERE ativo'],
  ['config.rubrica_versao', 'SELECT count(*) FROM rh_folha.rubrica_versao'],
  ['config.parametro_folha_versao', 'SELECT count(*) FROM rh_folha.parametro_folha_versao'],
  ['config.tabela_inss_versao', 'SELECT count(*) FROM rh_folha.tabela_inss_versao'],
  ['config.tabela_irrf_versao', 'SELECT count(*) FROM rh_folha.tabela_irrf_versao'],
  ['config.tipo_demanda_versao', 'SELECT count(*) FROM rh.tipo_demanda_versao'],
  ['config.tipo_desligamento_versao', 'SELECT count(*) FROM rh.tipo_desligamento_versao'],
  ['config.regra_elegibilidade_versao', 'SELECT count(*) FROM rh.regra_elegibilidade_versao'],
  ['config.regra_banco_horas_versao', 'SELECT count(*) FROM rh.regra_banco_horas_versao'],
  ['config.faixa_resultado_versao', 'SELECT count(*) FROM rh.faixa_resultado_versao'],
  ['config.modelo_avaliacao_versao', 'SELECT count(*) FROM rh.modelo_avaliacao_versao'],
  ['config.tabela_salarial_versao', 'SELECT count(*) FROM rh.tabela_salarial_versao'],
  ['config.indicador', 'SELECT count(*) FROM rh.indicador'],
  ['config.caso_teste_folha', 'SELECT count(*) FROM rh_folha.caso_teste_folha'],
  ['config.caso_teste_ponto', 'SELECT count(*) FROM rh.caso_teste_ponto'],
  ['config.piso_anonimato', 'SELECT minimo_por_recorte FROM sistema.parametro_privacidade ORDER BY id LIMIT 1'],

  // ----------------------------------------------------------------- dinheiro e tempo
  // Os administráveis, na versão ativa. Selecionar por status e não por vigência é de
  // propósito: vigência se resolve com "hoje", e aí o número muda sozinho.
  [
    'dinheiro.divisor_mensal_horas',
    "SELECT divisor_mensal_horas FROM rh_folha.parametro_folha_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],
  [
    'dinheiro.divisor_mensal_dias',
    "SELECT divisor_mensal_dias FROM rh_folha.parametro_folha_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],
  [
    'dinheiro.carga_semanal_referencia_minutos',
    "SELECT carga_semanal_referencia_minutos FROM rh_folha.parametro_folha_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],
  [
    'dinheiro.salario_minimo_centavos',
    "SELECT (round(salario_minimo * 100))::bigint FROM rh_folha.parametro_folha_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],
  [
    'dinheiro.teto_inss_centavos',
    "SELECT (round(teto_contribuicao * 100))::bigint FROM rh_folha.tabela_inss_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],
  [
    'dinheiro.deducao_dependente_irrf_centavos',
    "SELECT (round(deducao_por_dependente * 100))::bigint FROM rh_folha.tabela_irrf_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],
  [
    'dinheiro.desconto_simplificado_irrf_centavos',
    "SELECT (round(desconto_simplificado * 100))::bigint FROM rh_folha.tabela_irrf_versao WHERE status = 'ativa' ORDER BY id LIMIT 1",
  ],

  // ----------------------------------------------------------------- integridade
  // Estas têm que ser zero. Quando uma delas sobe, alguém escreveu por fora da regra.
  ['integridade.vinculo_sem_pessoa', 'SELECT count(*) FROM rh.colaborador WHERE pessoa_id IS NULL'],
  ['integridade.vinculo_sem_usuario', 'SELECT count(*) FROM rh.colaborador WHERE usuario_id IS NULL'],
  [
    'integridade.vinculo_com_cpf_diferente_da_pessoa',
    'SELECT count(*) FROM rh.colaborador c JOIN rh.pessoa p ON p.id = c.pessoa_id ' +
      'WHERE p.cpf IS DISTINCT FROM c.cpf',
  ],
  ['integridade.lotacao_sem_empresa', 'SELECT count(*) FROM rh.lotacao WHERE empresa_id IS NULL'],
  ['integridade.lotacao_sem_centro_custo', 'SELECT count(*) FROM rh.lotacao WHERE centro_custo_id IS NULL'],
  // Centro de custo é de UMA empresa. Lotação apontando para o centro de custo de outra
  // é vazamento entre CNPJs pela porta dos fundos — a chave estrangeira não pega, porque
  // cada uma das duas colunas está certa sozinha.
  [
    'integridade.lotacao_com_centro_custo_de_outra_empresa',
    'SELECT count(*) FROM rh.lotacao l JOIN rh.centro_custo cc ON cc.id = l.centro_custo_id ' +
      'WHERE cc.empresa_id IS DISTINCT FROM l.empresa_id',
  ],
  [
    'integridade.centro_custo_ativo_de_empresa_inativa',
    'SELECT count(*) FROM rh.centro_custo cc JOIN rh.empresa_grupo e ON e.id = cc.empresa_id ' +
      'WHERE cc.inativado_em IS NULL AND e.inativada_em IS NOT NULL',
  ],
  [
    'integridade.vinculo_com_duas_lotacoes_abertas',
    'SELECT count(*) FROM (SELECT colaborador_id FROM rh.lotacao WHERE fim_vigencia IS NULL ' +
      'GROUP BY colaborador_id HAVING count(*) > 1) x',
  ],
  [
    'integridade.vinculo_com_duas_posicoes_abertas',
    'SELECT count(*) FROM (SELECT colaborador_id FROM rh.posicao_colaborador WHERE fim_vigencia IS NULL ' +
      'GROUP BY colaborador_id HAVING count(*) > 1) x',
  ],
  // Liderança encerra com o contrato. Estas duas linhas são o portão da onda J-1.
  [
    'integridade.lideranca_aberta_de_vinculo_encerrado',
    'SELECT count(*) FROM rh.relacao_gestor rg JOIN rh.colaborador c ON c.id = rg.liderado_colaborador_id ' +
      "WHERE rg.fim_vigencia IS NULL AND c.status <> 'ativo'",
  ],
  [
    'integridade.lideranca_aberta_com_gestor_encerrado',
    'SELECT count(*) FROM rh.relacao_gestor rg JOIN rh.colaborador c ON c.id = rg.gestor_colaborador_id ' +
      "WHERE rg.fim_vigencia IS NULL AND c.status <> 'ativo'",
  ],
  [
    'integridade.papel_de_usuario_sem_nenhuma_chave',
    'SELECT count(*) FROM sistema.usuario u WHERE NOT EXISTS ' +
      '(SELECT 1 FROM sistema.papel_permissao pp WHERE pp.papel = u.papel)',
  ],
  ['integridade.rubrica_sem_versao',
    'SELECT count(*) FROM rh_folha.rubrica r WHERE NOT EXISTS ' +
      '(SELECT 1 FROM rh_folha.rubrica_versao rv WHERE rv.rubrica_id = r.id)',
  ],
  [
    'integridade.folha_fechada_sem_item',
    'SELECT count(*) FROM rh_folha.folha_colaborador f JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id ' +
      "WHERE c.estado = 'fechada' AND NOT EXISTS " +
      '(SELECT 1 FROM rh_folha.item_calculo i WHERE i.folha_colaborador_id = f.id)',
  ],
  [
    'integridade.folha_fechada_com_liquido_divergente',
    'SELECT count(*) FROM rh_folha.folha_colaborador f JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id ' +
      "WHERE c.estado = 'fechada' AND round(f.total_proventos - f.total_descontos, 2) <> round(f.liquido, 2)",
  ],
  [
    'integridade.competencia_fechada_sem_quem_fechou',
    "SELECT count(*) FROM rh_folha.competencia_folha WHERE estado = 'fechada' AND fechada_por IS NULL",
  ],

  // ----------------------------------------------------------------- folha fechada
  ['folha.fechada.competencias', "SELECT count(*) FROM rh_folha.competencia_folha WHERE estado = 'fechada'"],
];

// Medidas que rendem várias chaves de uma consulta só — uma por competência fechada,
// uma por rubrica. A consulta devolve (chave, valor) pronto.
const MEDIDAS_EM_LOTE = [
  {
    descricao: 'totais de cada competência fechada',
    sql: `
      WITH fechada AS (
        SELECT c.id, c.ano, c.mes,
               count(f.id)::bigint AS folhas,
               (SELECT count(*) FROM rh_folha.item_calculo i
                  JOIN rh_folha.folha_colaborador f2 ON f2.id = i.folha_colaborador_id
                 WHERE f2.competencia_id = c.id)::bigint AS itens,
               (round(coalesce(sum(f.total_proventos), 0) * 100))::bigint AS proventos,
               (round(coalesce(sum(f.total_descontos), 0) * 100))::bigint AS descontos,
               (round(coalesce(sum(f.liquido), 0) * 100))::bigint AS liquido
          FROM rh_folha.competencia_folha c
          LEFT JOIN rh_folha.folha_colaborador f ON f.competencia_id = c.id
         WHERE c.estado = 'fechada'
         GROUP BY c.id, c.ano, c.mes
      )
      SELECT 'folha.fechada.' || ano || '-' || lpad(mes::text, 2, '0') || '.' || item.nome AS chave,
             item.valor AS valor
        FROM fechada,
             LATERAL (VALUES ('folhas', folhas),
                             ('itens', itens),
                             ('proventos_centavos', proventos),
                             ('descontos_centavos', descontos),
                             ('liquido_centavos', liquido)) AS item(nome, valor)`,
  },
  {
    // É esta a linha que substitui o "HE 50% = 27333 centavos" digitado de memória:
    // o total de cada rubrica somando todas as competências já fechadas.
    descricao: 'total por rubrica nas competências fechadas',
    sql: `
      SELECT 'folha.fechada.rubrica.' || r.codigo || '.centavos' AS chave,
             (round(sum(i.valor) * 100))::bigint AS valor
        FROM rh_folha.item_calculo i
        JOIN rh_folha.folha_colaborador f ON f.id = i.folha_colaborador_id
        JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id
        JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
        JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
       WHERE c.estado = 'fechada'
       GROUP BY r.codigo`,
  },
];

// Fica gravado dentro do próprio retrato. Exclusão sem motivo escrito na cara de quem
// lê o arquivo vira exclusão esquecida — e depois alguém "conserta" a falta.
const EXCLUIDOS = [
  {
    medida: 'marcações e apurações de ponto',
    porque:
      'o semeador cria a janela de ponto contando para trás a partir de hoje; a contagem muda sozinha todo dia',
  },
  {
    medida: 'férias vencidas, a vencer e período aquisitivo em aberto',
    porque: 'tudo derivado de "hoje" — vira vermelho na virada do dia sem ninguém ter mexido em nada',
  },
  {
    medida: 'saldo corrente de banco de horas',
    porque: 'expira por data e é recalculado; só o movimento fechado seria estável, e ele ainda não existe separado',
  },
  {
    medida: 'competência de folha aberta',
    porque: 'ainda muda de propósito — só competência fechada pode servir de referência',
  },
  {
    medida: 'ASO vencido, ASO a vencer, idade e aniversariantes',
    porque: 'todos comparam com a data de hoje',
  },
  {
    medida: 'notificações e trilha de leitura sensível',
    porque: 'crescem a cada acesso, inclusive o do próprio verificador',
  },
  {
    medida: 'versão vigente por data (rubrica, cargo, jornada, tabela)',
    porque: 'vigência se resolve com "hoje"; por isso aqui se conta por status, não por vigência',
  },
  {
    medida: 'quais competências fechadas existem',
    porque:
      'as somas por competência são estáveis dentro de um banco, mas o semeador nomeia a competência a partir do mês corrente — ' +
      'banco ressemeado em outro mês troca as chaves, e é isso que o "apareceu/sumiu" do comparar vai mostrar',
  },
];

function caminhoDe(nome) {
  return path.join(PASTA, `${nome}.json`);
}

function validarNome(nome) {
  if (!nome || nome === true) {
    throw new Error('Falta o nome do retrato.\n  Exemplo: db/snapshot.js tirar antes-da-onda-j --banco fast_pessoas_dev');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nome)) {
    throw new Error(
      `Nome de retrato inválido: "${nome}". Só minúscula, número e hífen — ` +
        'ele vira nome de arquivo versionado no git, não caminho.'
    );
  }
  return nome;
}

function lerRetrato(nome) {
  const arquivo = caminhoDe(nome);
  if (!fs.existsSync(arquivo)) {
    throw new Error(
      `Não existe o retrato "${nome}".\n  Veja os que existem com: node db/snapshot.js listar`
    );
  }
  const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  if (!dados || typeof dados.medidas !== 'object') {
    throw new Error(`${path.relative(process.cwd(), arquivo)} não tem o campo "medidas" — não é um retrato.`);
  }
  return dados;
}

// Todo valor tem que ser inteiro: contagem é inteiro, dinheiro é centavo, tempo é
// minuto. Valor quebrado aqui é consulta esquecendo de multiplicar por 100 — e um
// número de referência com casa decimal cria diferença que não é diferença.
function exigirInteiro(chave, bruto) {
  const valor = Number(bruto);
  if (!Number.isSafeInteger(valor)) {
    throw new Error(
      `A medida "${chave}" devolveu ${JSON.stringify(bruto)}, que não é inteiro seguro.\n` +
        '  Dinheiro é centavo inteiro e tempo é minuto inteiro — a consulta precisa converter.'
    );
  }
  return valor;
}

async function coletar(conexao) {
  const medidas = {};
  await comBanco(conexao, async (cliente) => {
    for (const [chave, sql] of MEDIDAS) {
      const { rows } = await cliente.query(sql);
      const bruto = rows.length ? Object.values(rows[0])[0] : null;
      medidas[chave] = exigirInteiro(chave, bruto);
    }
    for (const lote of MEDIDAS_EM_LOTE) {
      const { rows } = await cliente.query(lote.sql);
      for (const linha of rows) medidas[linha.chave] = exigirInteiro(linha.chave, linha.valor);
    }
  });

  // Chaves ORDENADAS antes de gravar. O db/mapa.js gravava em ordem de chegada e dois
  // retratos do mesmo código davam 1.261 linhas de diff e zero informação. O arquivo é
  // versionado: o diff dele é o sinal, e sinal afogado em ruído ninguém lê.
  const ordenadas = {};
  for (const chave of Object.keys(medidas).sort()) ordenadas[chave] = medidas[chave];
  return ordenadas;
}

async function medir(conexao, bandeiras) {
  const medidas = await coletar(conexao);
  if (bandeiras.json) {
    console.log(JSON.stringify({ banco: conexao.banco, excluidos: EXCLUIDOS, medidas }, null, 2));
    return;
  }
  const chaves = Object.keys(medidas);
  const largura = Math.max(...chaves.map((c) => c.length));
  for (const chave of chaves) {
    console.log(`${chave.padEnd(largura)}  ${String(medidas[chave]).padStart(10)}`);
  }
  console.log(`\n${chaves.length} medidas de ${conexao.banco}. Nada foi gravado — isto é "medir".`);
  console.log(`${EXCLUIDOS.length} famílias de medida ficaram de fora por dependerem do relógio; o`);
  console.log('motivo de cada uma vai no campo "excluidos" do arquivo que o "tirar" grava.');
}

async function tirar(conexao, bandeiras, nome) {
  // Quem grava a referência apaga o próprio gatilho: o retrato é a linha de base contra a
  // qual a mudança desta onda seria detectada. A ordem é rígida — conferir, julgar,
  // retratar — e retratar é o último passo do fechamento. Não é segredo, é declaração de
  // contexto: quem puser a variável escolheu contornar, em vez de tropeçar sem perceber.
  if (process.env[SENTINELA] !== '1') {
    throw new Error(
      'Gravar retrato é ato do fechamento da onda.\n' +
        '  Quem retrata antes de alguém julgar apaga a evidência que o julgamento consome.\n' +
        `  Para só ver os números, sem gravar nada:\n` +
        `    node --env-file=… db/snapshot.js medir --banco ${conexao.banco}\n` +
        `  O fechamento declara ${SENTINELA}=1 no próprio comando.`
    );
  }

  const arquivo = caminhoDe(nome);
  if (fs.existsSync(arquivo) && !bandeiras.refazer) {
    throw new Error(
      `O retrato "${nome}" já existe.\n` +
        '  Sobrescrever em silêncio faz o número de referência deixar de ser referência.\n' +
        '  Se é isso mesmo, repita o comando com --refazer.'
    );
  }

  const ordenadas = await coletar(conexao);

  const retrato = {
    versao: 1,
    nome,
    banco: conexao.banco,
    host: conexao.host,
    gerado_em: new Date().toISOString(),
    excluidos: EXCLUIDOS,
    medidas: ordenadas,
  };

  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(retrato, null, 2) + '\n');
  const total = Object.keys(ordenadas).length;
  console.log(`retrato "${nome}": ${total} medidas de ${conexao.banco} em docs/snapshots/${nome}.json`);
}

function listar() {
  if (!fs.existsSync(PASTA)) {
    console.log('Nenhum retrato ainda. O primeiro sai de: db/snapshot.js tirar <nome> --banco <nome>');
    return;
  }
  const nomes = fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
  if (!nomes.length) {
    console.log('Nenhum retrato ainda. O primeiro sai de: db/snapshot.js tirar <nome> --banco <nome>');
    return;
  }
  for (const nome of nomes) {
    let dados;
    try {
      dados = JSON.parse(fs.readFileSync(caminhoDe(nome), 'utf8'));
    } catch (e) {
      console.log(`${nome.padEnd(24)}  ilegível — ${e.message}`);
      continue;
    }
    const total = Object.keys(dados.medidas || {}).length;
    console.log(
      `${nome.padEnd(24)}  ${String(total).padStart(3)} medidas  ${dados.banco || '?'}  ${dados.gerado_em || '?'}`
    );
  }
  console.log(`\n${nomes.length} retrato(s) em docs/snapshots/`);
}

function comparar(nomeA, nomeB) {
  const a = lerRetrato(nomeA);
  const b = lerRetrato(nomeB);
  const chaves = [...new Set([...Object.keys(a.medidas), ...Object.keys(b.medidas)])].sort();

  const diferencas = [];
  for (const chave of chaves) {
    const antes = a.medidas[chave];
    const agora = b.medidas[chave];
    // Chave que sumiu ou apareceu também é diferença: medida que deixou de existir é
    // exatamente o jeito silencioso de um número de referência sumir do mapa.
    if (antes === undefined) diferencas.push({ chave, tipo: 'apareceu', agora });
    else if (agora === undefined) diferencas.push({ chave, tipo: 'sumiu', antes });
    else if (antes !== agora) diferencas.push({ chave, tipo: 'mudou', antes, agora });
  }

  console.log(`${nomeA} -> ${nomeB}`);
  if (!diferencas.length) {
    console.log(`\nas ${chaves.length} medidas batem.`);
    return 0;
  }

  const larguraChave = Math.max(...diferencas.map((d) => d.chave.length));
  console.log('');
  for (const d of diferencas) {
    const nome = d.chave.padEnd(larguraChave);
    if (d.tipo === 'apareceu') {
      console.log(`+ ${nome}  ${d.agora}   (chave nova, não existia em ${nomeA})`);
    } else if (d.tipo === 'sumiu') {
      console.log(`- ${nome}  ${d.antes}   (sumiu em ${nomeB})`);
    } else {
      const delta = d.agora - d.antes;
      console.log(`~ ${nome}  ${d.antes} -> ${d.agora}   (${delta > 0 ? '+' : ''}${delta})`);
    }
  }
  console.log(`\n${diferencas.length} de ${chaves.length} medidas mudaram.`);
  return 1;
}

async function main() {
  const { livres, bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const comando = livres[0];
  if (!comando) {
    throw new Error(
      'Falta o comando: medir, tirar, listar ou comparar.\n  Veja: node db/snapshot.js --help'
    );
  }

  if (comando === 'listar') {
    listar();
    return 0;
  }

  if (comando === 'comparar') {
    const [, a, b] = livres;
    if (!a || !b) {
      throw new Error(
        'comparar precisa de DOIS retratos.\n' +
          '  Exemplo: node db/snapshot.js comparar antes-da-onda-j depois-da-onda-j'
      );
    }
    return comparar(validarNome(a), validarNome(b));
  }

  if (comando === 'medir' || comando === 'tirar') {
    // O nome só é exigido por "tirar" — "medir" não produz arquivo.
    const nome = comando === 'tirar' ? validarNome(livres[1]) : null;
    const conexao = resolverConexao(bandeiras);
    exigirLocalOuPermissao(
      conexao,
      bandeiras,
      'Retrato é medida da bancada; o remoto é base de apresentação e ninguém mede trabalho nele.'
    );
    if (comando === 'medir') await medir(conexao, bandeiras);
    else await tirar(conexao, bandeiras, nome);
    return 0;
  }

  throw new Error(
    `Comando desconhecido: "${comando}". Os que existem: medir, tirar, listar, comparar.`
  );
}

main()
  .then((codigo) => process.exit(codigo || 0))
  .catch(morrer);
