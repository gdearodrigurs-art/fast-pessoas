// db/semear/08-avaliacao.js — AVALIAÇÃO 360 (líder→liderado) com resultados.
//
// O que este módulo conta na demonstração:
//
//   1) um CICLO DE DESEMPENHO em lote, aberto há ~2 meses e com o prazo já
//      vencido: 25 pessoas avaliadas de ponta a ponta (resposta em todos os 15
//      indicadores do modelo v1, avaliação enviada, resultado consolidado com
//      memória de cálculo) + 3 retardatários (2 rascunhos parciais e 1 sequer
//      aberto) para o painel ter atraso de verdade;
//   2) uma CURVA proposital de resultados — 2 em "Plano de recuperação",
//      4 em "Atenção", 12 em "Desenvolver" e 7 em "Sucessão" — que sustenta a
//      conversa sobre distribuição, e não só sobre notas soltas;
//   3) 15 DECISÕES humanas, 3 delas DIVERGENTES da recomendação da faixa (com
//      justificativa obrigatória), e 10 ciclos consolidados AGUARDANDO decisão
//      — pendência viva na tela do DP;
//   4) CONTRATO DE EXPERIÊNCIA: marco de 45 dias decidido (renovar) para os
//      admitidos CLT recentes e o marco de 90 dias ABERTO com prazo próximo —
//      é a fila que o gestor responde ao vivo;
//   5) EVENTO na linha do tempo de cada avaliado decidido, com faixa e decisão
//      e SEM nota bruta nem percentual (mesmo resumo que o serviço grava).
//
// O resultado NÃO é inventado: este arquivo replica fielmente o motor de
// src/dominios/avaliacao/calculo.ts (peso normalizado por pilar, "não
// observado" fora do denominador, arredondamento só no percentual final,
// faixa em [minimo, maximo) com 100 fechando a última). As notas é que são
// geradas para cair na faixa pretendida — nunca o percentual.
//
// Idempotente: apaga tudo que ele cria (ciclos, avaliações, respostas,
// resultados, decisões e os eventos com origem rh.ciclo_avaliacao) e insere de
// novo. Roda sozinho: node --env-file=.env db/semear/08-avaliacao.js
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  comTriggersDesligados,
  contar,
  dataRelativa,
  embaralhar,
  executarSozinho,
  aleatorio,
  inserirLote,
  inteiro,
  iso,
  log,
} = require('./comum');

// Semente fixa: rodar de novo produz exatamente as mesmas notas e decisões.
const SEMENTE = 0x360ada1;

const NOTA_MAXIMA = 5; // igual a src/dominios/avaliacao/esquemas.ts

const TABELA_CICLO = 'rh.ciclo_avaliacao';

// Rótulos copiados de src/dominios/avaliacao/esquemas.ts (o resumo do evento
// na linha do tempo tem que sair idêntico ao que o serviço grava).
const ROTULOS_TIPO_CICLO = {
  experiencia_45: 'Experiência — dia 45',
  experiencia_90: 'Experiência — dia 90',
  desempenho: 'Desempenho',
};
const ROTULOS_DECISAO = {
  manter: 'Manter na função',
  desenvolver: 'Plano de desenvolvimento',
  renovar: 'Renovar contrato de experiência',
  nao_renovar: 'Não renovar contrato de experiência',
  desligar: 'Encaminhar desligamento',
};
const DECISOES_ALINHADAS = {
  recuperar: ['desenvolver', 'nao_renovar', 'desligar'],
  atencao: ['manter', 'desenvolver', 'renovar'],
  desenvolver: ['manter', 'desenvolver', 'renovar'],
  sucessao: ['manter', 'desenvolver', 'renovar'],
};

function decisaoDiverge(recomendacao, decisao) {
  return !DECISOES_ALINHADAS[recomendacao].includes(decisao);
}

// ------------------------------------------------------------------ motor (réplica de calculo.ts)

function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/** Faixa aplicável: [minimo, maximo); a última fecha em 100 inclusive. */
function encontrarFaixa(faixas, percentual) {
  const ordenadas = [...faixas].sort((a, b) => a.minimo - b.minimo);
  for (const faixa of ordenadas) {
    if (percentual >= faixa.minimo && percentual < faixa.maximo) return faixa;
  }
  const ultima = ordenadas[ordenadas.length - 1];
  if (ultima && percentual === ultima.maximo) return ultima;
  return null;
}

/**
 * Nota do pilar em fração 0–1: Σ (peso_norm × nota/5) sobre os indicadores
 * RESPONDIDOS. "Não observado" sai do denominador — nunca vira zero.
 * null quando o pilar inteiro não foi observado.
 */
function fracaoDoPilar(pilar, porIndicador) {
  const respondidos = pilar.indicadores.filter(
    (indicador) => porIndicador.get(indicador.id).nota !== null
  );
  if (respondidos.length === 0) return { fracao: null, respondidos, soma: 0 };
  const soma = respondidos.reduce((total, i) => total + i.peso, 0);
  let fracao = 0;
  for (const indicador of respondidos) {
    const resposta = porIndicador.get(indicador.id);
    fracao += (indicador.peso / soma) * (resposta.nota / NOTA_MAXIMA);
  }
  return { fracao, respondidos, soma };
}

/** Só o percentual (usado no ajuste das notas para a faixa alvo). */
function percentualDe(estrutura, respostas) {
  const porIndicador = new Map(respostas.map((r) => [r.indicador_id, r]));
  const comNota = [];
  for (const pilar of estrutura.pilares) {
    const { fracao } = fracaoDoPilar(pilar, porIndicador);
    if (fracao !== null) comNota.push({ pilar, fracao });
  }
  if (comNota.length === 0) return null;
  const somaPesos = comNota.reduce((total, item) => total + item.pilar.peso, 0);
  let final = 0;
  for (const item of comNota) final += (item.pilar.peso / somaPesos) * item.fracao;
  return arredondar(final * 100, 2);
}

/** Resultado completo + memória de cálculo, no mesmo formato do motor. */
function calcularResultado(estrutura, respostas, calculadoEm) {
  const porIndicador = new Map(respostas.map((r) => [r.indicador_id, r]));
  for (const pilar of estrutura.pilares) {
    for (const indicador of pilar.indicadores) {
      if (!porIndicador.has(indicador.id)) {
        throw new Error(
          `indicador "${indicador.nome}" sem resposta: consolidação bloqueada`
        );
      }
    }
  }

  const memoriaPilares = [];
  const fracaoPorPilar = new Map();

  for (const pilar of estrutura.pilares) {
    const { fracao, soma } = fracaoDoPilar(pilar, porIndicador);
    const indicadores = pilar.indicadores.map((indicador) => {
      const resposta = porIndicador.get(indicador.id);
      return {
        indicador_id: indicador.id,
        nome: indicador.nome,
        peso: indicador.peso,
        peso_normalizado:
          resposta.nota !== null && soma > 0
            ? arredondar((indicador.peso / soma) * 100, 4)
            : null,
        nota: resposta.nota,
        nao_observado: resposta.nao_observado,
      };
    });
    if (fracao !== null) fracaoPorPilar.set(pilar.id, fracao);
    memoriaPilares.push({
      pilar_id: pilar.id,
      nome: pilar.nome,
      peso: pilar.peso,
      peso_normalizado: null, // preenchido depois de saber os excluídos
      excluido: fracao === null,
      respondidos: pilar.indicadores.filter(
        (i) => porIndicador.get(i.id).nota !== null
      ).length,
      nao_observados: pilar.indicadores.filter(
        (i) => porIndicador.get(i.id).nota === null
      ).length,
      nota_pilar: fracao === null ? null : arredondar(fracao * 100, 2),
      indicadores,
    });
  }

  const pilaresComNota = estrutura.pilares.filter((p) => fracaoPorPilar.has(p.id));
  if (pilaresComNota.length === 0) {
    throw new Error('avaliação inteira não observada: nada a consolidar');
  }
  const somaPesos = pilaresComNota.reduce((total, p) => total + p.peso, 0);
  let final = 0;
  for (const pilar of pilaresComNota) {
    const normalizado = pilar.peso / somaPesos;
    final += normalizado * fracaoPorPilar.get(pilar.id);
    const memoria = memoriaPilares.find((m) => m.pilar_id === pilar.id);
    memoria.peso_normalizado = arredondar(normalizado * 100, 4);
  }

  const percentual = arredondar(final * 100, 2);
  const faixa = encontrarFaixa(estrutura.faixas, percentual);
  if (!faixa) throw new Error(`nenhuma faixa cobre o percentual ${percentual}`);

  return {
    percentual,
    faixa,
    memoria: {
      versao_memoria: 1,
      modelo: {
        id: estrutura.modelo_versao_id,
        versao: estrutura.versao,
        nome: estrutura.nome,
      },
      escala: { minima: 1, maxima: NOTA_MAXIMA, normalizacao: `nota/${NOTA_MAXIMA}` },
      regras: {
        nao_observado:
          'Indicador não observado sai do denominador (pesos renormalizados entre os respondidos do pilar); pilar 100% não observado é excluído e os pesos dos pilares restantes são renormalizados. Item sem resposta bloqueia o envio — jamais vira zero.',
        arredondamento:
          'Cálculo em precisão total; apenas o percentual final é arredondado a 2 casas decimais; a faixa é aplicada sobre o valor arredondado.',
        faixa:
          'Faixa aplica-se a percentual em [minimo, maximo) — inferior inclusivo, superior exclusivo; a última faixa inclui 100.',
      },
      pilares: memoriaPilares,
      percentual,
      faixa: {
        id: faixa.id,
        minimo: faixa.minimo,
        maximo: faixa.maximo,
        rotulo: faixa.rotulo,
        recomendacao: faixa.recomendacao,
      },
      calculado_em: calculadoEm,
    },
  };
}

// ------------------------------------------------------------------ geração das notas

/**
 * Notas plausíveis que caem na faixa pretendida. Parte de uma distribuição em
 * torno da média equivalente ao alvo (percentual P ⇔ média P×5/100) e depois
 * ajusta, de um em um, o indicador que mais aproxima do alvo (subida
 * determinística: mesma entrada, mesmas notas). O percentual final é sempre
 * calculado pelo MOTOR — nunca escrito à mão.
 */
function gerarNotas(rng, estrutura, alvo, naoObservados) {
  const media = (alvo * NOTA_MAXIMA) / 100;
  const respostas = [];
  for (const pilar of estrutura.pilares) {
    for (const indicador of pilar.indicadores) {
      if (naoObservados.has(indicador.id)) {
        respostas.push({
          indicador_id: indicador.id,
          nota: null,
          nao_observado: true,
        });
        continue;
      }
      const bruto = media + (rng() * 1.7 - 0.85);
      const nota = Math.min(5, Math.max(1, Math.round(bruto)));
      respostas.push({ indicador_id: indicador.id, nota, nao_observado: false });
    }
  }

  let atual = percentualDe(estrutura, respostas);
  for (let volta = 0; volta < 80; volta += 1) {
    let melhor = null;
    for (const resposta of respostas) {
      if (resposta.nao_observado) continue;
      for (const passo of [-1, 1]) {
        const nova = resposta.nota + passo;
        if (nova < 1 || nova > NOTA_MAXIMA) continue;
        const original = resposta.nota;
        resposta.nota = nova;
        const candidato = percentualDe(estrutura, respostas);
        resposta.nota = original;
        const erro = Math.abs(candidato - alvo);
        if (!melhor || erro < melhor.erro - 1e-9) {
          melhor = { resposta, passo, erro, percentual: candidato };
        }
      }
    }
    if (!melhor || melhor.erro >= Math.abs(atual - alvo) - 1e-9) break;
    melhor.resposta.nota += melhor.passo;
    atual = melhor.percentual;
  }
  return respostas;
}

/**
 * Escolhe 1–2 indicadores para "não observado". Nunca esvazia um pilar (o
 * motor excluiria o pilar inteiro): no máximo um em pilar de 3 indicadores.
 */
function sortearNaoObservados(rng, estrutura, quantidade) {
  const escolhidos = new Set();
  const porPilar = new Map(estrutura.pilares.map((p) => [p.id, 0]));
  const candidatos = embaralhar(
    rng,
    estrutura.pilares.flatMap((pilar) =>
      pilar.indicadores.map((indicador) => ({
        id: indicador.id,
        pilarId: pilar.id,
        limite: Math.max(1, pilar.indicadores.length - 2),
      }))
    )
  );
  for (const candidato of candidatos) {
    if (escolhidos.size >= quantidade) break;
    if (porPilar.get(candidato.pilarId) >= candidato.limite) continue;
    escolhidos.add(candidato.id);
    porPilar.set(candidato.pilarId, porPilar.get(candidato.pilarId) + 1);
  }
  return escolhidos;
}

// ------------------------------------------------------------------ datas

/** Instante em UTC a partir de um deslocamento em dias (hora local ≈ hora-3). */
function instante(dias, horaUtc, minuto) {
  const base = dataRelativa(dias);
  base.setUTCHours(horaUtc, minuto, 0, 0);
  return base.toISOString();
}

function somarDias(dataIso, dias) {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return iso(data);
}

// ------------------------------------------------------------------ plano da demonstração

// Curva proposital do ciclo de desempenho (25 consolidados).
const CURVA = [
  ...Array(7).fill('sucessao'),
  ...Array(12).fill('desenvolver'),
  ...Array(4).fill('atencao'),
  ...Array(2).fill('recuperar'),
];

// Alvo de percentual por faixa (o motor confirma; a faixa vem do resultado).
const ALVO_POR_FAIXA = {
  recuperar: [29, 38],
  atencao: [43, 58],
  desenvolver: [63, 78],
  sucessao: [82, 95],
};

/**
 * Roteiro das 15 decisões do ciclo de desempenho, por faixa do resultado.
 * As três primeiras DIVERGEM da recomendação — é o que prova, na tela, que a
 * flag é recomendação e a consequência é decisão humana justificada.
 */
const ROTEIRO_DECISOES = [
  {
    faixa: 'recuperar',
    decisao: 'manter',
    decisor: 'diretoria',
    justificativa:
      'Resultado puxado para baixo por 47 dias de afastamento previdenciário dentro do período avaliado — a janela de observação do gestor foi menor que a dos demais. A recomendação da faixa era plano de recuperação; a decisão é manter na função, com acompanhamento quinzenal e nova avaliação em 90 dias.',
  },
  {
    faixa: 'atencao',
    decisao: 'desligar',
    decisor: 'diretoria',
    justificativa:
      'Apesar do resultado ficar na faixa de atenção, houve reincidência de descumprimento de norma de segurança já formalizada em advertência (duas ocorrências no semestre). Decisão de encaminhar desligamento ao DP — este registro não executa nada: o processo é aberto no módulo de desligamento.',
  },
  {
    faixa: 'desenvolver',
    decisao: 'desligar',
    decisor: 'diretoria',
    justificativa:
      'Desempenho técnico dentro do esperado, mas a posição foi extinta na reestruturação das rotas de entrega da unidade. Desligamento por motivo organizacional, sem relação com a avaliação; encaminhado ao DP com prioridade de recolocação em vaga futura.',
  },
  {
    faixa: 'atencao',
    decisao: 'desenvolver',
    decisor: 'dp',
    justificativa:
      'Plano de desenvolvimento de 90 dias com foco em conhecimento técnico do cargo e uso do sistema; acompanhamento mensal registrado pelo gestor.',
  },
  {
    faixa: 'desenvolver',
    decisao: 'manter',
    decisor: 'dp',
    justificativa:
      'Entrega consistente no semestre; mantida na função com metas revisadas para o próximo ciclo.',
  },
  { faixa: 'desenvolver', decisao: 'manter', decisor: 'dp', justificativa: null },
  {
    faixa: 'desenvolver',
    decisao: 'manter',
    decisor: 'dp',
    justificativa:
      'Sem ressalvas do gestor; permanece na função com revisão de escala combinada para o próximo semestre.',
  },
  { faixa: 'desenvolver', decisao: 'manter', decisor: 'dp', justificativa: null },
  {
    faixa: 'desenvolver',
    decisao: 'desenvolver',
    decisor: 'dp',
    justificativa:
      'Trilha de desenvolvimento aprovada: assume a substituição do supervisor nas férias e passa a conduzir a reunião de abertura da loja.',
  },
  {
    faixa: 'desenvolver',
    decisao: 'desenvolver',
    decisor: 'dp',
    justificativa:
      'Ponto forte em atitude, lacuna em conhecimento técnico do cargo — plano com treinamento de produto (drywall) e acompanhamento do gerente.',
  },
  {
    faixa: 'sucessao',
    decisao: 'manter',
    decisor: 'diretoria',
    justificativa:
      'Mantida na função com proposta de revisão salarial encaminhada ao comitê de remuneração.',
  },
  { faixa: 'sucessao', decisao: 'manter', decisor: 'dp', justificativa: null },
  {
    faixa: 'sucessao',
    decisao: 'manter',
    decisor: 'dp',
    justificativa:
      'Referência técnica da equipe; permanece na função como multiplicador do treinamento de produto.',
  },
  {
    faixa: 'sucessao',
    decisao: 'desenvolver',
    decisor: 'diretoria',
    justificativa:
      'Indicado ao banco de sucessão da unidade: plano de preparação para supervisão em 12 meses, com job rotation em compras.',
  },
  {
    faixa: 'sucessao',
    decisao: 'desenvolver',
    decisor: 'diretoria',
    justificativa:
      'Sucessão mapeada para a gerência da filial; plano com mentoria da diretoria e condução do inventário do próximo trimestre.',
  },
];

const JUSTIFICATIVAS_EXPERIENCIA = [
  'Primeiros 45 dias com boa adaptação à rotina e ao time; renovação do contrato de experiência por mais 45 dias, com foco em autonomia no sistema de pedidos.',
  'Evolução semanal consistente no atendimento e no conhecimento de produto; contrato de experiência renovado, com acompanhamento do gestor a cada 15 dias.',
  'Cumpriu o combinado no primeiro período e assumiu tarefas além do previsto; renovação por mais 45 dias para consolidar a rotina de conferência.',
];

// ------------------------------------------------------------------ leitura do banco

async function carregarEstrutura(cliente) {
  const { rows: modelos } = await cliente.query(
    `SELECT id, versao, nome FROM rh.modelo_avaliacao_versao WHERE status = 'ativa'`
  );
  if (modelos.length === 0) {
    throw new Error(
      'nenhuma versão ATIVA do modelo de avaliação — o seed da migration 0011 precisa estar aplicado'
    );
  }
  const modeloId = Number(modelos[0].id);
  const { rows: pilares } = await cliente.query(
    `SELECT id, nome, peso, ordem FROM rh.pilar_avaliacao
      WHERE modelo_versao_id = $1 ORDER BY ordem`,
    [modeloId]
  );
  const { rows: indicadores } = await cliente.query(
    `SELECT i.id, i.pilar_id, i.nome, i.peso, i.ordem
       FROM rh.indicador_avaliacao i
       JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
      WHERE p.modelo_versao_id = $1
      ORDER BY p.ordem, i.ordem`,
    [modeloId]
  );
  const { rows: faixas } = await cliente.query(
    `SELECT id, minimo::float8 AS minimo, maximo::float8 AS maximo,
            rotulo, recomendacao
       FROM rh.faixa_resultado_versao
      WHERE modelo_versao_id = $1 ORDER BY minimo`,
    [modeloId]
  );
  return {
    modelo_versao_id: modeloId,
    versao: modelos[0].versao,
    nome: modelos[0].nome,
    pilares: pilares.map((pilar) => ({
      id: Number(pilar.id),
      nome: pilar.nome,
      peso: pilar.peso,
      ordem: pilar.ordem,
      indicadores: indicadores
        .filter((i) => i.pilar_id === pilar.id)
        .map((i) => ({
          id: Number(i.id),
          nome: i.nome,
          peso: i.peso,
          ordem: i.ordem,
        })),
    })),
    faixas: faixas.map((faixa) => ({ ...faixa, id: Number(faixa.id) })),
  };
}

/** Ativos com gestor vigente (mesma regra do JOIN_GESTOR_VIGENTE do app). */
async function carregarCandidatos(cliente) {
  const { rows } = await cliente.query(
    `WITH gestor_vigente AS (
       SELECT DISTINCT ON (rg.liderado_colaborador_id)
              rg.liderado_colaborador_id AS colaborador_id,
              rg.gestor_colaborador_id
         FROM rh.relacao_gestor rg
        WHERE rg.fim_vigencia IS NULL
          AND rg.inicio_vigencia <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ORDER BY rg.liderado_colaborador_id, rg.inicio_vigencia DESC, rg.id DESC
     )
     SELECT c.id, c.matricula, c.nome_completo, c.tipo_vinculo,
            c.data_admissao::text AS data_admissao,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)::int AS dias_de_casa,
            cv.nome AS cargo,
            ev.unidade AS unidade,
            gv.gestor_colaborador_id AS gestor_id,
            g.nome_completo AS gestor_nome,
            ug.email AS gestor_email
       FROM rh.colaborador c
       JOIN gestor_vigente gv
         ON gv.colaborador_id = c.id AND gv.gestor_colaborador_id <> c.id
       JOIN rh.colaborador g ON g.id = gv.gestor_colaborador_id
       LEFT JOIN sistema.usuario ug ON ug.id = g.usuario_id
       LEFT JOIN rh.posicao_colaborador pc
         ON pc.colaborador_id = c.id AND pc.fim_vigencia IS NULL
       LEFT JOIN rh.cargo_versao cv ON cv.id = pc.cargo_versao_id
       LEFT JOIN rh.lotacao l ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE c.status = 'ativo'
      ORDER BY c.matricula`
  );
  return rows.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    gestor_id: Number(linha.gestor_id),
  }));
}

/** Prazos 45/90 já calculados na admissão, quando o módulo de admissão rodou. */
async function carregarPrazosExperiencia(cliente, ids) {
  if (ids.length === 0) return new Map();
  const { rows } = await cliente.query(
    `SELECT colaborador_id,
            prazo_experiencia_1::text AS prazo_1,
            prazo_experiencia_2::text AS prazo_2
       FROM rh.processo_admissao
      WHERE colaborador_id = ANY($1::bigint[])
        AND contrato_experiencia
        AND estado <> 'cancelado'`,
    [ids]
  );
  return new Map(
    rows.map((linha) => [
      Number(linha.colaborador_id),
      { prazo1: linha.prazo_1, prazo2: linha.prazo_2 },
    ])
  );
}

async function carregarDecisores(cliente) {
  const { rows } = await cliente.query(
    `SELECT u.id, u.email, u.papel
       FROM sistema.usuario u
      WHERE u.papel IN ('dp', 'diretoria') AND u.ativo
      ORDER BY u.id`
  );
  const dp = rows.find((u) => u.email === 'dp@fastdemo.local')
    ?? rows.find((u) => u.papel === 'dp');
  const diretoria = rows.find((u) => u.email === 'diretora.pessoas@fastdemo.local')
    ?? rows.find((u) => u.papel === 'diretoria');
  if (!dp || !diretoria) {
    throw new Error(
      'sem usuário dp/diretoria para assinar as decisões — rode 01-base antes'
    );
  }
  return { dp: Number(dp.id), diretoria: Number(diretoria.id) };
}

// ------------------------------------------------------------------ limpeza

const TABELAS_DO_MODULO = [
  'rh.resposta_item',
  'rh.avaliacao',
  'rh.decisao_avaliacao',
  'rh.resultado_avaliacao',
  'rh.ciclo_avaliacao',
  'rh.evento_colaborador',
];

async function limpar(cliente) {
  return comTriggersDesligados(cliente, TABELAS_DO_MODULO, async () => {
    const removidos = {};
    // Eventos: só os que ESTE módulo escreve (a linha do tempo é de todos).
    const eventos = await cliente.query(
      `DELETE FROM rh.evento_colaborador WHERE origem_tabela = $1`,
      [TABELA_CICLO]
    );
    if (eventos.rowCount > 0) removidos['rh.evento_colaborador'] = eventos.rowCount;
    for (const tabela of [
      'rh.resposta_item',
      'rh.avaliacao',
      'rh.decisao_avaliacao',
      'rh.resultado_avaliacao',
      'rh.ciclo_avaliacao',
    ]) {
      const resultado = await cliente.query(`DELETE FROM ${tabela}`);
      if (resultado.rowCount > 0) removidos[tabela] = resultado.rowCount;
    }
    return removidos;
  });
}

// ------------------------------------------------------------------ avisos do sino
//
// O app emite `avaliacao.ciclo_aberto` para o AVALIADOR na abertura do ciclo
// (src/dominios/avaliacao/servico.ts → notificarAvaliador). Sem isto o sino da
// diretora e do gestor abre vazio na demonstração, embora eles tenham ciclos
// para responder. Rótulos e texto IDÊNTICOS aos do serviço — a demo mostra o
// aviso que o sistema realmente emitiria.
//
// Só agregado: tipo do ciclo, nome do avaliado e prazo. Nunca nota nem
// resposta (o corpo do aviso é lido por quem só tem o sino aberto).

const TIPO_AVISO = 'avaliacao.ciclo_aberto';

function formatarDataBr(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function semearNotificacoes(cliente) {
  // Idempotência do módulo rodando sozinho (o 00-limpar zera a tabela inteira).
  await cliente.query('DELETE FROM sistema.notificacao WHERE tipo = $1', [TIPO_AVISO]);

  const { rows } = await cliente.query(
    `SELECT k.id, k.tipo, k.status, k.prazo::text AS prazo, k.criado_em,
            c.nome_completo AS avaliado, u.id AS avaliador_usuario_id
       FROM rh.ciclo_avaliacao k
       JOIN rh.colaborador c ON c.id = k.colaborador_id
       JOIN rh.colaborador ac ON ac.id = k.avaliador_colaborador_id
       JOIN sistema.usuario u ON u.id = ac.usuario_id
      WHERE k.status <> 'cancelado'
      ORDER BY k.id`
  );

  const PENDENTES = new Set(['aberto', 'em_avaliacao']);
  const linhas = rows.map((linha) => [
    Number(linha.avaliador_usuario_id),
    TIPO_AVISO,
    'Nova avaliação para responder',
    `Ciclo "${ROTULOS_TIPO_CICLO[linha.tipo]}" de ${linha.avaliado} aberto — prazo ${formatarDataBr(linha.prazo)}.`,
    `/avaliacoes/${Number(linha.id)}`,
    // Pendente fica NÃO lido: é o que faz o contador do sino aparecer.
    !PENDENTES.has(linha.status),
    linha.criado_em,
  ]);

  await inserirLote(
    cliente,
    'sistema.notificacao',
    ['usuario_id', 'tipo', 'titulo', 'corpo', 'link', 'lida', 'criada_em'],
    linhas
  );
  return {
    total: linhas.length,
    nao_lidas: linhas.filter((linha) => linha[5] === false).length,
    destinatarios: new Set(linhas.map((linha) => linha[0])).size,
  };
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);

  const removidos = await limpar(cliente);
  const totalRemovido = Object.values(removidos).reduce((a, b) => a + b, 0);
  log(
    totalRemovido === 0
      ? '08-avaliacao: nada de avaliação para limpar.'
      : `08-avaliacao: ${totalRemovido} linha(s) de avaliação removida(s).`
  );

  const estrutura = await carregarEstrutura(cliente);
  const totalIndicadores = estrutura.pilares.reduce(
    (total, pilar) => total + pilar.indicadores.length,
    0
  );
  const candidatos = await carregarCandidatos(cliente);
  const decisores = await carregarDecisores(cliente);
  if (candidatos.length < 30) {
    throw new Error(
      `apenas ${candidatos.length} colaborador(es) ativo(s) com gestor vigente — rode 01-base antes`
    );
  }

  // ---------------------------------------------------------------- quem entra em quê
  // Contrato de experiência: CLT admitido entre 40 e 90 dias atrás — o marco de
  // 45 já venceu (decidido) e o de 90 está por vir (fila do gestor).
  const emExperiencia = candidatos
    .filter(
      (c) =>
        c.tipo_vinculo === 'clt' && c.dias_de_casa >= 40 && c.dias_de_casa <= 90
    )
    .slice(0, 3);
  const prazosAdmissao = await carregarPrazosExperiencia(
    cliente,
    emExperiencia.map((c) => c.id)
  );

  // Ciclo de desempenho: ninguém em contrato de experiência entra no lote
  // semestral (quem está nos primeiros 90 dias é avaliado pelos marcos 45/90).
  const elegiveisDesempenho = candidatos.filter((c) => c.dias_de_casa > 90);

  // Retardatários: dois do gestor da demo (para ele ter o que responder ao
  // vivo) e um de outra equipe, para o atraso não parecer de uma pessoa só.
  const doGestorDemo = elegiveisDesempenho.filter(
    (c) => c.gestor_email === 'gestor@fastdemo.local'
  );
  const atrasados = [];
  if (doGestorDemo.length >= 2) {
    atrasados.push(
      { ...doGestorDemo[0], parcial: true },
      { ...doGestorDemo[1], parcial: false }
    );
  }
  const outraEquipe = elegiveisDesempenho.find(
    (c) =>
      c.gestor_email !== 'gestor@fastdemo.local' &&
      !atrasados.some((a) => a.id === c.id)
  );
  if (outraEquipe) atrasados.push({ ...outraEquipe, parcial: true });

  const restantes = elegiveisDesempenho.filter(
    (c) => !atrasados.some((a) => a.id === c.id)
  );
  // Sorteio com cobertura das 5 unidades: uma volta pegando um de cada
  // unidade, depois completa aleatoriamente até 25.
  const sorteados = [];
  const porUnidade = new Map();
  for (const pessoa of embaralhar(rng, restantes)) {
    const unidade = pessoa.unidade ?? 'sem unidade';
    if (!porUnidade.has(unidade)) porUnidade.set(unidade, []);
    porUnidade.get(unidade).push(pessoa);
  }
  const filas = [...porUnidade.keys()].sort().map((u) => porUnidade.get(u));
  let volta = 0;
  while (sorteados.length < CURVA.length) {
    let inseriu = false;
    for (const fila of filas) {
      if (sorteados.length >= CURVA.length) break;
      if (fila.length > volta) {
        sorteados.push(fila[volta]);
        inseriu = true;
      }
    }
    if (!inseriu) break;
    volta += 1;
  }
  if (sorteados.length < CURVA.length) {
    throw new Error(
      `só ${sorteados.length} avaliáveis para ${CURVA.length} vagas do ciclo de desempenho`
    );
  }

  // Faixa por pessoa: potencial = senioridade do cargo + tempo de casa + sorte.
  // Não é ranking puro (seria caricato), mas gerente/supervisor tende ao topo.
  const PESO_CARGO = [
    [/gerente/i, 6],
    [/supervis/i, 5],
    [/analista|comprador/i, 4],
    [/assistente|conferente|motorista/i, 3],
    [/vendedor|estoquista|auxiliar/i, 2],
  ];
  const nivelDoCargo = (cargo) => {
    for (const [padrao, nivel] of PESO_CARGO) {
      if (padrao.test(cargo ?? '')) return nivel;
    }
    return 1;
  };
  const ordenados = sorteados
    .map((pessoa) => ({
      pessoa,
      potencial:
        nivelDoCargo(pessoa.cargo) * 1.4 +
        Math.min(pessoa.dias_de_casa / 365, 10) * 0.35 +
        rng() * 5,
    }))
    .sort((a, b) => b.potencial - a.potencial || a.pessoa.id - b.pessoa.id)
    .map((item) => item.pessoa);

  const planoDesempenho = ordenados.map((pessoa, indice) => ({
    pessoa,
    faixa: CURVA[indice],
  }));

  // Decisões: cada linha do roteiro casa com o primeiro consolidado ainda sem
  // decisão da faixa que ela exige. O que sobrar fica "aguardando decisão".
  const decididos = new Map();
  for (const roteiro of ROTEIRO_DECISOES) {
    const alvo = planoDesempenho.find(
      (item) => item.faixa === roteiro.faixa && !decididos.has(item.pessoa.id)
    );
    if (!alvo) {
      throw new Error(
        `roteiro de decisão pede faixa "${roteiro.faixa}" e não há consolidado livre nela`
      );
    }
    decididos.set(alvo.pessoa.id, roteiro);
  }

  // ---------------------------------------------------------------- ciclos
  const PRAZO_LOTE = -12; // prazo do ciclo semestral: vencido há 12 dias
  const ABERTURA_LOTE = -60;

  const ciclos = [];

  planoDesempenho.forEach((item, indice) => {
    ciclos.push({
      chave: `${item.pessoa.id}|desempenho`,
      pessoa: item.pessoa,
      tipo: 'desempenho',
      origem: 'lote',
      prazo: iso(dataRelativa(PRAZO_LOTE)),
      criado_em: instante(ABERTURA_LOTE, 12, 20),
      status: decididos.has(item.pessoa.id) ? 'decidido' : 'consolidado',
      faixaAlvo: item.faixa,
      envio: instante(-30 + (indice % 17), 11 + (indice % 9), (indice * 7) % 60),
      naoObservados: indice % 4 === 1 ? inteiro(rng, 1, 2) : 0,
      decisao: decididos.get(item.pessoa.id) ?? null,
    });
  });

  atrasados.forEach((pessoa, indice) => {
    ciclos.push({
      chave: `${pessoa.id}|desempenho`,
      pessoa,
      tipo: 'desempenho',
      origem: 'lote',
      prazo: iso(dataRelativa(PRAZO_LOTE)),
      criado_em: instante(ABERTURA_LOTE, 12, 20),
      status: pessoa.parcial ? 'em_avaliacao' : 'aberto',
      faixaAlvo: null,
      parcial: pessoa.parcial,
      rascunhoEm: instante(-9 - indice, 13, 40),
      decisao: null,
    });
  });

  emExperiencia.forEach((pessoa, indice) => {
    const prazos = prazosAdmissao.get(pessoa.id);
    const prazo45 = prazos?.prazo1 ?? somarDias(pessoa.data_admissao, 45);
    const prazo90 = prazos?.prazo2 ?? somarDias(pessoa.data_admissao, 90);
    const diasAteVencer45 = Math.round(
      (new Date(`${prazo45}T00:00:00Z`) - dataRelativa(0)) / 86400000
    );
    // Envio e decisão ANTES do vencimento do 1º período (CLT 443/445/451).
    const envio45 = instante(diasAteVencer45 - 8, 12, 10 + indice * 5);
    const decisao45 = instante(diasAteVencer45 - 5, 14, 25 + indice * 5);

    ciclos.push({
      chave: `${pessoa.id}|experiencia_45`,
      pessoa,
      tipo: 'experiencia_45',
      origem: 'admissao',
      prazo: prazo45,
      criado_em: instante(-pessoa.dias_de_casa + 1, 11, 30),
      status: 'decidido',
      faixaAlvo: indice === 0 ? 'desenvolver' : indice === 1 ? 'atencao' : 'desenvolver',
      envio: envio45,
      naoObservados: indice === 1 ? 2 : 1, // 45 dias: o gestor ainda não viu tudo
      decisao: {
        faixa: null,
        decisao: 'renovar',
        decisor: 'dp',
        justificativa: JUSTIFICATIVAS_EXPERIENCIA[indice % 3],
        em: decisao45,
      },
    });
    ciclos.push({
      chave: `${pessoa.id}|experiencia_90`,
      pessoa,
      tipo: 'experiencia_90',
      origem: 'admissao',
      prazo: prazo90,
      criado_em: decisao45, // a geração do marco 90 só libera após decidir o 45
      status: 'aberto',
      faixaAlvo: null,
      parcial: false,
      decisao: null,
    });
  });

  const linhasCiclo = ciclos.map((ciclo) => [
    ciclo.pessoa.id,
    ciclo.tipo,
    estrutura.modelo_versao_id,
    ciclo.pessoa.gestor_id,
    ciclo.prazo,
    ciclo.status,
    ciclo.origem,
    ciclo.criado_em,
    ciclo.criado_em,
  ]);
  const ciclosGravados = await inserirLote(
    cliente,
    TABELA_CICLO,
    [
      'colaborador_id',
      'tipo',
      'modelo_versao_id',
      'avaliador_colaborador_id',
      'prazo',
      'status',
      'origem',
      'criado_em',
      'atualizado_em',
    ],
    linhasCiclo,
    'id, colaborador_id, tipo'
  );
  const idPorChave = new Map(
    ciclosGravados.map((linha) => [
      `${Number(linha.colaborador_id)}|${linha.tipo}`,
      Number(linha.id),
    ])
  );
  for (const ciclo of ciclos) {
    ciclo.id = idPorChave.get(ciclo.chave);
    if (!ciclo.id) throw new Error(`ciclo não retornado: ${ciclo.chave}`);
  }

  // ---------------------------------------------------------------- avaliações (rascunho)
  // Todo ciclo nasce com a linha de resposta em rascunho — igual ao app.
  const avaliacoesGravadas = await inserirLote(
    cliente,
    'rh.avaliacao',
    ['ciclo_id', 'estado', 'criado_em', 'atualizado_em'],
    ciclos.map((ciclo) => [ciclo.id, 'rascunho', ciclo.criado_em, ciclo.criado_em]),
    'id, ciclo_id'
  );
  const avaliacaoPorCiclo = new Map(
    avaliacoesGravadas.map((linha) => [
      Number(linha.ciclo_id),
      Number(linha.id),
    ])
  );

  // ---------------------------------------------------------------- respostas
  const linhasResposta = [];
  const consolidaveis = [];
  for (const ciclo of ciclos) {
    const avaliacaoId = avaliacaoPorCiclo.get(ciclo.id);
    if (ciclo.faixaAlvo) {
      const [minimo, maximo] = ALVO_POR_FAIXA[ciclo.faixaAlvo];
      const alvo = minimo + rng() * (maximo - minimo);
      const naoObservados = sortearNaoObservados(rng, estrutura, ciclo.naoObservados);
      const respostas = gerarNotas(rng, estrutura, alvo, naoObservados);
      // A faixa vem SEMPRE do motor; aqui só se confere que as notas geradas
      // caíram onde a curva planejada precisa (senão a decisão roteirizada
      // deixaria de ser divergente/alinhada como a demo pretende).
      const conferencia = encontrarFaixa(
        estrutura.faixas,
        percentualDe(estrutura, respostas)
      );
      if (!conferencia || conferencia.recomendacao !== ciclo.faixaAlvo) {
        throw new Error(
          `notas geradas para ${ciclo.pessoa.matricula} caíram em "${conferencia?.recomendacao}" e a curva pedia "${ciclo.faixaAlvo}" (alvo ${alvo.toFixed(2)}%)`
        );
      }
      ciclo.respostas = respostas;
      consolidaveis.push(ciclo);
      for (const resposta of respostas) {
        linhasResposta.push([
          avaliacaoId,
          resposta.indicador_id,
          resposta.nota,
          resposta.nao_observado,
          ciclo.envio,
          ciclo.envio,
        ]);
      }
    } else if (ciclo.parcial) {
      // Rascunho pela metade: 9 dos 15 indicadores respondidos. Prova na tela
      // que envio parcial não existe — o resto continua em branco, nunca zero.
      const todos = estrutura.pilares.flatMap((p) => p.indicadores);
      const respondidos = todos.slice(0, Math.ceil(todos.length * 0.6));
      for (const indicador of respondidos) {
        linhasResposta.push([
          avaliacaoId,
          indicador.id,
          inteiro(rng, 3, 5),
          false,
          ciclo.rascunhoEm,
          ciclo.rascunhoEm,
        ]);
      }
    }
  }
  await inserirLote(
    cliente,
    'rh.resposta_item',
    [
      'avaliacao_id',
      'indicador_avaliacao_id',
      'nota',
      'nao_observado',
      'criado_em',
      'atualizado_em',
    ],
    linhasResposta
  );

  // ---------------------------------------------------------------- envio (trava do banco valida a completude)
  await cliente.query(
    `UPDATE rh.avaliacao a
        SET estado = 'enviada', enviado_em = v.enviado_em
       FROM (SELECT unnest($1::bigint[]) AS id,
                    unnest($2::timestamptz[]) AS enviado_em) v
      WHERE a.id = v.id`,
    [
      consolidaveis.map((ciclo) => avaliacaoPorCiclo.get(ciclo.id)),
      consolidaveis.map((ciclo) => ciclo.envio),
    ]
  );

  // ---------------------------------------------------------------- consolidação (motor)
  const linhasResultado = [];
  for (const ciclo of consolidaveis) {
    const calculado = calcularResultado(estrutura, ciclo.respostas, ciclo.envio);
    ciclo.resultado = calculado;
    linhasResultado.push([
      ciclo.id,
      calculado.percentual,
      calculado.faixa.id,
      calculado.faixa.recomendacao,
      JSON.stringify(calculado.memoria),
      ciclo.envio,
    ]);
  }
  await inserirLote(
    cliente,
    'rh.resultado_avaliacao',
    ['ciclo_id', 'percentual', 'faixa_resultado_id', 'recomendacao', 'memoria_calculo', 'em'],
    linhasResultado
  );

  // ---------------------------------------------------------------- decisão humana + linha do tempo
  const linhasDecisao = [];
  const linhasEvento = [];
  for (const [ordem, ciclo] of consolidaveis.entries()) {
    if (!ciclo.decisao) continue;
    const recomendacao = ciclo.resultado.faixa.recomendacao;
    const divergente = decisaoDiverge(recomendacao, ciclo.decisao.decisao);
    const justificativa = ciclo.decisao.justificativa ?? null;
    if (divergente && !justificativa) {
      throw new Error(
        `decisão divergente sem justificativa no ciclo ${ciclo.id} (${recomendacao} → ${ciclo.decisao.decisao})`
      );
    }
    const decisorId =
      ciclo.decisao.decisor === 'diretoria' ? decisores.diretoria : decisores.dp;
    // Decisão sempre depois do envio e nunca no futuro.
    const em =
      ciclo.decisao.em ??
      instante(
        Math.min(
          -1,
          Math.round((new Date(ciclo.envio) - dataRelativa(0)) / 86400000) +
            inteiro(rng, 2, 8)
        ),
        15,
        (ordem * 11) % 60
      );
    linhasDecisao.push([
      ciclo.id,
      ciclo.decisao.decisao,
      divergente,
      justificativa,
      decisorId,
      em,
    ]);
    linhasEvento.push([
      ciclo.pessoa.id,
      'avaliacao_concluida',
      em,
      TABELA_CICLO,
      ciclo.id,
      `${ROTULOS_TIPO_CICLO[ciclo.tipo]} concluída — faixa "${ciclo.resultado.faixa.rotulo}" · decisão: ${ROTULOS_DECISAO[ciclo.decisao.decisao]}${divergente ? ' (divergente da recomendação)' : ''}`,
      JSON.stringify({
        ciclo_id: ciclo.id,
        tipo: ciclo.tipo,
        faixa: ciclo.resultado.faixa.rotulo,
        recomendacao,
        decisao: ciclo.decisao.decisao,
        divergente,
      }),
      decisorId,
      em,
    ]);
  }
  await inserirLote(
    cliente,
    'rh.decisao_avaliacao',
    ['ciclo_id', 'decisao', 'divergente', 'justificativa', 'decisor_usuario_id', 'em'],
    linhasDecisao
  );
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    [
      'colaborador_id',
      'tipo',
      'ocorrido_em',
      'origem_tabela',
      'origem_id',
      'resumo',
      'payload',
      'registrado_por',
      'registrado_em',
    ],
    linhasEvento
  );

  // ---------------------------------------------------------------- coerência das datas
  // O gatilho tocar_atualizado_em carimba now() no envio; aqui o atualizado_em
  // volta para o instante do fato (a demo é toda datada no passado).
  await comTriggersDesligados(
    cliente,
    ['rh.avaliacao', 'rh.resposta_item'],
    async () => {
      await cliente.query(
        `UPDATE rh.avaliacao SET atualizado_em = COALESCE(enviado_em, criado_em)`
      );
      await cliente.query(`UPDATE rh.resposta_item SET atualizado_em = criado_em`);
    }
  );

  // ---------------------------------------------------------------- avisos do sino
  const avisos = await semearNotificacoes(cliente);

  // ---------------------------------------------------------------- resumo
  const porFaixa = {};
  for (const ciclo of consolidaveis) {
    const chave = ciclo.resultado.faixa.recomendacao;
    porFaixa[chave] = (porFaixa[chave] ?? 0) + 1;
  }
  const divergentes = linhasDecisao.filter((linha) => linha[2]).length;
  const naoObservadas = linhasResposta.filter((linha) => linha[3]).length;

  log(
    `08-avaliacao: ${ciclos.length} ciclos (${planoDesempenho.length + atrasados.length} desempenho, ${emExperiencia.length * 2} experiência) · modelo v${estrutura.versao} com ${totalIndicadores} indicadores`
  );
  log(
    `  - consolidados: ${consolidaveis.length} · faixas: ${Object.entries(porFaixa)
      .map(([faixa, quantidade]) => `${faixa} ${quantidade}`)
      .join(', ')}`
  );
  log(
    `  - decisões: ${linhasDecisao.length} (${divergentes} divergentes) · aguardando decisão: ${consolidaveis.length - linhasDecisao.length}`
  );
  log(
    `  - respostas: ${linhasResposta.length} (${naoObservadas} não observadas) · eventos: ${linhasEvento.length}`
  );
  const abertos = ciclos.filter((c) => c.status === 'aberto').length;
  const emAvaliacao = ciclos.filter((c) => c.status === 'em_avaliacao').length;
  log(`  - pendentes do gestor: ${abertos} aberto(s), ${emAvaliacao} em avaliação`);
  log(
    `  - avisos do sino: ${avisos.total} (${avisos.nao_lidas} não lidos) para ${avisos.destinatarios} avaliador(es)`
  );
  log(`  - total no banco: ${await contar(cliente, TABELA_CICLO)} ciclo(s)`);

  return {
    avaliacao: {
      ciclos: ciclos.length,
      consolidados: consolidaveis.length,
      decisoes: linhasDecisao.length,
      divergentes,
    },
  };
}

module.exports = { semear };

if (require.main === module) {
  executarSozinho('08-avaliacao', semear);
}
