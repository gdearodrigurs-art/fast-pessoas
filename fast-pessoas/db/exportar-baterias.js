// db/exportar-baterias.js — leva os casos das baterias do BANCO para dentro do portão.
//
// O ponto 3 do arnês manteve DUAS baterias de propósito: a suíte em arquivo (rede de
// regressão, roda no `npm test` sem banco) e a bateria no banco (ferramenta do DP, que
// acrescenta caso pela tela). Duas baterias sem trava divergem em silêncio, e o caso
// acrescentado pela tela fica FORA do portão — que é justamente o caso mais novo, o que
// ninguém ainda provou.
//
// Esta ferramenta é a trava: exporta os casos ativos das duas tabelas para
// tests/casos-do-banco.json, que o tests/baterias.test.ts roda a cada portão.
//
// Uso:
//   node --env-file=.env.local-db db/exportar-baterias.js --banco fast_pessoas_dev
//   node --env-file=.env.local-db db/exportar-baterias.js --conferir --banco fast_pessoas_dev
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

const DESTINO = path.resolve(__dirname, '..', 'tests', 'casos-do-banco.json');
const RELATIVO = 'tests/casos-do-banco.json';

// Sobe quando a FORMA do arquivo mudar. Quem lê declara a forma que entende, então
// arquivo velho aparece como arquivo velho e não como caso quebrado.
const VERSAO = 1;

const AJUDA = `
db/exportar-baterias.js — grava os casos das baterias do banco em ${RELATIVO}.

  node --env-file=<ambiente> db/exportar-baterias.js --banco <nome> [bandeiras]

Bandeiras:
  --banco <nome>       obrigatório, sem padrão — a ferramenta nunca escolhe banco
  --conferir           NÃO grava: compara o arquivo com o banco e sai 1 se divergirem
  --permitir-remoto    deixa ler banco que não é local (o Supabase é base de apresentação)

Exemplos reais:
  node --env-file=.env.local-db db/exportar-baterias.js --banco fast_pessoas_dev
  node --env-file=.env.local-db db/exportar-baterias.js --conferir --banco fast_pessoas_dev

O --conferir é o passo 4 do fechamento da onda ("a bateria em arquivo e a do banco batem").
Ele existe separado do gravar por um motivo: exportar por cima e declarar verde é
auto-absolvição — o comando que conserta a divergência não pode ser o que a mede.

O que vai no arquivo, e por quê:
  ponto   os casos de rh.caso_teste_ponto — a entrada declara a jornada POR INTEIRO,
          então o caso roda no motor puro sem precisar de mais nada.
  folha   os casos de rh_folha.caso_teste_folha MAIS as rubricas e as três tabelas
          legais vigentes na data de referência. Sem elas o motor da folha não roda
          fora do banco, e a suíte em arquivo é justamente a que não abre conexão.
`;

// ------------------------------------------------------------------ leitura do banco

const casosDe = (tabela) => `
  SELECT nome, descricao, entrada, saida_esperada
    FROM ${tabela}
   WHERE ativo
   ORDER BY nome`;

/** `vigente na data` — a mesma régua de folha/repositorio.ts, que lê versão por DATA. */
const vigenteEm = (alias) => `${alias}.inicio_vigencia <= $1
       AND (${alias}.fim_vigencia IS NULL OR ${alias}.fim_vigencia >= $1)`;

// Uma versão por data; o LIMIT 1 pela mais recente é a mesma rede de segurança do
// repositório, já que o encerramento na véspera é regra do serviço e não trinco do banco.
const naData = (tabela, colunas) => `
  SELECT ${colunas}
    FROM ${tabela} v
   WHERE v.status <> 'rascunho' AND ${vigenteEm('v')}
   ORDER BY v.inicio_vigencia DESC, v.id DESC
   LIMIT 1`;

// Rubricas ordenadas por CÓDIGO, não por (excecao, codigo) como na tela: aqui a ordem é
// só a do diff — o motor as consome por um Map de código. Ordem de tela num arquivo
// versionado vira ruído no dia em que alguém marcar uma rubrica como exceção.
const SQL_RUBRICAS = `
  SELECT rv.id AS rubrica_versao_id, r.codigo, r.nome, r.natureza,
         rv.incide_inss, rv.incide_irrf, rv.incide_fgts,
         rv.tipo_calculo, rv.parametro::text AS parametro
    FROM rh_folha.rubrica r
    JOIN LATERAL (
           SELECT rv.*
             FROM rh_folha.rubrica_versao rv
            WHERE rv.rubrica_id = r.id
              AND rv.status <> 'rascunho'
              AND ${vigenteEm('rv')}
            ORDER BY rv.inicio_vigencia DESC, rv.id DESC
            LIMIT 1) rv ON TRUE
   WHERE r.ativo
   ORDER BY r.codigo`;

/** Dinheiro em CENTAVO INTEIRO. A tabela legal guarda numeric em reais; o motor não. */
function paraCentavos(texto) {
  return Math.round(Number(texto) * 100);
}

// Uma consulta de cada vez, e não Promise.all: são cinco consultas em UM Client, que não
// enfileira — o pg avisa "client.query() when the client is already executing a query" e
// promete remover isso no 9.0. Aqui não há o que ganhar em paralelizar: o arquivo sai em
// menos de um segundo.
async function lerFolha(cliente, dataRef) {
  const casos = await cliente.query(casosDe('rh_folha.caso_teste_folha'));
  const rubricas = await cliente.query(SQL_RUBRICAS, [dataRef]);
  const inss = await cliente.query(
    naData(
      'rh_folha.tabela_inss_versao',
      'v.id, v.faixas, v.teto_contribuicao::text AS teto_contribuicao'
    ),
    [dataRef]
  );
  const irrf = await cliente.query(
    naData(
      'rh_folha.tabela_irrf_versao',
      `v.id, v.faixas,
         v.deducao_por_dependente::text AS deducao_por_dependente,
         v.desconto_simplificado::text AS desconto_simplificado`
    ),
    [dataRef]
  );
  const parametros = await cliente.query(
    naData(
      'rh_folha.parametro_folha_versao',
      `v.id, v.aliquota_fgts::text AS aliquota_fgts,
         v.divisor_mensal_horas::text AS divisor_mensal_horas,
         v.carga_semanal_referencia_minutos,
         v.divisor_mensal_dias::text AS divisor_mensal_dias`
    ),
    [dataRef]
  );

  const faltantes = [
    inss.rows.length ? null : 'INSS',
    irrf.rows.length ? null : 'IRRF',
    parametros.rows.length ? null : 'parâmetros gerais',
  ].filter(Boolean);
  if (faltantes.length) {
    throw new Error(
      `Sem tabela legal vigente em ${dataRef}: ${faltantes.join(', ')}.\n` +
        '  A bateria da folha roda contra as tabelas em vigor — sem elas não há o que exportar.'
    );
  }

  return {
    casos: casos.rows,
    vigentes: {
      parametros: {
        id: Number(parametros.rows[0].id),
        aliquota_fgts: Number(parametros.rows[0].aliquota_fgts),
        divisor_mensal_horas: Number(parametros.rows[0].divisor_mensal_horas),
        carga_semanal_referencia_minutos: Number(
          parametros.rows[0].carga_semanal_referencia_minutos
        ),
        divisor_mensal_dias: Number(parametros.rows[0].divisor_mensal_dias),
      },
      rubricas: rubricas.rows.map((linha) => ({
        rubrica_versao_id: Number(linha.rubrica_versao_id),
        codigo: linha.codigo,
        nome: linha.nome,
        natureza: linha.natureza,
        incide_inss: linha.incide_inss,
        incide_irrf: linha.incide_irrf,
        incide_fgts: linha.incide_fgts,
        tipo_calculo: linha.tipo_calculo,
        parametro: linha.parametro === null ? null : Number(linha.parametro),
      })),
      tabela_inss: {
        id: Number(inss.rows[0].id),
        faixas: inss.rows[0].faixas.map((faixa) => ({
          ate_centavos: paraCentavos(faixa.ate),
          aliquota: faixa.aliquota,
        })),
        teto_centavos: paraCentavos(inss.rows[0].teto_contribuicao),
      },
      tabela_irrf: {
        id: Number(irrf.rows[0].id),
        faixas: irrf.rows[0].faixas.map((faixa) => ({
          ate_centavos: faixa.ate === null ? null : paraCentavos(faixa.ate),
          aliquota: faixa.aliquota,
          deducao_centavos: paraCentavos(faixa.deducao),
        })),
        deducao_dependente_centavos: paraCentavos(irrf.rows[0].deducao_por_dependente),
        desconto_simplificado_centavos: paraCentavos(irrf.rows[0].desconto_simplificado),
      },
    },
  };
}

async function coletar(conexao) {
  return comBanco(conexao, async (cliente) => {
    // A data de referência é HOJE no fuso de negócio (rh.hoje()), a mesma que a suíte da
    // tela usa. É ela que escolhe a versão das tabelas legais — e é por isso que ela vai
    // GRAVADA no arquivo: o dia em que uma tabela nova entra em vigor, o diff mostra a
    // data mudando junto dos números, em vez de números mudando sozinhos.
    const { rows } = await cliente.query('SELECT rh.hoje()::text AS hoje');
    const dataRef = rows[0].hoje;
    const ponto = await cliente.query(casosDe('rh.caso_teste_ponto'));
    const folha = await lerFolha(cliente, dataRef);
    return {
      versao: VERSAO,
      banco: conexao.banco,
      data_referencia: dataRef,
      ponto: { casos: ponto.rows },
      folha,
    };
  });
}

// ------------------------------------------------------------------ o arquivo

/**
 * Chaves ORDENADAS, recursivamente. Array mantém a ordem — quem ordena array é o
 * ORDER BY do SQL, que é onde a ordem tem significado.
 *
 * Isto não é capricho: o db/mapa.js gravava em ordem de chegada e dois retratos do
 * MESMO código davam 1.261 linhas de diff e zero informação. O arquivo é versionado, o
 * diff dele é o sinal, e sinal afogado em ruído ninguém lê.
 */
function comChavesOrdenadas(valor) {
  if (Array.isArray(valor)) return valor.map(comChavesOrdenadas);
  if (valor === null || typeof valor !== 'object') return valor;
  const saida = {};
  for (const chave of Object.keys(valor).sort()) saida[chave] = comChavesOrdenadas(valor[chave]);
  return saida;
}

function serializar(dados) {
  return JSON.stringify(comChavesOrdenadas(dados), null, 2) + '\n';
}

function contar(dados) {
  return `${dados.ponto.casos.length} de ponto + ${dados.folha.casos.length} de folha`;
}

function gravar(dados) {
  fs.writeFileSync(DESTINO, serializar(dados));
  console.log(
    `${RELATIVO}: ${contar(dados)} = ${dados.ponto.casos.length + dados.folha.casos.length} casos ` +
      `de ${dados.banco}, tabelas legais de ${dados.data_referencia}.`
  );
  console.log('Confira o diff e commite: caso que não está no arquivo não passa pelo portão.');
}

// ------------------------------------------------------------------ conferir

/** Nomes que só existem de um lado, e nomes iguais com conteúdo diferente. */
function divergencias(doArquivo, doBanco) {
  const chaveDe = (casos) => new Map(casos.map((caso) => [caso.nome, serializar(caso)]));
  const arquivo = chaveDe(doArquivo);
  const banco = chaveDe(doBanco);
  const linhas = [];
  for (const nome of [...banco.keys()].sort()) {
    if (!arquivo.has(nome)) linhas.push(`  + ${nome} — está no banco e não no arquivo`);
    else if (arquivo.get(nome) !== banco.get(nome)) {
      linhas.push(`  ~ ${nome} — mesmo nome, conteúdo diferente`);
    }
  }
  for (const nome of [...arquivo.keys()].sort()) {
    if (!banco.has(nome)) linhas.push(`  - ${nome} — está no arquivo e não no banco`);
  }
  return linhas;
}

function conferir(dados) {
  if (!fs.existsSync(DESTINO)) {
    throw new Error(
      `${RELATIVO} não existe — a suíte em arquivo não tem os casos do banco.\n` +
        `  Gere com: node --env-file=… db/exportar-baterias.js --banco ${dados.banco}`
    );
  }
  const emDisco = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
  if (emDisco.versao !== VERSAO) {
    throw new Error(
      `${RELATIVO} está na versão ${emDisco.versao} e esta ferramenta escreve a ${VERSAO}.\n` +
        '  Regere o arquivo antes de conferir.'
    );
  }

  const linhas = [
    ...divergencias(emDisco.ponto.casos, dados.ponto.casos).map((l) => `ponto${l}`),
    ...divergencias(emDisco.folha.casos, dados.folha.casos).map((l) => `folha${l}`),
  ];
  if (serializar(emDisco.folha.vigentes) !== serializar(dados.folha.vigentes)) {
    linhas.push(
      'folha  ~ as rubricas/tabelas legais congeladas no arquivo não são as vigentes ' +
        `em ${dados.data_referencia} — os números esperados da folha foram calculados ` +
        'contra outras tabelas'
    );
  }

  if (linhas.length === 0) {
    console.log(
      `Batem: ${contar(dados)} iguais nos dois lados, e as tabelas legais do arquivo são as ` +
        `vigentes em ${dados.data_referencia}.`
    );
    return;
  }
  throw new Error(
    `A bateria em arquivo e a do banco DIVERGEM em ${linhas.length} ponto(s):\n` +
      linhas.join('\n') +
      '\n  Caso que só existe no banco fica fora do portão; caso que só existe no arquivo\n' +
      '  não é mais o que o DP vê na tela. Para alinhar pelo banco:\n' +
      `    node --env-file=… db/exportar-baterias.js --banco ${dados.banco}`
  );
}

// ------------------------------------------------------------------ principal

async function main() {
  const { bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const conexao = resolverConexao(bandeiras);
  exigirLocalOuPermissao(
    conexao,
    bandeiras,
    'A bateria de referência é a do banco de trabalho, não a da base de apresentação.'
  );

  const dados = await coletar(conexao);
  if (bandeiras.conferir) conferir(dados);
  else gravar(dados);
}

main().catch(morrer);
