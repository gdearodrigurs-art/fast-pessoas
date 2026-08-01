// db/semear/10-folha-sst.js — FOLHA DE PAGAMENTO + SST/SAÚDE OCUPACIONAL.
//
// Empresa fictícia: Fast — distribuidora de materiais de construção/drywall,
// 5 unidades (Matriz Centro, Filial Norte, Sul, Leste, Oeste). Este módulo
// depende do 01-base já semeado e descobre as pessoas CONSULTANDO O BANCO
// (matrícula, cargo, unidade, salário vigente) — não usa ctx do orquestrador.
//
// O que cria:
//
//   FOLHA (rh_folha)
//     • as TRÊS últimas competências (ver COMPETENCIAS_FECHADAS), FECHADAS e
//       completas: folha_colaborador +
//       item_calculo com memória de cálculo ARITMETICAMENTE CORRETA. O motor
//       de src/dominios/folha/calculo.ts está REIMPLEMENTADO aqui, linha a
//       linha (mesma aritmética de centavos, mesmo half-up, mesma memória):
//       a demo ABRE a memória na tela e cada número tem que fechar. As
//       tabelas legais vigentes (INSS/IRRF/parâmetros) são LIDAS do banco.
//       Segregação de funções respeitada: calculada_por ≠ aprovada_por.
//     • competência do MÊS CORRENTE, ABERTA, com variáveis já lançadas
//       (HE, faltas, descontos de benefício, verbas manuais) e SEM cálculo —
//       de propósito: na apresentação o usuário clica em "Calcular" e vê o
//       motor rodar ao vivo, com a memória aparecendo item a item.
//
//   SST (rh.aso, rh.epi_item, rh.epi_entrega, rh.cat)
//     • 55 ASOs (admissionais dos novatos, periódicos e demissionais), com
//       vencidos e a vencer para o painel acender, e restrições CIFRADAS
//       (cifrarSaude — mesma cifra de src/lib/cifra.ts) em 5 deles;
//     • catálogo de 8 EPIs com CA (um com CA vencido, um a vencer) e ~30
//       entregas — parte com ciência registrada sobre o termo no GED,
//       3 já devolvidas;
//     • 2 CATs (uma típica, uma de trajeto), a típica com CORREÇÃO
//       ENCADEADA (registro novo apontando para o anterior — append-only).
//
//   Apoio: documentos no GED (PDF do ASO, sensível; termo de EPI) com
//   rh.ciencia, e os fatos projetados em rh.evento_colaborador exatamente
//   como o serviço de SST projeta (aso_registrado, epi_entregue,
//   cat_registrada) — a linha do tempo da ficha fica povoada.
//
// Idempotente: apaga tudo que ELE cria (desligando os triggers append-only /
// de competência fechada DENTRO da transação e reabilitando na mesma) e
// insere de novo. Datas SEMPRE relativas a hoje.
//
// Uso isolado: node --env-file=.env db/semear/10-folha-sst.js
 

const crypto = require('crypto');

const {
  aleatorio,
  cifrarSaude,
  comTriggersDesligados,
  embaralhar,
  escolher,
  executarSozinho,
  hoje,
  inserirLote,
  inteiro,
  iso,
  log,
} = require('./comum');

const SEMENTE_FOLHA = 20260810;
const SEMENTE_SST = 20260811;

// Prefixos dos títulos dos documentos criados AQUI — é por eles que a
// limpeza identifica o que é deste módulo dentro do GED compartilhado.
const PREFIXO_DOC_ASO = 'ASO — ';
const PREFIXO_DOC_TERMO = 'Termo de entrega de EPI — ';

// Tabelas que este módulo esvazia. Ordem filho → pai (FKs das 0006/0013/0014).
const TABELAS_LIMPEZA = [
  'rh_folha.item_calculo',
  'rh_folha.folha_colaborador',
  'rh_folha.variavel_lancada',
  'rh_folha.competencia_folha',
  'rh.cat',
  'rh.epi_entrega',
  'rh.epi_item',
  // NR-1 (0029) referencia rh.aso: cai ANTES do ASO
  'rh.avaliacao_psicossocial',
  'rh.aso',
  'rh.ciencia',
  'rh.documento',
  'rh.evento_colaborador',
];

// ================================================================== datas

/** dd/mm/aaaa a partir de AAAA-MM-DD (igual a sst/esquemas.formatarData). */
function dataBr(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Igual a sst/esquemas.formatarDataHora — o resumo do evento tem que bater. */
function dataHoraBr(instanteIso) {
  return new Date(instanteIso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Data (UTC, meia-noite) deslocada em dias a partir de uma base. */
function maisDias(base, dias) {
  const data = new Date(base.getTime());
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

/** Data deslocada em meses, sem "vazar" o mês (31/03 → 28/02). */
function maisMeses(base, meses) {
  const dia = base.getUTCDate();
  const alvo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, 1));
  const ultimo = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return alvo;
}

/** Competência (ano/mês, primeiro e último dia) deslocada de N meses de hoje. */
function competenciaDeslocada(mesesAtras) {
  const base = hoje();
  const primeiro = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - mesesAtras, 1)
  );
  const ultimo = new Date(
    Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0)
  );
  return {
    ano: primeiro.getUTCFullYear(),
    mes: primeiro.getUTCMonth() + 1,
    primeiro,
    ultimo,
    rotulo: `${String(primeiro.getUTCMonth() + 1).padStart(2, '0')}/${primeiro.getUTCFullYear()}`,
  };
}

/** Instante UTC correspondente a um horário de Brasília (UTC−3) num dia. */
function instanteBrasilia(data, hora, minuto = 0) {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), hora + 3, minuto)
  ).toISOString();
}

// ================================================================== motor da folha
// Porte fiel de src/dominios/folha/calculo.ts (F1). Qualquer mudança lá tem
// que ser espelhada aqui — a memória semeada é lida na tela como se tivesse
// saído do motor. Dinheiro em CENTAVOS INTEIROS; intermediários sem
// arredondar; half-up uma única vez, no valor final de cada item.

const CODIGO_SALARIO_BASE = '1001';
const CODIGO_FALTAS = '1201';
const CODIGO_DSR_FALTAS = '1202';
const CODIGO_INSS = '2001';
const CODIGO_IRRF = '2002';
const CODIGO_DESCONTO_BENEFICIO = '2101';
const CODIGO_FGTS = '3001';
const CODIGOS_AUTOMATICOS = [
  CODIGO_SALARIO_BASE,
  CODIGO_DSR_FALTAS,
  CODIGO_INSS,
  CODIGO_IRRF,
  CODIGO_FGTS,
];

function arredondarCentavos(valor) {
  return Math.floor(valor + 0.5 + 1e-6);
}

function aplicarPercentual(centavos, aliquota) {
  return (centavos * Math.round(aliquota * 100)) / 10_000;
}

function reais(centavos) {
  return centavos / 100;
}

function reaisIntermediario(centavos) {
  return Math.round(centavos * 100) / 10_000;
}

/**
 * Divisor HORÁRIO de UMA pessoa (0038) — a mesma proporção do motor de
 * produção (src/dominios/folha/calculo.ts): o divisor de referência vale para a
 * carga de referência, então quem tem carga menor tem divisor menor. 220 h é o
 * divisor de 44 h semanais, logo 36 h semanais (plantão 12x36) valem 180 — e
 * não 220. Com carga igual à de referência a divisão é exata e o resultado é
 * bit a bit o de antes da parametrização.
 *
 * Sem jornada vigente (`null`) cai no divisor de referência puro, igual ao
 * motor. Vive fora de calcularFolha porque sortearVariaveis também precisa
 * dele: o valor da HE que o semeador estima para o DSR sobre hora extra tem de
 * sair do MESMO divisor que o motor vai usar no item.
 */
function divisorHorasDe(parametros, cargaSemanalMinutos) {
  const referencia = parametros.divisor_mensal_horas;
  const cargaReferencia = parametros.carga_semanal_referencia_minutos;
  if (!(referencia > 0) || !(cargaReferencia > 0)) {
    throw new Error(
      'Divisor de horas inválido na versão vigente dos parâmetros da folha — confira a 0038.'
    );
  }
  const carga = cargaSemanalMinutos ?? null;
  const divisor = carga === null ? referencia : (referencia * carga) / cargaReferencia;
  if (!(divisor > 0)) {
    throw new Error(
      'Carga semanal da jornada inválida — o divisor da hora sairia zero ou negativo'
    );
  }
  return divisor;
}

function calcularFolha(entrada) {
  const porCodigo = new Map(entrada.rubricas.map((r) => [r.codigo, r]));
  const rubricaObrigatoria = (codigo) => {
    const rubrica = porCodigo.get(codigo);
    if (!rubrica) throw new Error(`Rubrica ${codigo} sem versão vigente`);
    return rubrica;
  };

  const salario = entrada.salario_base_centavos;
  if (!Number.isInteger(salario) || salario < 0) {
    throw new Error('Salário base inválido (centavos inteiros ≥ 0)');
  }

  // DIVISORES (0038) — nenhum dos dois é constante deste arquivo, exatamente
  // como no motor. O HORÁRIO é proporcional à carga da jornada de quem está
  // sendo calculado; o de DIAS vem cru dos parâmetros (o salário mensal
  // remunera o mês inteiro, repouso incluído, seja qual for a escala).
  const divisorDias = entrada.parametros.divisor_mensal_dias;
  if (!(divisorDias > 0)) {
    throw new Error(
      'Divisor de dias inválido na versão vigente dos parâmetros da folha — confira a 0038.'
    );
  }
  const cargaSemanal = entrada.carga_semanal_minutos ?? null;
  const divisorHoras = divisorHorasDe(entrada.parametros, cargaSemanal);
  /** O que a memória de cálculo conta sobre a origem do divisor horário. */
  const origemDivisorHoras =
    cargaSemanal === null
      ? {
          divisor_horas: divisorHoras,
          origem_divisor:
            'sem jornada vigente — divisor de referência dos parâmetros da folha',
          parametro_folha_versao_id: entrada.parametros.id,
        }
      : {
          divisor_horas: divisorHoras,
          origem_divisor:
            `${entrada.parametros.divisor_mensal_horas} h ÷ ` +
            `${entrada.parametros.carga_semanal_referencia_minutos} min de referência ` +
            `× ${cargaSemanal} min da jornada do colaborador`,
          carga_semanal_minutos: cargaSemanal,
          parametro_folha_versao_id: entrada.parametros.id,
        };
  const origemDivisorDias = {
    divisor_dias: divisorDias,
    origem_divisor: 'dias do mês nos parâmetros da folha (não depende da jornada)',
    parametro_folha_versao_id: entrada.parametros.id,
  };

  const itens = [];
  const incluir = (rubrica, valorSemArredondar, referencia, base, memoria) => {
    const valor = arredondarCentavos(valorSemArredondar);
    if (valor === 0) return null; // item com valor zero não é gravado
    const item = {
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      rubrica_versao_id: rubrica.rubrica_versao_id,
      referencia,
      base_centavos: base,
      valor_centavos: valor,
      memoria: {
        ...memoria,
        valor_sem_arredondar: reaisIntermediario(valorSemArredondar),
        valor_final: reais(valor),
        arredondamento: 'meio-para-cima no centavo, só no valor final',
      },
    };
    itens.push(item);
    return item;
  };

  // 1) Salário base
  incluir(rubricaObrigatoria(CODIGO_SALARIO_BASE), salario, null, salario, {
    formula: 'salário contratual congelado da posição vigente',
  });

  // 2) Variáveis lançadas, agregadas por rubrica
  const grupos = new Map();
  for (const variavel of entrada.variaveis) {
    const lista = grupos.get(variavel.codigo) ?? [];
    lista.push(variavel);
    grupos.set(variavel.codigo, lista);
  }

  let diasFalta = 0;
  for (const [codigo, variaveis] of grupos) {
    if (CODIGOS_AUTOMATICOS.includes(codigo)) {
      throw new Error(`Rubrica ${codigo} é automática — o motor a calcula sozinho`);
    }
    const rubrica = porCodigo.get(codigo);
    if (!rubrica) throw new Error(`Rubrica ${codigo} sem versão vigente`);

    if (codigo === CODIGO_FALTAS) {
      const dias = variaveis.reduce((soma, item) => soma + (item.referencia ?? 0), 0);
      if (dias <= 0) throw new Error('Falta exige referência em dias maior que zero');
      diasFalta = dias;
      const valor = (salario * Math.round(dias * 100)) / (divisorDias * 100);
      incluir(rubrica, valor, dias, salario, {
        formula: `dias × (salário ÷ ${divisorDias})`,
        dias,
        salario_dia: reaisIntermediario(salario / divisorDias),
        ...origemDivisorDias,
      });
      continue;
    }

    switch (rubrica.tipo_calculo) {
      case 'horas_adicional': {
        const horas = variaveis.reduce((soma, item) => soma + (item.referencia ?? 0), 0);
        if (horas <= 0) throw new Error(`Rubrica ${codigo} exige horas > 0`);
        const fator = rubrica.parametro;
        if (fator === null || fator <= 0) {
          throw new Error(`Rubrica ${codigo} sem fator na versão vigente`);
        }
        const valor =
          (salario * Math.round(horas * 100) * Math.round(fator * 10_000)) /
          (divisorHoras * 100 * 10_000);
        incluir(rubrica, valor, horas, salario, {
          formula: `horas × fator × (salário ÷ ${divisorHoras})`,
          horas,
          fator,
          valor_hora: reaisIntermediario(salario / divisorHoras),
          ...origemDivisorHoras,
        });
        break;
      }
      case 'percentual_salario': {
        const percentual = rubrica.parametro;
        if (percentual === null || percentual <= 0) {
          throw new Error(`Rubrica ${codigo} sem percentual na versão vigente`);
        }
        const valor = aplicarPercentual(salario, percentual);
        incluir(rubrica, valor, percentual, salario, {
          formula: 'salário × percentual',
          percentual,
        });
        break;
      }
      case 'valor_informado': {
        const soma = variaveis.reduce((total, item) => total + (item.valor_centavos ?? 0), 0);
        if (soma <= 0) throw new Error(`Rubrica ${codigo} exige valor informado > 0`);
        incluir(rubrica, soma, null, null, {
          formula: 'soma dos valores lançados',
          lancamentos: variaveis.map((item) => ({
            origem: item.origem,
            valor: reais(item.valor_centavos ?? 0),
          })),
        });
        break;
      }
      default:
        throw new Error(
          `Rubrica ${codigo} (${rubrica.tipo_calculo}) não aceita lançamento de variável`
        );
    }
  }

  // 3) DSR sobre faltas — 1 dia de DSR por dia de falta (F1)
  if (diasFalta > 0) {
    const rubricaDsr = rubricaObrigatoria(CODIGO_DSR_FALTAS);
    const valor = (salario * Math.round(diasFalta * 100)) / (divisorDias * 100);
    incluir(rubricaDsr, valor, diasFalta, salario, {
      formula: `dias de falta × (salário ÷ ${divisorDias}) — 1 dia de DSR por dia de falta`,
      regra_f1:
        'simplificação fixada na 0013; apuração exata semana a semana (Lei 605/49) é evolução F2',
      dias: diasFalta,
      ...origemDivisorDias,
    });
  }

  // 4) Bases — sobre os valores finais dos itens
  const sinal = (natureza) =>
    natureza === 'provento' ? 1 : natureza === 'desconto' ? -1 : 0;
  let baseInss = 0;
  let baseIrrf = 0;
  let baseFgts = 0;
  for (const item of itens) {
    const rubrica = porCodigo.get(item.codigo);
    if (!rubrica) continue;
    const fator = sinal(item.natureza);
    if (rubrica.incide_inss) baseInss += fator * item.valor_centavos;
    if (rubrica.incide_irrf) baseIrrf += fator * item.valor_centavos;
    if (rubrica.incide_fgts) baseFgts += fator * item.valor_centavos;
  }
  baseInss = Math.max(0, baseInss);
  baseIrrf = Math.max(0, baseIrrf);
  baseFgts = Math.max(0, baseFgts);

  // 5) INSS progressivo faixa a faixa, com teto
  const tetoAplicado = baseInss > entrada.tabela_inss.teto_centavos;
  const baseInssLimitada = Math.min(baseInss, entrada.tabela_inss.teto_centavos);
  let inssSemArredondar = 0;
  const faixasPercorridas = [];
  let pisoAnterior = 0;
  for (const faixa of entrada.tabela_inss.faixas) {
    if (baseInssLimitada <= pisoAnterior) break;
    const tributavelNaFaixa = Math.min(baseInssLimitada, faixa.ate_centavos) - pisoAnterior;
    if (tributavelNaFaixa <= 0) {
      pisoAnterior = faixa.ate_centavos;
      continue;
    }
    const valorFaixa = aplicarPercentual(tributavelNaFaixa, faixa.aliquota);
    inssSemArredondar += valorFaixa;
    faixasPercorridas.push({
      ate: reais(faixa.ate_centavos),
      aliquota: faixa.aliquota,
      base_na_faixa: reais(tributavelNaFaixa),
      valor: reaisIntermediario(valorFaixa),
    });
    pisoAnterior = faixa.ate_centavos;
  }
  const itemInss = incluir(
    rubricaObrigatoria(CODIGO_INSS),
    inssSemArredondar,
    null,
    baseInssLimitada,
    {
      formula: 'progressivo faixa a faixa sobre a base limitada ao teto',
      base_inss: reais(baseInss),
      teto_contribuicao: reais(entrada.tabela_inss.teto_centavos),
      teto_aplicado: tetoAplicado,
      faixas_percorridas: faixasPercorridas,
      tabela_inss_versao_id: entrada.tabela_inss.id,
    }
  );
  const inssFinal = itemInss?.valor_centavos ?? 0;

  // 6) FGTS informativo — sem teto, fora do líquido
  incluir(
    rubricaObrigatoria(CODIGO_FGTS),
    aplicarPercentual(baseFgts, entrada.parametros.aliquota_fgts),
    null,
    baseFgts,
    {
      formula: 'base FGTS × alíquota (informativo — não entra no líquido)',
      aliquota: entrada.parametros.aliquota_fgts,
      parametro_folha_versao_id: entrada.parametros.id,
    }
  );

  // 7) IRRF — vale o regime de imposto MENOR
  const deducaoDependentes =
    entrada.dependentes_irrf * entrada.tabela_irrf.deducao_dependente_centavos;
  const baseCompleto = Math.max(0, baseIrrf - inssFinal - deducaoDependentes);
  const baseSimplificado = Math.max(
    0,
    baseIrrf - entrada.tabela_irrf.desconto_simplificado_centavos
  );
  const impostoDaFaixa = (base) => {
    for (const faixa of entrada.tabela_irrf.faixas) {
      if (faixa.ate_centavos === null || base <= faixa.ate_centavos) {
        return {
          imposto: Math.max(
            0,
            aplicarPercentual(base, faixa.aliquota) - faixa.deducao_centavos
          ),
          aliquota: faixa.aliquota,
          deducao_centavos: faixa.deducao_centavos,
        };
      }
    }
    throw new Error('Tabela IRRF sem faixa final aberta');
  };
  const completo = impostoDaFaixa(baseCompleto);
  const simplificado = impostoDaFaixa(baseSimplificado);
  const venceuSimplificado = simplificado.imposto < completo.imposto;
  const vencedor = venceuSimplificado ? simplificado : completo;
  const baseVencedora = venceuSimplificado ? baseSimplificado : baseCompleto;
  incluir(rubricaObrigatoria(CODIGO_IRRF), vencedor.imposto, null, baseVencedora, {
    formula: 'base do regime vencedor × alíquota − parcela a deduzir',
    base_tributavel: reais(baseIrrf),
    regime_completo: {
      base: reais(baseCompleto),
      deducao_inss: reais(inssFinal),
      dependentes: entrada.dependentes_irrf,
      deducao_dependentes: reais(deducaoDependentes),
      imposto: reaisIntermediario(completo.imposto),
    },
    regime_simplificado: {
      base: reais(baseSimplificado),
      desconto_simplificado: reais(entrada.tabela_irrf.desconto_simplificado_centavos),
      imposto: reaisIntermediario(simplificado.imposto),
    },
    regime_vencedor: venceuSimplificado ? 'simplificado' : 'completo',
    criterio: 'vale o imposto MENOR entre os dois regimes',
    aliquota_aplicada: vencedor.aliquota,
    parcela_deduzir: reais(vencedor.deducao_centavos),
    tabela_irrf_versao_id: entrada.tabela_irrf.id,
  });

  // 8) Totais — informativa fica fora
  let totalProventos = 0;
  let totalDescontos = 0;
  for (const item of itens) {
    if (item.natureza === 'provento') totalProventos += item.valor_centavos;
    if (item.natureza === 'desconto') totalDescontos += item.valor_centavos;
  }

  return {
    itens,
    total_proventos_centavos: totalProventos,
    total_descontos_centavos: totalDescontos,
    liquido_centavos: totalProventos - totalDescontos,
  };
}

// ================================================================== PDF mínimo
// Documento real (abre em qualquer leitor) para o GED não ficar com arquivo
// de mentira: PDF 1.4 de uma página, Helvetica/WinAnsi, texto em latin1.

function escaparPdf(texto) {
  return texto.replace(/([\\()])/g, '\\$1');
}

function pdfSimples(linhas) {
  const fluxo = linhas
    .map((linha, i) => `BT /F1 ${i === 0 ? 13 : 10} Tf 56 ${770 - i * 20} Td (${escaparPdf(linha)}) Tj ET`)
    .join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(fluxo, 'latin1')} >>\nstream\n${fluxo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const deslocamentos = [];
  objetos.forEach((objeto, i) => {
    deslocamentos.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const deslocamento of deslocamentos) {
    pdf += `${String(deslocamento).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ================================================================== catálogos SST

const EPIS = [
  { nome: 'Capacete de segurança classe B com jugular', ca: '31469', validadeDias: 520 },
  { nome: 'Óculos de proteção incolor antiembaçante', ca: '34082', validadeDias: 265 },
  { nome: 'Protetor auditivo tipo plug de silicone tripla flange', ca: '30021', validadeDias: 45 },
  { nome: 'Luva de vaqueta com punho de 7 cm', ca: '28932', validadeDias: -35 },
  { nome: 'Luva tricotada em poliéster com banho de poliuretano', ca: '42571', validadeDias: 700 },
  { nome: 'Botina de segurança com biqueira de composite', ca: '39875', validadeDias: 395 },
  { nome: 'Cinturão de segurança tipo paraquedista com talabarte em Y', ca: '35872', validadeDias: 150 },
  { nome: 'Máscara respiratória PFF2 sem válvula', ca: '38504', validadeDias: 95 },
];

// EPI por cargo — o que a operação de uma distribuidora de drywall entrega.
const EPI_POR_CARGO = {
  Estoquista: [5, 3, 0, 7],
  Conferente: [5, 4, 1],
  'Motorista Entregador': [5, 3, 0],
  'Auxiliar de Vendas': [5, 4],
  'Jovem Aprendiz': [5, 1],
  'Supervisor(a) Comercial': [5],
  'Gerente de Loja': [0],
};

// Restrições clínicas — DADO DE SAÚDE, gravado apenas CIFRADO (AES-256-GCM).
const RESTRICOES = [
  'Restrição para levantamento manual de carga acima de 15 kg pelos próximos 90 dias ' +
    '(lombalgia mecânica em acompanhamento fisioterápico). Reavaliação ocupacional em 3 meses.',
  'Uso obrigatório de lentes corretivas durante toda a jornada. Inapto para operação de ' +
    'empilhadeira e para condução de veículo da frota no período noturno.',
  'Restrição para trabalho em altura acima de 2 m por quadro de labirintite em tratamento. ' +
    'Reavaliar em 6 meses com relatório do otorrinolaringologista.',
  'Perda auditiva induzida por ruído (PAIR) leve bilateral: uso contínuo de protetor ' +
    'auditivo e audiometria semestral obrigatória.',
  'Gestante — afastar de atividades com exposição a poeira de gesso e de manuseio de carga ' +
    'acima de 5 kg, conforme NR-15 e art. 394-A da CLT.',
];

const ROTULOS_TIPO_ASO = {
  admissional: 'Admissional',
  periodico: 'Periódico',
  demissional: 'Demissional',
  retorno_trabalho: 'Retorno ao trabalho',
  mudanca_risco: 'Mudança de riscos',
};

const ROTULOS_TIPO_CAT = {
  tipico: 'Acidente típico',
  trajeto: 'Acidente de trajeto',
  doenca: 'Doença ocupacional',
};

// ================================================================== semeadura

async function semear(cliente) {
  // ---------------------------------------------------------------- limpeza
  const removidos = await limpar(cliente);

  // ---------------------------------------------------------------- contexto
  const pessoas = await carregarPessoas(cliente);
  const dp = await carregarDp(cliente);
  const ativos = pessoas.filter((p) => p.status === 'ativo' && p.salario !== null);
  if (ativos.length === 0) {
    throw new Error('Nenhum colaborador ativo com posição vigente — rode o 01-base antes.');
  }

  const resumoFolha = await semearFolha(cliente, { pessoas, ativos, dp });
  const resumoSst = await semearSst(cliente, { pessoas, ativos, dp });

  await conferir(cliente);

  return { removidos, folha: resumoFolha, sst: resumoSst };
}

// ------------------------------------------------------------------ limpeza

async function limpar(cliente) {
  const removidos = {};
  await comTriggersDesligados(cliente, TABELAS_LIMPEZA, async () => {
    const passos = [
      // folha inteira (a competência fechada só cai com o trigger desligado)
      ['rh_folha.item_calculo', 'DELETE FROM rh_folha.item_calculo'],
      ['rh_folha.folha_colaborador', 'DELETE FROM rh_folha.folha_colaborador'],
      ['rh_folha.variavel_lancada', 'DELETE FROM rh_folha.variavel_lancada'],
      ['rh_folha.competencia_folha', 'DELETE FROM rh_folha.competencia_folha'],
      // SST (cat tem auto-referência: DELETE sem WHERE resolve de uma vez)
      ['rh.cat', 'DELETE FROM rh.cat'],
      ['rh.epi_entrega', 'DELETE FROM rh.epi_entrega'],
      ['rh.epi_item', 'DELETE FROM rh.epi_item'],
      // NR-1 (0029) aponta para o ASO — sai antes dele
      [
        'rh.avaliacao_psicossocial',
        'DELETE FROM rh.avaliacao_psicossocial',
      ],
      ['rh.aso', 'DELETE FROM rh.aso'],
      // eventos e documentos: SÓ os deste módulo (o GED e a linha do tempo
      // são compartilhados com os outros módulos de semeadura)
      [
        'rh.evento_colaborador',
        `DELETE FROM rh.evento_colaborador
          WHERE origem_tabela IN ('rh.aso', 'rh.epi_entrega', 'rh.cat',
                                  'rh.avaliacao_psicossocial')`,
      ],
      [
        'rh.ciencia',
        `DELETE FROM rh.ciencia c
          USING rh.documento d
          WHERE d.id = c.documento_id
            AND (d.titulo LIKE '${PREFIXO_DOC_ASO}%' OR d.titulo LIKE '${PREFIXO_DOC_TERMO}%')`,
      ],
      [
        'rh.documento',
        `DELETE FROM rh.documento
          WHERE titulo LIKE '${PREFIXO_DOC_ASO}%' OR titulo LIKE '${PREFIXO_DOC_TERMO}%'`,
      ],
    ];
    for (const [tabela, sql] of passos) {
      const resultado = await cliente.query(sql);
      if (resultado.rowCount > 0) {
        removidos[tabela] = (removidos[tabela] ?? 0) + resultado.rowCount;
      }
    }
  });
  const total = Object.values(removidos).reduce((a, b) => a + b, 0);
  log(
    total === 0
      ? '10-folha-sst: nada de folha/SST para limpar.'
      : `10-folha-sst: limpeza — ${total} linha(s) em ${Object.keys(removidos).length} tabela(s).`
  );
  return removidos;
}

// ------------------------------------------------------------------ contexto do banco

async function carregarPessoas(cliente) {
  const { rows } = await cliente.query(
    `SELECT c.id, c.usuario_id, c.matricula, c.nome_completo, c.status,
            c.tipo_vinculo,
            c.data_admissao::text      AS data_admissao,
            c.data_desligamento::text  AS data_desligamento,
            p.salario::text            AS salario,
            cv.nome                    AS cargo,
            ev.unidade                 AS unidade,
            (SELECT count(*) FROM rh.dependente d
              WHERE d.colaborador_id = c.id)::int AS dependentes,
            j.carga_semanal_minutos
       FROM rh.colaborador c
       LEFT JOIN rh.posicao_colaborador p
         ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       LEFT JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       -- Jornada vigente (0038): é a carga semanal dela que dá o divisor da
       -- hora de cada um. LEFT JOIN pelo mesmo motivo do repositório de
       -- produção (listarColaboradoresParaCalculo): quem não tem escala
       -- cadastrada continua entrando na folha, caindo no divisor de
       -- referência. Não duplica linha — escala_colaborador tem índice único
       -- de uma vigente por pessoa (escala_colaborador_uma_vigente, 0027).
       LEFT JOIN rh.escala_colaborador e
         ON e.colaborador_id = c.id AND e.fim_vigencia IS NULL
       LEFT JOIN rh.jornada_versao j ON j.id = e.jornada_versao_id
       LEFT JOIN rh.lotacao l
         ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id
        AND ev.status = 'ativa' AND ev.fim_vigencia IS NULL
      ORDER BY c.matricula`
  );
  return rows.map((linha) => ({
    id: Number(linha.id),
    usuarioId: Number(linha.usuario_id),
    matricula: linha.matricula,
    nome: linha.nome_completo,
    status: linha.status,
    vinculo: linha.tipo_vinculo,
    admissao: linha.data_admissao,
    desligamento: linha.data_desligamento,
    salarioCentavos: linha.salario === null ? null : Math.round(Number(linha.salario) * 100),
    salario: linha.salario,
    cargo: linha.cargo,
    unidade: linha.unidade,
    dependentes: Number(linha.dependentes),
    cargaSemanalMinutos:
      linha.carga_semanal_minutos === null ? null : Number(linha.carga_semanal_minutos),
  }));
}

/** Os dois usuários de DP: um opera/calcula, o outro aprova (segregação). */
async function carregarDp(cliente) {
  const { rows } = await cliente.query(
    `SELECT u.id, u.email, u.nome
       FROM sistema.usuario u
       JOIN rh.colaborador c ON c.usuario_id = u.id
      WHERE u.papel = 'dp' AND u.ativo AND c.status = 'ativo'
      ORDER BY (u.email = 'dp@fastdemo.local') DESC, u.id`
  );
  if (rows.length < 2) {
    throw new Error(
      `Preciso de 2 usuários de DP ativos para a segregação de funções (achei ${rows.length}).`
    );
  }
  // aprovador = persona dp@fastdemo.local (é quem o usuário vai logar na demo);
  // operador = o outro assistente de DP — ele calcula, ela aprova.
  return {
    aprovador: { id: Number(rows[0].id), email: rows[0].email, nome: rows[0].nome },
    operador: { id: Number(rows[1].id), email: rows[1].email, nome: rows[1].nome },
  };
}

async function carregarRubricas(cliente) {
  const { rows } = await cliente.query(
    `SELECT r.id AS rubrica_id, rv.id AS rubrica_versao_id, r.codigo, r.nome,
            r.natureza, rv.incide_inss, rv.incide_irrf, rv.incide_fgts,
            rv.tipo_calculo, rv.parametro::text AS parametro
       FROM rh_folha.rubrica r
       JOIN rh_folha.rubrica_versao rv
         ON rv.rubrica_id = r.id AND rv.status = 'ativa'
      WHERE r.ativo
      ORDER BY r.codigo`
  );
  const rubricas = rows.map((linha) => ({
    rubrica_id: Number(linha.rubrica_id),
    rubrica_versao_id: Number(linha.rubrica_versao_id),
    codigo: linha.codigo,
    nome: linha.nome,
    natureza: linha.natureza,
    incide_inss: linha.incide_inss,
    incide_irrf: linha.incide_irrf,
    incide_fgts: linha.incide_fgts,
    tipo_calculo: linha.tipo_calculo,
    parametro: linha.parametro === null ? null : Number(linha.parametro),
  }));
  const porCodigo = new Map(rubricas.map((r) => [r.codigo, r]));
  for (const codigo of [
    CODIGO_SALARIO_BASE, '1101', '1102', CODIGO_FALTAS, CODIGO_DSR_FALTAS,
    CODIGO_INSS, CODIGO_IRRF, CODIGO_DESCONTO_BENEFICIO, CODIGO_FGTS, '9001', '9002',
    // As seis nomeadas pela diretoria (0028): o semeador lança em todas, então
    // a falta de qualquer uma tem de estourar aqui, não no meio do cálculo.
    '1301', '1302', '1303', '1304', '1401', '1501',
  ]) {
    if (!porCodigo.has(codigo)) {
      throw new Error(`Rubrica ${codigo} sem versão vigente — confira o seed da 0013.`);
    }
  }
  return { rubricas, porCodigo };
}

/** Versões ATIVAS das tabelas legais, em centavos — igual a repositorio.tabelasVigentes. */
async function carregarTabelasLegais(cliente) {
  // Em série, nunca em Promise.all: é UM Client do pg, e consultas paralelas
  // no mesmo Client são deprecadas (removidas no pg@9).
  const inss = await cliente.query(
    `SELECT id, faixas, teto_contribuicao::text AS teto_contribuicao
       FROM rh_folha.tabela_inss_versao WHERE status = 'ativa'`
  );
  const irrf = await cliente.query(
    `SELECT id, faixas, deducao_por_dependente::text AS deducao_por_dependente,
            desconto_simplificado::text AS desconto_simplificado
       FROM rh_folha.tabela_irrf_versao WHERE status = 'ativa'`
  );
  const parametros = await cliente.query(
    // Os DIVISORES (0038) entram aqui junto da alíquota: eles deixaram de ser
    // número do fonte e viraram parâmetro. Ler só a alíquota, como era antes,
    // fazia esta cópia do motor não enxergar as colunas novas e continuar
    // dividindo por 220 e por 30 chumbados — ver o bloco dos divisores em
    // calcularFolha.
    `SELECT id, aliquota_fgts::text AS aliquota_fgts,
            divisor_mensal_horas::text AS divisor_mensal_horas,
            carga_semanal_referencia_minutos,
            divisor_mensal_dias::text AS divisor_mensal_dias
       FROM rh_folha.parametro_folha_versao WHERE status = 'ativa'`
  );
  if (inss.rows.length === 0 || irrf.rows.length === 0 || parametros.rows.length === 0) {
    throw new Error('Tabela legal vigente ausente (INSS/IRRF/parâmetros) — confira a 0013.');
  }
  return {
    inss: {
      id: Number(inss.rows[0].id),
      faixas: inss.rows[0].faixas.map((f) => ({
        ate_centavos: Math.round(f.ate * 100),
        aliquota: f.aliquota,
      })),
      teto_centavos: Math.round(Number(inss.rows[0].teto_contribuicao) * 100),
    },
    irrf: {
      id: Number(irrf.rows[0].id),
      faixas: irrf.rows[0].faixas.map((f) => ({
        ate_centavos: f.ate === null ? null : Math.round(f.ate * 100),
        aliquota: f.aliquota,
        deducao_centavos: Math.round(f.deducao * 100),
      })),
      deducao_dependente_centavos: Math.round(
        Number(irrf.rows[0].deducao_por_dependente) * 100
      ),
      desconto_simplificado_centavos: Math.round(
        Number(irrf.rows[0].desconto_simplificado) * 100
      ),
    },
    parametros: {
      id: Number(parametros.rows[0].id),
      aliquota_fgts: Number(parametros.rows[0].aliquota_fgts),
      divisor_mensal_horas: Number(parametros.rows[0].divisor_mensal_horas),
      carga_semanal_referencia_minutos: Number(
        parametros.rows[0].carga_semanal_referencia_minutos
      ),
      divisor_mensal_dias: Number(parametros.rows[0].divisor_mensal_dias),
    },
  };
}

/** Adesões vigentes com desconto — igual a repositorio.listarDescontosDeAdesao. */
async function carregarDescontosBeneficio(cliente) {
  const { rows } = await cliente.query(
    `SELECT a.colaborador_id, a.desconto::text AS desconto, b.nome AS beneficio
       FROM rh.adesao a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
       JOIN rh.beneficio b ON b.id = a.beneficio_id
      WHERE a.fim IS NULL AND a.status = 'ativa'
        AND a.desconto IS NOT NULL AND a.desconto > 0
        AND c.status = 'ativo'
      ORDER BY c.nome_completo, b.nome, a.id`
  );
  return rows.map((linha) => ({
    colaboradorId: Number(linha.colaborador_id),
    centavos: Math.round(Number(linha.desconto) * 100),
    beneficio: linha.beneficio,
  }));
}

// ------------------------------------------------------------------ FOLHA

// Quem ganha hora extra numa distribuidora: operação e balcão.
const CARGOS_COM_HE = [
  'Estoquista', 'Conferente', 'Motorista Entregador', 'Auxiliar de Vendas',
  'Vendedor(a)', 'Auxiliar Administrativo',
];

// Quem recebe COMISSÃO: o time que vende. A comissão é a primeira verba que a
// diretoria nomeou na reunião (migração 0028) e a demo tem de mostrá-la viva.
const CARGOS_COMISSIONADOS = [
  'Vendedor(a)', 'Auxiliar de Vendas', 'Supervisor(a) Comercial',
];

/**
 * Dias de REPOUSO e dias ÚTEIS da competência — a razão que o DP usa para
 * apurar DSR sobre verba variável (Lei 605/49 art. 7º; Súmula 27 do TST para a
 * comissão): variável × repousos ÷ úteis.
 *
 * Só domingos entram como repouso: o calendário de FERIADOS é do módulo de
 * ponto, não da folha, e inventar feriado aqui produziria número que o DP não
 * consegue conferir. A demo subestima o DSR de propósito e diz isso.
 */
function repousosDoMes(competencia) {
  let repousos = 0;
  let uteis = 0;
  const ultimo = competencia.ultimo.getUTCDate();
  for (let dia = 1; dia <= ultimo; dia += 1) {
    const data = new Date(Date.UTC(competencia.ano, competencia.mes - 1, dia));
    if (data.getUTCDay() === 0) repousos += 1;
    else uteis += 1;
  }
  return { repousos, uteis };
}

/**
 * Sorteia as variáveis da competência de forma determinística. `perfil` muda a
 * semente para o mês passado e o corrente não saírem idênticos.
 *
 * As SEIS rubricas nomeadas pela diretoria (0028) são lançadas aqui, com gente
 * de verdade: sem isso o catálogo existia e nenhuma delas tinha um lançamento —
 * a demo mostrava só as verbas genéricas 9001/9002, contradizendo a diretriz
 * "a gente tem que eliminar esses proventos manuais o máximo". As genéricas
 * continuam existindo, em DOSE PEQUENA (perfil.manualProvento/manualDesconto),
 * porque a tela precisa ter o que mostrar quando o aviso de exceção dispara.
 *
 * Todas as seis são 'valor_informado': quem calcula é a planilha de vendas / o
 * cálculo de férias / a tabela da cota, fora do sistema — o DP lança o valor
 * apurado (é o que a 0028 fixou para F1). Os valores abaixo imitam essa
 * apuração; nenhum deles vira regra do motor.
 */
function sortearVariaveis(rng, elegiveis, perfil, competencia, porCodigo, parametros) {
  const embaralhados = embaralhar(rng, elegiveis);
  const comHe = embaralhados.filter((p) => CARGOS_COM_HE.includes(p.cargo));
  const lancamentos = [];
  const { repousos, uteis } = repousosDoMes(competencia);

  /**
   * Valor da HE em centavos, com a mesma conta de `horas_adicional` do motor —
   * divisor da PESSOA (0038), não 220 para todo mundo. Este número não vira
   * item da folha (o motor recalcula), mas é a base do DSR sobre hora extra
   * lançado logo abaixo: com o divisor errado aqui, o 1303 do plantonista sai
   * proporcional a uma HE que o motor nunca vai pagar.
   */
  const valorHoraExtra = (pessoa, horas, codigo) => {
    const fator = porCodigo.get(codigo).parametro;
    const divisorHoras = divisorHorasDe(parametros, pessoa.cargaSemanalMinutos);
    return Math.round(
      (pessoa.salarioCentavos * Math.round(horas * 100) * Math.round(fator * 10_000)) /
        (divisorHoras * 100 * 10_000)
    );
  };

  const he50 = comHe.slice(0, perfil.he50);
  const horasExtrasPorPessoa = new Map();
  he50.forEach((pessoa) => {
    // meia em meia hora, como o espelho de ponto entrega
    const horas = inteiro(rng, 8, 44) / 2;
    lancamentos.push({ pessoa, codigo: '1101', referencia: horas, valor: null, origem: 'manual' });
    horasExtrasPorPessoa.set(pessoa.id, valorHoraExtra(pessoa, horas, '1101'));
  });

  const he100 = comHe.slice(perfil.he50, perfil.he50 + perfil.he100);
  he100.forEach((pessoa) => {
    const horas = inteiro(rng, 4, 16) / 2;
    lancamentos.push({ pessoa, codigo: '1102', referencia: horas, valor: null, origem: 'manual' });
    horasExtrasPorPessoa.set(
      pessoa.id,
      (horasExtrasPorPessoa.get(pessoa.id) ?? 0) + valorHoraExtra(pessoa, horas, '1102')
    );
  });

  const faltosos = embaralhados
    .filter((p) => !he50.includes(p))
    .slice(0, perfil.faltas);
  faltosos.forEach((pessoa) => {
    lancamentos.push({
      pessoa,
      codigo: CODIGO_FALTAS,
      referencia: inteiro(rng, 1, 2),
      valor: null,
      origem: 'manual',
    });
  });

  // ------------------------------------------------ 1301 comissão + 1304 reflexo de DSR
  // Toda comissão do mês arrasta o repouso remunerado sobre ela (Súmula 27 do
  // TST) — as duas linhas nascem juntas, que é como o DP lança.
  const comissionados = embaralhados
    .filter((p) => CARGOS_COMISSIONADOS.includes(p.cargo))
    .slice(0, perfil.comissionados);
  const comissaoPorPessoa = new Map();
  comissionados.forEach((pessoa) => {
    // Entre 12% e 48% do salário — a faixa que a planilha de vendas produz num
    // mês normal de distribuidora.
    const comissao = Math.round((pessoa.salarioCentavos * inteiro(rng, 12, 48)) / 100);
    comissaoPorPessoa.set(pessoa.id, comissao);
    lancamentos.push({ pessoa, codigo: '1301', referencia: null, valor: comissao / 100, origem: 'manual' });
    lancamentos.push({
      pessoa,
      codigo: '1304',
      referencia: null,
      valor: Math.round((comissao * repousos) / uteis) / 100,
      origem: 'manual',
    });
  });

  // ------------------------------------------------ 1302 reflexo de comissão
  // Repercussão da comissão nas verbas de férias/13º de quem teve o período no
  // mês — poucos por competência, não é verba de todo mundo todo mês.
  comissionados.slice(0, perfil.reflexoComissao).forEach((pessoa) => {
    lancamentos.push({
      pessoa,
      codigo: '1302',
      referencia: null,
      valor: Math.round(comissaoPorPessoa.get(pessoa.id) / 12) / 100,
      origem: 'manual',
    });
  });

  // ------------------------------------------------ 1303 DSR sobre hora extra
  // O repouso é pago como trabalhado (Lei 605/49 art. 7º): a semana com hora
  // extra arrasta DSR. Mesma razão do 1304, aplicada à HE em vez da comissão.
  // LEITURA NOSSA, a confirmar com o DP — a 0028 nomeou a rubrica "DSR" sem
  // dizer sobre qual variável a Fast a usa.
  [...horasExtrasPorPessoa.entries()]
    .slice(0, perfil.dsrHoraExtra)
    .forEach(([colaboradorId, valorHe]) => {
      const pessoa = embaralhados.find((p) => p.id === colaboradorId);
      lancamentos.push({
        pessoa,
        codigo: '1303',
        referencia: null,
        valor: Math.round((valorHe * repousos) / uteis) / 100,
        origem: 'manual',
      });
    });

  // ------------------------------------------------ 1401 abono pecuniário
  // Venda de 1/3 das férias (CLT art. 143): 10 dias de salário mais o terço
  // constitucional. Quem calcula é o recibo de férias; aqui é o valor apurado.
  // Só CLT: estagiário tem recesso (Lei 11.788), não férias — e PJ não tem nem
  // uma coisa nem outra.
  embaralhados
    .filter((p) => p.vinculo === 'clt' && !comissionados.includes(p))
    .slice(0, perfil.abono)
    .forEach((pessoa) => {
      lancamentos.push({
        pessoa,
        codigo: '1401',
        referencia: null,
        // 10 dias de salário-dia mais o terço: salário ÷ divisor_dias × 10 × 4/3.
        // O salário-dia sai do parâmetro (0038), não de um 30 escrito aqui.
        valor:
          Math.round(
            (pessoa.salarioCentavos * 10 * 4) / (parametros.divisor_mensal_dias * 3)
          ) / 100,
        origem: 'manual',
      });
    });

  // ------------------------------------------------ 1501 salário família
  // Cota por filho de até 14 anos, devida ao segurado EMPREGADO que ganha
  // abaixo do teto da Previdência. A demo escolhe pelos MENORES salários entre
  // os CLT com dependente cadastrado — o teto e a cota moram na tabela do INSS,
  // que não está no sistema (F2), então o DP lança o valor apurado lá fora.
  embaralhados
    .filter((p) => p.vinculo === 'clt' && p.dependentes > 0)
    .sort((a, b) => a.salarioCentavos - b.salarioCentavos || a.id - b.id)
    .slice(0, perfil.salarioFamilia)
    .forEach((pessoa) => {
      const cota = inteiro(rng, 55, 65);
      lancamentos.push({
        pessoa,
        codigo: '1501',
        referencia: null,
        valor: cota * pessoa.dependentes,
        origem: 'manual',
      });
    });

  // ------------------------------------------------ 9001/9002: a EXCEÇÃO
  // Ficam de propósito, em dose pequena: é o caso que faz a tela de lançamento
  // disparar "se este lançamento se repete todo mês, crie uma rubrica própria
  // em Parâmetros". Verba recorrente já tem rubrica nomeada acima.
  const premiados = embaralhados.slice(-perfil.manualProvento);
  premiados.forEach((pessoa) => {
    lancamentos.push({
      pessoa,
      codigo: '9001',
      referencia: null,
      valor: inteiro(rng, 25, 90) * 10,
      origem: 'manual',
    });
  });

  const descontados = embaralhados.slice(
    -(perfil.manualProvento + perfil.manualDesconto),
    -perfil.manualProvento
  );
  descontados.forEach((pessoa) => {
    lancamentos.push({
      pessoa,
      codigo: '9002',
      referencia: null,
      valor: inteiro(rng, 12, 45) * 10,
      origem: 'manual',
    });
  });

  return lancamentos;
}

/**
 * Quantas competências FECHADAS a demo mantém antes da ABERTA do mês corrente.
 *
 * Três, e não uma: o card de CUSTO DE PESSOAL do painel executivo soma apenas
 * competência fechada, e com um único ponto a série não tem tendência ("série
 * curta demais para tendência"). Três pontos dão a leitura mensal que a
 * diretoria espera e enchem o denominador do indicador `folha_no_prazo`. Mais
 * que isso encareceria a semeadura sem acrescentar leitura: cada competência
 * calcula ~60 folhas com memória item a item.
 */
const COMPETENCIAS_FECHADAS = 3;

/**
 * Uma competência FECHADA e completa: variáveis lançadas, cálculo com memória
 * aritmeticamente correta item a item e o fechamento POR ÚLTIMO (depois de
 * 'fechada' nem o INSERT dos filhos passa). Segregação de funções respeitada:
 * calculada_por ≠ aprovada_por.
 */
async function semearCompetenciaFechada(cliente, contexto, mesesAtras) {
  const {
    rng, porCodigo, tabelas, descontosBeneficio, rubricasMotor, ativos, dp,
  } = contexto;
  const competencia = competenciaDeslocada(mesesAtras);

  // Só quem estava na empresa o mês INTEIRO: o motor F1 não faz proporcional
  // de admissão/rescisão (isso é F2) — melhor uma folha coerente.
  const doMes = ativos.filter((p) => p.admissao <= iso(competencia.primeiro));

  const abertaEm = instanteBrasilia(competencia.primeiro, 8, 12);
  const calculadaEm = instanteBrasilia(maisDias(competencia.ultimo, -6), 16, 40);
  const aprovadaEm = instanteBrasilia(maisDias(competencia.ultimo, -5), 10, 25);
  const fechadaEm = instanteBrasilia(maisDias(competencia.ultimo, -4), 9, 5);

  const { rows: linhasFechada } = await cliente.query(
    `INSERT INTO rh_folha.competencia_folha
       (ano, mes, tipo, estado, aberta_em, aberta_por,
        calculada_por, aprovada_por, aprovada_em, criado_em)
     VALUES ($1, $2, 'mensal', 'aprovada', $3, $4, $5, $6, $7, $3)
     RETURNING id`,
    [
      competencia.ano, competencia.mes, abertaEm,
      dp.operador.id, dp.operador.id, dp.aprovador.id, aprovadaEm,
    ]
  );
  const competenciaFechadaId = Number(linhasFechada[0].id);

  const lancamentosFechada = sortearVariaveis(
    rng,
    doMes,
    {
      he50: 16, he100: 5, faltas: 5,
      comissionados: 6, reflexoComissao: 2, dsrHoraExtra: 4,
      abono: 1, salarioFamilia: 3,
      // As genéricas são EXCEÇÃO: uma de cada, só para a tela ter o caso.
      manualProvento: 1, manualDesconto: 1,
    },
    competencia,
    porCodigo,
    tabelas.parametros
  );
  const idsFechada = new Set(doMes.map((p) => p.id));
  for (const desconto of descontosBeneficio) {
    if (!idsFechada.has(desconto.colaboradorId)) continue;
    lancamentosFechada.push({
      pessoa: doMes.find((p) => p.id === desconto.colaboradorId),
      codigo: CODIGO_DESCONTO_BENEFICIO,
      referencia: null,
      valor: desconto.centavos / 100,
      origem: 'beneficio',
    });
  }
  await gravarVariaveis(
    cliente, competenciaFechadaId, lancamentosFechada, porCodigo,
    dp.operador.id, abertaEm
  );

  const { folhas, itens } = calcularCompetencia({
    pessoas: doMes,
    lancamentos: lancamentosFechada,
    rubricas: rubricasMotor,
    tabelas,
  });

  const idsFolha = await inserirLote(
    cliente,
    'rh_folha.folha_colaborador',
    [
      'competencia_id', 'colaborador_id', 'salario_base_congelado', 'dependentes_irrf',
      'total_proventos', 'total_descontos', 'liquido', 'calculada_em',
    ],
    folhas.map((f) => [
      competenciaFechadaId, f.colaboradorId,
      (f.salarioCentavos / 100).toFixed(2), f.dependentes,
      (f.totalProventos / 100).toFixed(2), (f.totalDescontos / 100).toFixed(2),
      (f.liquido / 100).toFixed(2), calculadaEm,
    ]),
    'id, colaborador_id'
  );
  const folhaIdPorColaborador = new Map(
    idsFolha.map((linha) => [Number(linha.colaborador_id), Number(linha.id)])
  );

  await inserirLote(
    cliente,
    'rh_folha.item_calculo',
    ['folha_colaborador_id', 'rubrica_versao_id', 'referencia', 'base', 'valor', 'memoria', 'criado_em'],
    itens.map((item) => [
      folhaIdPorColaborador.get(item.colaboradorId),
      item.rubrica_versao_id,
      item.referencia,
      item.base_centavos === null ? null : (item.base_centavos / 100).toFixed(2),
      (item.valor_centavos / 100).toFixed(2),
      JSON.stringify(item.memoria),
      calculadaEm,
    ])
  );

  // Fecha por último: depois de 'fechada' nem o INSERT dos filhos passa.
  await cliente.query(
    `UPDATE rh_folha.competencia_folha
        SET estado = 'fechada', fechada_em = $2, fechada_por = $3
      WHERE id = $1`,
    [competenciaFechadaId, fechadaEm, dp.aprovador.id]
  );

  const totalLiquido = folhas.reduce((soma, f) => soma + f.liquido, 0);
  log(
    `10-folha-sst: folha ${competencia.rotulo} FECHADA — ${folhas.length} colaboradores, ` +
    `${itens.length} itens de memória, líquido R$ ${(totalLiquido / 100).toFixed(2)} ` +
    `(calculada por ${dp.operador.nome}, aprovada por ${dp.aprovador.nome}).`
  );

  return {
    id: competenciaFechadaId,
    rotulo: competencia.rotulo,
    colaboradores: folhas.length,
    itens: itens.length,
    variaveis: lancamentosFechada.length,
    liquido: totalLiquido / 100,
  };
}

async function semearFolha(cliente, { ativos, dp }) {
  const rng = aleatorio(SEMENTE_FOLHA);
  const { porCodigo } = await carregarRubricas(cliente);
  const tabelas = await carregarTabelasLegais(cliente);
  const descontosBeneficio = await carregarDescontosBeneficio(cliente);

  // Competência fechada aprovada com tabela legal NÃO conferida seria
  // incoerente (o serviço bloqueia a aprovação) — o DP confere aqui.
  const conferidas = await marcarTabelasConferidas(cliente);

  const rubricasMotor = [...porCodigo.values()];
  const corrente = competenciaDeslocada(0);
  const contexto = {
    rng, porCodigo, tabelas, descontosBeneficio, rubricasMotor, ativos, dp,
  };

  // ---------------------------------------------------------- meses passados (FECHADAS)
  // Da mais antiga para a mais recente, em série: a ordem FIXA é o que mantém a
  // semeadura determinística (o rng é consumido na mesma sequência a cada
  // execução — ver as regras de db/semear/comum.js).
  const fechadas = [];
  for (let mesesAtras = COMPETENCIAS_FECHADAS; mesesAtras >= 1; mesesAtras -= 1) {
     
    fechadas.push(await semearCompetenciaFechada(cliente, contexto, mesesAtras));
  }

  // ---------------------------------------------------------- mês corrente (ABERTA)
  const abertaCorrenteEm = instanteBrasilia(corrente.primeiro, 8, 30);
  const { rows: linhasAberta } = await cliente.query(
    `INSERT INTO rh_folha.competencia_folha
       (ano, mes, tipo, estado, aberta_em, aberta_por, criado_em)
     VALUES ($1, $2, 'mensal', 'aberta', $3, $4, $3)
     RETURNING id`,
    [corrente.ano, corrente.mes, abertaCorrenteEm, dp.aprovador.id]
  );
  const competenciaAbertaId = Number(linhasAberta[0].id);

  const lancamentosAberta = sortearVariaveis(
    rng,
    ativos,
    {
      he50: 18, he100: 6, faltas: 4,
      comissionados: 7, reflexoComissao: 2, dsrHoraExtra: 5,
      abono: 2, salarioFamilia: 3,
      manualProvento: 1, manualDesconto: 1,
    },
    corrente,
    porCodigo,
    tabelas.parametros
  );
  for (const desconto of descontosBeneficio) {
    const pessoa = ativos.find((p) => p.id === desconto.colaboradorId);
    if (!pessoa) continue;
    lancamentosAberta.push({
      pessoa,
      codigo: CODIGO_DESCONTO_BENEFICIO,
      referencia: null,
      valor: desconto.centavos / 100,
      origem: 'beneficio',
    });
  }
  await gravarVariaveis(
    cliente, competenciaAbertaId, lancamentosAberta, porCodigo,
    dp.aprovador.id, instanteBrasilia(maisDias(hoje(), -2), 15, 10)
  );

  log(
    `10-folha-sst: folha ${corrente.rotulo} ABERTA — ${lancamentosAberta.length} variáveis ` +
    'lançadas e NENHUM cálculo: é a peça de demonstração do botão "Calcular".'
  );

  return {
    conferidas,
    fechadas,
    // A mais recente das fechadas — é a competência que a demo abre em /folha
    // e a que o painel executivo usa como custo do mês de referência.
    fechada: fechadas[fechadas.length - 1],
    aberta: {
      id: competenciaAbertaId,
      rotulo: corrente.rotulo,
      variaveis: lancamentosAberta.length,
      elegiveis: ativos.length,
    },
    descontos_beneficio: descontosBeneficio.length,
  };
}

async function marcarTabelasConferidas(cliente) {
  let total = 0;
  for (const tabela of [
    'rh_folha.tabela_inss_versao',
    'rh_folha.tabela_irrf_versao',
    'rh_folha.parametro_folha_versao',
  ]) {
    const resultado = await cliente.query(
      `UPDATE ${tabela} SET conferido_dp = TRUE
        WHERE status = 'ativa' AND NOT conferido_dp`
    );
    total += resultado.rowCount;
  }
  return total;
}

async function gravarVariaveis(cliente, competenciaId, lancamentos, porCodigo, lancadoPor, momento) {
  if (lancamentos.length === 0) return;
  await inserirLote(
    cliente,
    'rh_folha.variavel_lancada',
    [
      'competencia_id', 'colaborador_id', 'rubrica_id', 'referencia', 'valor',
      'origem', 'lancado_por', 'criado_em',
    ],
    lancamentos.map((l) => [
      competenciaId,
      l.pessoa.id,
      porCodigo.get(l.codigo).rubrica_id,
      l.referencia === null ? null : l.referencia.toFixed(2),
      l.valor === null ? null : l.valor.toFixed(2),
      l.origem,
      lancadoPor,
      momento,
    ])
  );
}

/** Roda o motor para cada colaborador, na mesma ordem em que o app rodaria. */
function calcularCompetencia({ pessoas, lancamentos, rubricas, tabelas }) {
  const porColaborador = new Map();
  lancamentos.forEach((lancamento, indice) => {
    const lista = porColaborador.get(lancamento.pessoa.id) ?? [];
    lista.push({ ...lancamento, indice });
    porColaborador.set(lancamento.pessoa.id, lista);
  });

  const folhas = [];
  const itens = [];
  // O app calcula ORDER BY nome_completo, id — a ordem só afeta as ids, mas
  // manter é o que torna duas execuções byte-idênticas.
  const ordenadas = pessoas
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id - b.id);

  for (const pessoa of ordenadas) {
    const variaveis = (porColaborador.get(pessoa.id) ?? [])
      .slice()
      .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.indice - b.indice)
      .map((l) => ({
        codigo: l.codigo,
        referencia: l.referencia,
        valor_centavos: l.valor === null ? null : Math.round(l.valor * 100),
        origem: l.origem,
      }));

    let resultado;
    try {
      resultado = calcularFolha({
        salario_base_centavos: pessoa.salarioCentavos,
        dependentes_irrf: pessoa.dependentes,
        // Carga da jornada vigente (0038) — é ela que dá o divisor da hora.
        carga_semanal_minutos: pessoa.cargaSemanalMinutos,
        variaveis,
        rubricas,
        tabela_inss: tabelas.inss,
        tabela_irrf: tabelas.irrf,
        parametros: tabelas.parametros,
      });
    } catch (erro) {
      throw new Error(`Cálculo de ${pessoa.nome} (${pessoa.matricula}): ${erro.message}`);
    }

    folhas.push({
      colaboradorId: pessoa.id,
      salarioCentavos: pessoa.salarioCentavos,
      dependentes: pessoa.dependentes,
      totalProventos: resultado.total_proventos_centavos,
      totalDescontos: resultado.total_descontos_centavos,
      liquido: resultado.liquido_centavos,
    });
    for (const item of resultado.itens) {
      itens.push({ ...item, colaboradorId: pessoa.id });
    }
  }
  return { folhas, itens };
}

// ------------------------------------------------------------------ SST

async function semearSst(cliente, { pessoas, ativos, dp }) {
  const rng = aleatorio(SEMENTE_SST);
  const agora = hoje();
  const documentos = []; // acumula para um único INSERT em lote
  const eventos = [];

  const novoDocumento = (dados) => {
    const conteudo = pdfSimples(dados.linhas);
    documentos.push({
      chave: dados.chave,
      colaboradorId: dados.colaboradorId,
      categoria: dados.categoria,
      titulo: dados.titulo,
      nomeArquivo: dados.nomeArquivo,
      conteudo,
      sensivel: dados.sensivel,
      hash: sha256(conteudo),
      enviadoEm: dados.enviadoEm,
    });
    return dados.chave;
  };

  // ---------------------------------------------------------- ASO
  const novatos = ativos.filter((p) => p.admissao > iso(maisDias(agora, -90)));
  const veteranos = embaralhar(
    rng,
    ativos.filter((p) => !novatos.includes(p))
  );

  const baldes = [
    { nome: 'vencidos', pessoas: veteranos.slice(0, 6), dias: [-12, -30, -48, -66, -84, -102] },
    { nome: 'vence_30', pessoas: veteranos.slice(6, 14), dias: [3, 7, 11, 15, 19, 23, 26, 29] },
    { nome: 'vence_60', pessoas: veteranos.slice(14, 20), dias: [34, 40, 45, 50, 55, 59] },
    {
      nome: 'em_dia',
      pessoas: veteranos.slice(20, 46),
      dias: Array.from({ length: 26 }, (_, i) => 75 + i * 10),
    },
  ];
  const semAso = veteranos.slice(46);

  // Restrições espalhadas: 1 vencido, 1 a vencer em 30 dias, 3 em dia.
  const comRestricao = new Map();
  const alvosRestricao = [
    baldes[0].pessoas[1], baldes[1].pessoas[2],
    baldes[3].pessoas[3], baldes[3].pessoas[11], baldes[3].pessoas[19],
  ];
  alvosRestricao.forEach((pessoa, indice) => {
    if (pessoa) comRestricao.set(pessoa.id, RESTRICOES[indice]);
  });

  const asos = [];

  // admissional dos novatos: exame no dia da admissão, validade em 12 meses
  for (const pessoa of novatos) {
    const dataExame = pessoa.admissao;
    asos.push({
      pessoa,
      tipo: 'admissional',
      dataExame,
      validade: iso(maisMeses(new Date(`${dataExame}T00:00:00Z`), 12)),
      resultado: 'apto',
      restricoes: null,
    });
  }

  // periódicos com validade calibrada para o painel de vencimento
  for (const balde of baldes) {
    balde.pessoas.forEach((pessoa, indice) => {
      const validade = maisDias(agora, balde.dias[indice]);
      let dataExame = maisMeses(validade, -12);
      const minimo = maisDias(new Date(`${pessoa.admissao}T00:00:00Z`), 5);
      if (dataExame <= minimo) dataExame = minimo;
      if (dataExame >= validade) dataExame = maisDias(validade, -30);
      const restricao = comRestricao.get(pessoa.id) ?? null;
      asos.push({
        pessoa,
        tipo: 'periodico',
        dataExame: iso(dataExame),
        validade: iso(validade),
        resultado: restricao ? 'apto_com_restricoes' : 'apto',
        restricoes: restricao,
      });
    });
  }

  // demissionais: sem validade (não há próximo exame)
  const desligados = pessoas
    .filter((p) => p.status === 'desligado' && p.desligamento)
    .sort((a, b) => (a.desligamento < b.desligamento ? 1 : -1))
    .slice(0, 3);
  for (const pessoa of desligados) {
    asos.push({
      pessoa,
      tipo: 'demissional',
      dataExame: pessoa.desligamento,
      validade: null,
      resultado: 'apto',
      restricoes: null,
    });
  }

  // PDF do ASO no GED (sensível): os 5 com restrição + 7 em dia
  const comDocumento = new Set(
    asos
      .filter((aso) => aso.restricoes !== null)
      .map((aso) => aso.pessoa.id)
  );
  baldes[3].pessoas.slice(0, 7).forEach((pessoa) => comDocumento.add(pessoa.id));

  for (const aso of asos) {
    if (!comDocumento.has(aso.pessoa.id)) continue;
    aso.chaveDocumento = novoDocumento({
      chave: `aso:${aso.pessoa.id}:${aso.dataExame}`,
      colaboradorId: aso.pessoa.id,
      categoria: 'atestado', // categoria do GED (src/dominios/documentos/esquemas.ts)
      titulo: `${PREFIXO_DOC_ASO}${ROTULOS_TIPO_ASO[aso.tipo]} — ${aso.pessoa.nome} — ${dataBr(aso.dataExame)}`,
      nomeArquivo: `aso-${aso.pessoa.matricula}-${aso.dataExame}.pdf`,
      sensivel: true,
      enviadoEm: instanteBrasilia(new Date(`${aso.dataExame}T00:00:00Z`), 11, 20),
      linhas: [
        'ATESTADO DE SAÚDE OCUPACIONAL (ASO)',
        'Fast Distribuidora de Materiais de Construção Ltda',
        `Colaborador: ${aso.pessoa.nome} — matrícula ${aso.pessoa.matricula}`,
        `Função: ${aso.pessoa.cargo} — unidade ${aso.pessoa.unidade ?? '-'}`,
        `Tipo de exame: ${ROTULOS_TIPO_ASO[aso.tipo]}`,
        `Data do exame: ${dataBr(aso.dataExame)}`,
        `Validade: ${aso.validade ? dataBr(aso.validade) : 'não aplicável'}`,
        'Resultado e conclusão clínica: registrados no prontuário do SESMT.',
        'Documento de demonstração — dado fictício.',
      ],
    });
  }

  // ---------------------------------------------------------- catálogo de EPI
  const itensEpi = await inserirLote(
    cliente,
    'rh.epi_item',
    ['nome', 'numero_ca', 'validade_ca', 'ativo'],
    EPIS.map((epi) => [epi.nome, epi.ca, iso(maisDias(agora, epi.validadeDias)), true]),
    'id, nome'
  );
  const epiIdPorNome = new Map(itensEpi.map((linha) => [linha.nome, Number(linha.id)]));

  // ---------------------------------------------------------- entregas de EPI
  const entregas = [];
  const candidatos = ativos.filter((p) => EPI_POR_CARGO[p.cargo]);
  for (const pessoa of candidatos) {
    const indices = EPI_POR_CARGO[pessoa.cargo];
    // quem opera depósito leva mais de um item do kit
    const quantos = indices.length >= 3 && rng() < 0.4 ? 2 : 1;
    for (let i = 0; i < quantos; i += 1) {
      const epi = EPIS[indices[i % indices.length]];
      const diasAtras = inteiro(rng, 20, 330);
      let dataEntrega = maisDias(agora, -diasAtras);
      const minimo = maisDias(new Date(`${pessoa.admissao}T00:00:00Z`), 1);
      if (dataEntrega < minimo) dataEntrega = minimo;
      entregas.push({
        pessoa,
        epi,
        quantidade: epi.nome.startsWith('Luva') || epi.nome.startsWith('Máscara')
          ? inteiro(rng, 2, 6)
          : 1,
        dataEntrega: iso(dataEntrega),
      });
    }
  }

  // ciência sobre o termo no GED (12) e devoluções já registradas (3)
  const ordemCiencia = embaralhar(rng, entregas.map((_, i) => i));
  const comCiencia = new Set(ordemCiencia.slice(0, 12));
  const devolvidas = new Set(
    ordemCiencia
      .filter((i) => entregas[i].dataEntrega < iso(maisDias(agora, -150)))
      .slice(0, 3)
  );

  entregas.forEach((entrega, indice) => {
    if (comCiencia.has(indice)) {
      entrega.chaveTermo = novoDocumento({
        chave: `termo:${indice}`,
        colaboradorId: entrega.pessoa.id,
        categoria: 'outro',
        titulo:
          `${PREFIXO_DOC_TERMO}${entrega.pessoa.nome} — ` +
          `${entrega.epi.nome.split(' ').slice(0, 3).join(' ')} — ` +
          `${dataBr(entrega.dataEntrega)}`,
        nomeArquivo: `termo-epi-${entrega.pessoa.matricula}-${entrega.dataEntrega}.pdf`,
        sensivel: false,
        enviadoEm: instanteBrasilia(new Date(`${entrega.dataEntrega}T00:00:00Z`), 9, 45),
        linhas: [
          'TERMO DE ENTREGA DE EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL',
          'Fast Distribuidora de Materiais de Construção Ltda',
          `Colaborador: ${entrega.pessoa.nome} — matrícula ${entrega.pessoa.matricula}`,
          `Função: ${entrega.pessoa.cargo} — unidade ${entrega.pessoa.unidade ?? '-'}`,
          `EPI: ${entrega.epi.nome}`,
          `Certificado de Aprovação (CA): ${entrega.epi.ca}`,
          `Quantidade: ${entrega.quantidade}`,
          `Data da entrega: ${dataBr(entrega.dataEntrega)}`,
          'Declaro ter recebido o EPI acima, treinamento quanto ao uso, guarda e',
          'conservação, e me comprometo a utilizá-lo durante toda a jornada (NR-6).',
          'Documento de demonstração — dado fictício.',
        ],
      });
    }
    if (devolvidas.has(indice)) {
      const entregaEm = new Date(`${entrega.dataEntrega}T00:00:00Z`);
      const diasDesde = Math.round((agora - entregaEm) / 86_400_000);
      // nunca no futuro: a devolução fica pelo menos 10 dias antes de hoje
      const dias = Math.min(inteiro(rng, 90, 140), diasDesde - 10);
      entrega.devolvidoEm = instanteBrasilia(maisDias(entregaEm, dias), 16, 30);
    }
  });

  // ---------------------------------------------------------- grava documentos
  const idsDocumento = new Map();
  if (documentos.length > 0) {
    const gravados = await inserirLote(
      cliente,
      'rh.documento',
      [
        'colaborador_id', 'categoria', 'titulo', 'nome_arquivo', 'mime',
        'tamanho_bytes', 'conteudo', 'sensivel', 'hash_sha256',
        'enviado_por_usuario', 'enviado_em',
      ],
      documentos.map((doc) => [
        doc.colaboradorId, doc.categoria, doc.titulo, doc.nomeArquivo,
        'application/pdf', doc.conteudo.length, doc.conteudo, doc.sensivel,
        doc.hash, dp.aprovador.id, doc.enviadoEm,
      ]),
      'id, titulo'
    );
    const idPorTitulo = new Map(gravados.map((linha) => [linha.titulo, Number(linha.id)]));
    for (const doc of documentos) {
      idsDocumento.set(doc.chave, idPorTitulo.get(doc.titulo));
    }
  }

  // ---------------------------------------------------------- grava ASOs
  const gravadosAso = await inserirLote(
    cliente,
    'rh.aso',
    [
      'colaborador_id', 'tipo', 'data_exame', 'validade', 'resultado',
      'restricoes_cifradas', 'documento_id', 'registrado_por', 'criado_em',
    ],
    asos.map((aso) => [
      aso.pessoa.id,
      aso.tipo,
      aso.dataExame,
      aso.validade,
      aso.resultado,
      aso.restricoes === null ? null : cifrarSaude(aso.restricoes),
      aso.chaveDocumento ? idsDocumento.get(aso.chaveDocumento) : null,
      dp.aprovador.id,
      instanteBrasilia(new Date(`${aso.dataExame}T00:00:00Z`), 14, 5),
    ]),
    'id, colaborador_id'
  );
  // casamento por chave (nunca por posição do RETURNING): no desenho deste
  // módulo cada colaborador tem no máximo um ASO.
  const asoIdPorColaborador = new Map(
    gravadosAso.map((linha) => [Number(linha.colaborador_id), Number(linha.id)])
  );
  for (const aso of asos) {
    aso.id = asoIdPorColaborador.get(aso.pessoa.id);
    if (!aso.id) throw new Error(`ASO não retornado para ${aso.pessoa.matricula}`);
  }

  for (const aso of asos) {
    eventos.push([
      aso.pessoa.id,
      'aso_registrado',
      `${aso.dataExame}T00:00:00Z`,
      'rh.aso',
      aso.id,
      `ASO registrado (${ROTULOS_TIPO_ASO[aso.tipo]}, exame em ${dataBr(aso.dataExame)})`,
      JSON.stringify({ tipo: aso.tipo, data_exame: aso.dataExame, validade: aso.validade }),
      dp.aprovador.id,
    ]);
  }

  // ---------------------------------------------------------- NR-1 (avaliação psicossocial)
  // Fala da diretoria: "todo mundo que fizer o ASO agora já entra nessa
  // modalidade" — logo, a avaliação NASCE ACOPLADA ao ASO (aso_id), com a
  // mesma data do exame e validade de 1 ano. Só os ASOs do último ano entram:
  // é o que sustenta o indicador `psicossocial_valida` sem fingir que a
  // empresa executora já passou por todo mundo (ela foi contratada agora).
  //
  // Classificação de risco e observações são DADO DE SAÚDE: a classificação
  // fica em coluna própria (o serviço a omite de quem não tem sst.saude.ver) e
  // a observação vai CIFRADA, mesma cifra do ASO.
  const CLASSIFICACOES = ['baixo', 'baixo', 'baixo', 'moderado', 'moderado', 'alto'];
  const OBSERVACOES = {
    moderado:
      'Indicadores de sobrecarga em picos de demanda; recomendado acompanhamento semestral.',
    alto:
      'Sinais de esgotamento relatados no questionário; encaminhamento ao programa de apoio psicológico.',
    critico:
      'Encaminhamento imediato ao serviço de saúde ocupacional; reavaliação em 90 dias.',
  };
  const rngNr1 = aleatorio(SEMENTE_SST + 7);
  const limiteNr1 = iso(maisMeses(agora, -12));
  const psicossociais = asos
    .filter((aso) => aso.dataExame >= limiteNr1 && aso.pessoa.status === 'ativo')
    .map((aso) => {
      const classificacao = escolher(rngNr1, CLASSIFICACOES);
      return [
        aso.pessoa.id,
        aso.dataExame,
        iso(maisMeses(new Date(`${aso.dataExame}T00:00:00Z`), 12)),
        classificacao,
        OBSERVACOES[classificacao] ? cifrarSaude(OBSERVACOES[classificacao]) : null,
        null,
        aso.id,
        'Mentalis Saúde Ocupacional',
        dp.aprovador.id,
        instanteBrasilia(new Date(`${aso.dataExame}T00:00:00Z`), 14, 40),
      ];
    });
  await inserirLote(
    cliente,
    'rh.avaliacao_psicossocial',
    [
      'colaborador_id', 'data_avaliacao', 'validade', 'classificacao_risco',
      'observacoes_cifradas', 'documento_id', 'aso_id', 'empresa_executora',
      'registrado_por', 'criado_em',
    ],
    psicossociais
  );

  // ---------------------------------------------------------- grava entregas
  const gravadasEntregas = await inserirLote(
    cliente,
    'rh.epi_entrega',
    [
      'colaborador_id', 'epi_item_id', 'quantidade', 'data_entrega',
      'termo_documento_id', 'ciencia_registrada', 'devolvido_em', 'criado_em',
    ],
    entregas.map((entrega) => [
      entrega.pessoa.id,
      epiIdPorNome.get(entrega.epi.nome),
      entrega.quantidade,
      entrega.dataEntrega,
      entrega.chaveTermo ? idsDocumento.get(entrega.chaveTermo) : null,
      Boolean(entrega.chaveTermo),
      entrega.devolvidoEm ?? null,
      instanteBrasilia(new Date(`${entrega.dataEntrega}T00:00:00Z`), 9, 50),
    ]),
    'id, colaborador_id, epi_item_id'
  );
  // colaborador + item é único por desenho (cada pessoa recebe itens distintos)
  const entregaIdPorChave = new Map(
    gravadasEntregas.map((linha) => [
      `${linha.colaborador_id}:${linha.epi_item_id}`,
      Number(linha.id),
    ])
  );
  for (const entrega of entregas) {
    entrega.id = entregaIdPorChave.get(
      `${entrega.pessoa.id}:${epiIdPorNome.get(entrega.epi.nome)}`
    );
    if (!entrega.id) {
      throw new Error(`Entrega de EPI não retornada para ${entrega.pessoa.matricula}`);
    }
  }

  for (const entrega of entregas) {
    eventos.push([
      entrega.pessoa.id,
      'epi_entregue',
      `${entrega.dataEntrega}T00:00:00Z`,
      'rh.epi_entrega',
      entrega.id,
      `EPI entregue: ${entrega.epi.nome} (qtd ${entrega.quantidade}) em ${dataBr(entrega.dataEntrega)}`,
      JSON.stringify({
        epi_item_id: epiIdPorNome.get(entrega.epi.nome),
        quantidade: entrega.quantidade,
        data_entrega: entrega.dataEntrega,
      }),
      dp.aprovador.id,
    ]);
  }

  // ---------------------------------------------------------- ciência no GED
  const cienciasEpi = entregas.filter((entrega) => entrega.chaveTermo);
  if (cienciasEpi.length > 0) {
    const hashPorChave = new Map(documentos.map((doc) => [doc.chave, doc.hash]));
    await inserirLote(
      cliente,
      'rh.ciencia',
      ['documento_id', 'usuario_id', 'dada_em', 'hash_no_momento'],
      cienciasEpi.map((entrega) => [
        idsDocumento.get(entrega.chaveTermo),
        entrega.pessoa.usuarioId,
        instanteBrasilia(
          maisDias(new Date(`${entrega.dataEntrega}T00:00:00Z`), 1),
          10,
          15
        ),
        hashPorChave.get(entrega.chaveTermo),
      ])
    );
  }

  // ---------------------------------------------------------- CAT
  const cats = await semearCats(cliente, { ativos, dp, rng, agora, eventos });

  // ---------------------------------------------------------- linha do tempo
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    ['colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id', 'resumo', 'payload', 'registrado_por'],
    eventos
  );

  const vencidos = asos.filter((a) => a.validade && a.validade < iso(agora)).length;
  log(
    `10-folha-sst: SST — ${asos.length} ASOs (${vencidos} vencidos, ` +
    `${baldes[1].pessoas.length} vencendo em 30 dias, ` +
    `${comRestricao.size} com restrição cifrada, ${semAso.length} ativos sem ASO), ` +
    `${EPIS.length} EPIs no catálogo, ${entregas.length} entregas ` +
    `(${cienciasEpi.length} com ciência, ${devolvidas.size} devolvidas), ` +
    `${cats.total} registros de CAT (2 cadeias, 1 com correção encadeada; ` +
    `típica ${cats.vinculada_a_afastamento ? 'vinculada ao' : 'sem'} afastamento de acidente).`
  );
  log(
    `10-folha-sst: NR-1 — ${psicossociais.length} avaliações psicossociais ` +
    'acopladas ao ASO (validade de 12 meses, observações cifradas) — é a fonte ' +
    'do indicador psicossocial_valida.'
  );

  return {
    psicossociais: psicossociais.length,
    asos: asos.length,
    asos_vencidos: vencidos,
    asos_vence_30: baldes[1].pessoas.length,
    asos_vence_60: baldes[2].pessoas.length,
    asos_com_restricao: comRestricao.size,
    ativos_sem_aso: semAso.length,
    epis: EPIS.length,
    entregas: entregas.length,
    entregas_com_ciencia: cienciasEpi.length,
    entregas_devolvidas: devolvidas.size,
    documentos: documentos.length,
    cat: cats,
    eventos: eventos.length,
  };
}

async function semearCats(cliente, { ativos, dp, rng, agora, eventos }) {
  // Vínculo com afastamento de acidente de trabalho, se o módulo de
  // afastamentos já tiver semeado um — senão a CAT fica sem vínculo (o CHECK
  // permite, e o painel continua coerente).
  const { rows: afastamentos } = await cliente.query(
    `SELECT a.id, a.colaborador_id, a.inicio::text AS inicio
       FROM rh.afastamento a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
      WHERE a.tipo = 'acidente_trabalho'
      ORDER BY a.inicio DESC
      LIMIT 1`
  );
  const vinculo = afastamentos.length > 0
    ? {
        id: Number(afastamentos[0].id),
        colaboradorId: Number(afastamentos[0].colaborador_id),
        inicio: afastamentos[0].inicio,
      }
    : null;

  const operacionais = ativos.filter((p) =>
    ['Estoquista', 'Conferente', 'Motorista Entregador'].includes(p.cargo)
  );
  const acidentado = vinculo
    ? ativos.find((p) => p.id === vinculo.colaboradorId) ?? operacionais[0]
    : operacionais[inteiro(rng, 0, Math.max(0, operacionais.length - 1))];
  const motoristas = ativos.filter((p) => p.cargo === 'Motorista Entregador');
  const trajetoPessoa =
    motoristas.find((p) => p.id !== acidentado.id) ??
    ativos.find((p) => p.id !== acidentado.id);

  const dataTipico = vinculo
    ? instanteBrasilia(new Date(`${vinculo.inicio}T00:00:00Z`), 14, 20)
    : instanteBrasilia(maisDias(agora, -41), 14, 20);
  const dataTrajeto = instanteBrasilia(maisDias(agora, -118), 7, 35);

  // O desfecho descrito acompanha o vínculo real: com afastamento aberto em
  // rh.afastamento (tipo acidente_trabalho) o texto cita o afastamento; sem
  // ele, o atendimento foi ambulatorial e o colaborador seguiu na jornada.
  const desfecho = vinculo
    ? 'Encaminhado ao pronto-socorro e afastado a partir da mesma data — ' +
      'afastamento por acidente de trabalho registrado no sistema.'
    : 'Prestado atendimento no ambulatório da unidade, sem afastamento: o ' +
      'colaborador retornou à jornada no mesmo dia.';

  const registros = [];

  // 1) CAT típica — registro ORIGINAL (com a descrição incompleta de sempre)
  registros.push({
    pessoa: acidentado,
    tipo: 'tipico',
    dataAcidente: dataTipico,
    descricao:
      'Durante a separação de pedido no depósito, ao retirar chapa de drywall do ' +
      'porta-palete, a chapa deslizou e atingiu o antebraço esquerdo do colaborador, ' +
      `causando corte superficial. ${desfecho}`,
    houveAfastamento: Boolean(vinculo),
    afastamentoId: vinculo ? vinculo.id : null,
    status: 'registrada',
    anteriorIndice: null,
    registradoEm: instanteBrasilia(
      maisDias(new Date(dataTipico.slice(0, 10) + 'T00:00:00Z'), 1),
      9,
      10
    ),
    original: true,
  });

  // 2) Correção ENCADEADA da CAT típica: registro novo apontando para o
  //    anterior (append-only — o original permanece intacto na cadeia).
  registros.push({
    pessoa: acidentado,
    tipo: 'tipico',
    dataAcidente: dataTipico,
    descricao:
      'RETIFICAÇÃO do registro anterior. Durante a separação de pedido no depósito, ao ' +
      'retirar chapa de drywall de 1,20 m × 2,40 m do segundo nível do porta-palete, a ' +
      'chapa deslizou e atingiu o antebraço ESQUERDO do colaborador, causando corte ' +
      'contuso de aproximadamente 6 cm, com sutura no pronto-socorro do bairro. ' +
      'Corrigidos o lado do membro atingido e a descrição da lesão conforme o relatório ' +
      `médico recebido depois do primeiro registro. ${desfecho} ` +
      'Testemunha: conferente da unidade.',
    houveAfastamento: Boolean(vinculo),
    afastamentoId: vinculo ? vinculo.id : null,
    status: 'encaminhada',
    anteriorIndice: 0,
    registradoEm: instanteBrasilia(
      maisDias(new Date(dataTipico.slice(0, 10) + 'T00:00:00Z'), 3),
      11,
      40
    ),
    original: false,
  });

  // 3) CAT de trajeto
  registros.push({
    pessoa: trajetoPessoa,
    tipo: 'trajeto',
    dataAcidente: dataTrajeto,
    descricao:
      'No trajeto de casa para a unidade, a motocicleta do colaborador foi atingida na ' +
      'lateral por veículo que avançou a preferencial no cruzamento da Av. das Indústrias. ' +
      'Escoriações no joelho direito e torção no punho esquerdo; atendimento na UPA e ' +
      'retorno ao trabalho no dia seguinte, sem afastamento previdenciário.',
    houveAfastamento: false,
    afastamentoId: null,
    status: 'encaminhada',
    anteriorIndice: null,
    registradoEm: instanteBrasilia(
      maisDias(new Date(dataTrajeto.slice(0, 10) + 'T00:00:00Z'), 1),
      8,
      20
    ),
    original: true,
  });

  // Inserção uma a uma: a correção precisa da id do registro anterior.
  const ids = [];
  for (const registro of registros) {
    const { rows } = await cliente.query(
      `INSERT INTO rh.cat
         (colaborador_id, data_acidente, tipo, descricao, houve_afastamento,
          afastamento_id, status, cat_anterior_id, registrado_por, registrada_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        registro.pessoa.id,
        registro.dataAcidente,
        registro.tipo,
        registro.descricao,
        registro.houveAfastamento,
        registro.afastamentoId,
        registro.status,
        registro.anteriorIndice === null ? null : ids[registro.anteriorIndice],
        dp.aprovador.id,
        registro.registradoEm,
      ]
    );
    ids.push(Number(rows[0].id));
  }

  // Linha do tempo: só o registro ORIGINAL vira fato (a correção retifica o
  // mesmo fato) — é exatamente o que src/dominios/sst/servico.ts faz.
  registros.forEach((registro, indice) => {
    if (!registro.original) return;
    eventos.push([
      registro.pessoa.id,
      'cat_registrada',
      registro.dataAcidente,
      'rh.cat',
      ids[indice],
      `CAT registrada (${ROTULOS_TIPO_CAT[registro.tipo]}) — acidente em ${dataHoraBr(registro.dataAcidente)}`,
      JSON.stringify({
        tipo: registro.tipo,
        data_acidente: registro.dataAcidente,
        houve_afastamento: registro.houveAfastamento,
      }),
      dp.aprovador.id,
    ]);
  });

  return {
    total: ids.length,
    cadeias: 2,
    com_correcao: 1,
    vinculada_a_afastamento: Boolean(vinculo),
  };
}

// ------------------------------------------------------------------ conferências duras

async function conferir(cliente) {
  const checar = async (rotulo, sql, esperado) => {
    const { rows } = await cliente.query(sql);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await checar(
    'folha_colaborador com líquido incoerente',
    `SELECT count(*)::int AS total FROM rh_folha.folha_colaborador
      WHERE liquido <> total_proventos - total_descontos`,
    0
  );
  await checar(
    'folha sem memória de cálculo',
    `SELECT count(*)::int AS total FROM rh_folha.folha_colaborador f
      WHERE NOT EXISTS (SELECT 1 FROM rh_folha.item_calculo i
                         WHERE i.folha_colaborador_id = f.id)`,
    0
  );
  await checar(
    'totais divergentes da soma dos itens',
    `SELECT count(*)::int AS total FROM (
       SELECT f.id
         FROM rh_folha.folha_colaborador f
         JOIN rh_folha.item_calculo i ON i.folha_colaborador_id = f.id
         JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
         JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
        GROUP BY f.id, f.total_proventos, f.total_descontos
       HAVING coalesce(sum(i.valor) FILTER (WHERE r.natureza = 'provento'), 0)
                <> f.total_proventos
           OR coalesce(sum(i.valor) FILTER (WHERE r.natureza = 'desconto'), 0)
                <> f.total_descontos
     ) AS divergentes`,
    0
  );
  await checar(
    'competência fechada com tabela legal não conferida',
    `SELECT count(*)::int AS total
       FROM rh_folha.competencia_folha c
      WHERE c.estado = 'fechada'
        AND EXISTS (SELECT 1 FROM rh_folha.tabela_inss_versao t
                     WHERE t.status = 'ativa' AND NOT t.conferido_dp)`,
    0
  );
  await checar(
    'competência fechada sem segregação de funções',
    `SELECT count(*)::int AS total FROM rh_folha.competencia_folha
      WHERE estado = 'fechada'
        AND (calculada_por IS NULL OR aprovada_por IS NULL
             OR calculada_por = aprovada_por OR fechada_por IS NULL)`,
    0
  );
  await checar(
    'competência aberta com folha calculada (a demo precisa dela vazia)',
    `SELECT count(*)::int AS total FROM rh_folha.folha_colaborador f
      JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id
      WHERE c.estado = 'aberta'`,
    0
  );
  await checar(
    'ASO plenamente apto carregando restrição',
    `SELECT count(*)::int AS total FROM rh.aso
      WHERE resultado = 'apto' AND restricoes_cifradas IS NOT NULL`,
    0
  );
  await checar(
    'restrição de saúde em claro no banco',
    `SELECT count(*)::int AS total FROM rh.aso
      WHERE restricoes_cifradas IS NOT NULL
        AND restricoes_cifradas !~ '^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'`,
    0
  );
  await checar(
    'entrega com ciência registrada e sem termo no GED',
    `SELECT count(*)::int AS total FROM rh.epi_entrega
      WHERE ciencia_registrada AND termo_documento_id IS NULL`,
    0
  );
  await checar(
    'cadeia de CAT com mais de um sucessor',
    `SELECT count(*)::int AS total FROM (
       SELECT cat_anterior_id FROM rh.cat
        WHERE cat_anterior_id IS NOT NULL
        GROUP BY cat_anterior_id HAVING count(*) > 1
     ) AS bifurcadas`,
    0
  );
}

module.exports = { semear, calcularFolha };

if (require.main === module) {
  executarSozinho('10-folha-sst', semear);
}
