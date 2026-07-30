// db/semear-demo.js — POVOADOR DE DEMONSTRAÇÃO do Fast Pessoas.
//
//   npm run db:demo
//
// Zera os dados de demo e repopula tudo de novo, de forma REPRODUZÍVEL: rodar
// duas vezes seguidas deixa o banco no mesmo estado (as datas acompanham o
// calendário, para a demo parecer atual em qualquer dia). Serve para resetar o
// ambiente antes de cada apresentação ao setor de RH.
//
// Como funciona: descobre db/semear/NN-*.js, roda em ordem numérica, cada
// módulo na SUA transação. Se um módulo falha, os anteriores permanecem
// (já comitados) e a execução aborta com mensagem clara — nada de banco meio
// populado sem aviso.
//
// NUNCA apaga: o usuário real (sistema.usuario id 2), o RBAC e os catálogos
// estruturais semeados pelas migrations. Ver db/semear/00-limpar.js.
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const fs = require('fs');
const path = require('path');
const { conectar, contar, log } = require('./semear/comum');

const DIR_MODULOS = path.join(__dirname, 'semear');
const ARQUIVO_CREDENCIAIS = path.join(DIR_MODULOS, 'CREDENCIAIS-DEMO.md');

// Tabelas do resumo final, na ordem em que fazem sentido para quem confere.
const TABELAS_RESUMO = [
  'sistema.usuario',
  'rh.estabelecimento',
  'rh.estabelecimento_versao',
  'rh.cargo',
  'rh.cargo_versao',
  'rh.tabela_salarial_versao',
  'rh.colaborador',
  'rh.posicao_colaborador',
  'rh.lotacao',
  'rh.relacao_gestor',
  'rh.evento_colaborador',
  'rh.ocorrencia',
  'rh.feedback_formal',
  'rh.acao_aberta',
  'rh.demanda',
  'rh.etapa_aprovacao_demanda',
  'rh.demanda_movimentacao',
  'rh.documento',
  'rh.meta_indicador_versao',
  'rh.periodo_aquisitivo',
  'rh.programacao_ferias',
  'rh.afastamento',
  'rh.beneficio',
  'rh.adesao',
  'rh.processo_admissao',
  'rh.processo_desligamento',
  'rh.ciclo_avaliacao',
  'rh.avaliacao',
  'rh.vaga',
  'rh.candidatura',
  'rh.aso',
  'rh.epi_entrega',
  'rh.cat',
  'rh_clima.checkin_resposta',
  'rh_clima.pesquisa',
  'rh_clima.pergunta_pesquisa',
  'rh_clima.resposta_pesquisa',
  'rh_clima.participacao_pesquisa',
  'rh_clima.plano_acao',
  'rh_folha.competencia_folha',
  'rh_folha.folha_colaborador',
  'sistema.notificacao',
];

function descobrirModulos() {
  return fs
    .readdirSync(DIR_MODULOS)
    .filter((arquivo) => /^\d{2}-.+\.js$/.test(arquivo))
    .sort()
    .map((arquivo) => ({
      arquivo,
      nome: arquivo.replace(/\.js$/, ''),
      caminho: path.join(DIR_MODULOS, arquivo),
    }));
}

function montarCredenciais(ctx) {
  const personas = ctx.personas ?? [];
  const linhas = [
    '# Credenciais da demonstração — Fast Pessoas',
    '',
    '> Gerado por `npm run db:demo`. **Não versionar** (está no .gitignore).',
    '> Dados 100% fictícios: a empresa "Fast", as pessoas, os CPFs e os CNPJs',
    '> não existem. Reset antes de cada apresentação: `npm run db:demo`.',
    '',
    `Senha de TODOS os usuários da demo: \`${ctx.senhaDemo}\``,
    '',
    '## Personas',
    '',
    '| Papel | E-mail | Pessoa | Cargo / unidade | O que demonstra |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const persona of personas) {
    linhas.push(
      `| ${persona.papel} | \`${persona.email}\` | ${persona.nome} (mat. ${persona.matricula}) | ${persona.cargo} — ${persona.unidade} | ${persona.descricao} |`
    );
  }

  const com2fa = personas.filter((persona) => persona.otpauth_uri);
  linhas.push(
    '',
    '## Segunda etapa (2FA)',
    '',
    'O app exige 2FA para todo papel que vê dado de pessoa além do próprio:',
    '`rh`, `recrutador`, `lider_td`, `dp`, `diretoria` e `admin`. Essas contas',
    'já vêm com o segredo TOTP configurado — não é preciso passar pelo enrolamento.',
    '',
    'Duas formas de obter o código de 6 dígitos na hora do login:',
    '',
    '1. **No terminal** (mais rápido para demonstrar):',
    '',
    '   ```',
    '   node --env-file=.env db/codigo-2fa.js dp@fastdemo.local',
    '   ```',
    '',
    '2. **No autenticador do celular** (Google Authenticator, Authy, 1Password):',
    '   leia o URI abaixo como QR Code ou cadastre a chave manualmente.',
    '   O segredo é determinístico — resetar a demo NÃO invalida o que já foi lido.',
    ''
  );
  for (const persona of com2fa) {
    linhas.push(
      `- **${persona.email}** (${persona.nome})`,
      `  - chave: \`${persona.totp_secret}\``,
      `  - URI: \`${persona.otpauth_uri}\``
    );
  }

  const porPapel = (papel) => personas.find((p) => p.papel === papel)?.email ?? '—';
  linhas.push(
    '',
    '## Roteiro sugerido',
    '',
    `1. Entre como \`${porPapel('diretoria')}\` para a visão de rede (5 unidades, indicadores, clima).`,
    '   Há uma **promoção esperando a decisão da diretoria** em Demandas → Promoções e',
    '   transferências: aprove ao vivo e mostre a posição nova, o evento na linha do tempo e',
    '   as notificações de ciência que chegam ao DP e ao T&D no mesmo instante.',
    `2. Troque para \`${porPapel('gestor')}\` e mostre que ele enxerga só a própria equipe —`,
    '   e que o pedido de promoção que ele abriu está na aba "que eu abri".',
    `3. Passe em \`${porPapel('funcionario')}\` para a experiência de quem só responde e consulta,`,
    '   e responda o **pulse de clima aberto** (nenhuma persona respondeu ainda, de propósito).',
    `4. Entre como \`${porPapel('rh')}\` e abra Pesquisas de clima → a pesquisa anual ENCERRADA:`,
    '   média por pergunta, eNPS, recorte por unidade e comentários anônimos, com os planos',
    '   de ação. Em Relatórios, mostre aniversariantes do mês e diversidade.',
    '',
    '### Segregação de acesso (papéis novos da migration 0019)',
    '',
    'É a correção do item 1 do feedback da analista de RH: hoje "todo mundo do RH vê tudo".',
    'A forma de demonstrar é entrar nas duas contas e olhar o que **não** está na tela.',
    '',
    `- \`${porPapel('recrutador')}\` (papel \`recrutador\`) — tem Recrutamento inteiro e lê o RCF do`,
    '  cargo para escrever a vaga. **Não tem** salário, folha, saúde/SST, clima individual nem',
    '  motivo de desligamento. Os cards nem aparecem na home, e as rotas devolvem 403.',
    `- \`${porPapel('lider_td')}\` (papel \`lider_td\`) — tem estrutura, avaliação, desenvolvimento,`,
    '  relatórios e ciência de promoção/transferência. **Não tem** salário, saúde, parecer de',
    '  seleção nem motivo de desligamento.',
    '',
    'A tela **Perfis de acesso** (`/perfis`), onde a composição de cada papel aparece chave por',
    'chave e toda alteração é auditada, exige `perfil.administrar` — concedida na migration 0019',
    'APENAS ao papel `admin`. Nenhuma persona da demo a tem (é a conta do dono do sistema), e o',
    'card nem aparece na home das personas: para mostrar a tela, entre com a conta `admin`.',
    '',
    '## Demais colaboradores',
    '',
    'Todos os colaboradores da demo têm login `@fastdemo.local` (padrão',
    '`primeiro.sobrenome@fastdemo.local`) e a mesma senha acima. Consulte a lista',
    'em **Colaboradores** dentro do próprio sistema.',
    ''
  );
  return linhas.join('\n');
}

async function main() {
  const inicio = Date.now();
  const modulos = descobrirModulos();
  if (modulos.length === 0) {
    console.error(`Nenhum módulo NN-*.js em ${DIR_MODULOS}.`);
    process.exit(1);
  }

  log('Fast Pessoas — povoador de demonstração');
  log(`Módulos: ${modulos.map((m) => m.nome).join(', ')}\n`);

  const cliente = await conectar();
  const contexto = {};
  let falhou = null;

  try {
    for (const modulo of modulos) {
      const { semear } = require(modulo.caminho);
      if (typeof semear !== 'function') {
        throw new Error(`${modulo.arquivo} não exporta uma função semear(cliente, ctx).`);
      }
      process.stdout.write(`── ${modulo.nome}\n`);
      try {
        await cliente.query('BEGIN');
        const resultado = await semear(cliente, contexto);
        await cliente.query('COMMIT');
        if (resultado && typeof resultado === 'object') Object.assign(contexto, resultado);
      } catch (erro) {
        try {
          await cliente.query('ROLLBACK');
        } catch {
          /* transação já encerrada */
        }
        falhou = { modulo: modulo.nome, erro };
        break;
      }
    }

    if (falhou) {
      console.error(`\nFALHOU em ${falhou.modulo}: ${falhou.erro.message}`);
      console.error(
        'Os módulos anteriores foram aplicados; este e os seguintes NÃO.\n' +
          'Corrija e rode `npm run db:demo` de novo (a limpeza é idempotente).'
      );
      if (process.env.DEBUG_SEMEADOR) console.error(falhou.erro);
      process.exitCode = 1;
      return;
    }

    // ---------------------------------------------------------- resumo
    log('\n─────────────────────────────────────────────');
    log('RESUMO — linhas por tabela');
    log('─────────────────────────────────────────────');
    // Uma consulta só: o banco é remoto, 30+ SELECT count(*) seriados custam
    // mais que a semeadura inteira.
    const { rows: totais } = await cliente.query(
      TABELAS_RESUMO.map(
        (tabela) => `SELECT '${tabela}' AS tabela, count(*)::int AS total FROM ${tabela}`
      ).join(' UNION ALL ')
    );
    const porTabela = new Map(totais.map((linha) => [linha.tabela, linha.total]));
    for (const tabela of TABELAS_RESUMO) {
      const total = porTabela.get(tabela) ?? 0;
      if (total > 0) log(`  ${tabela.padEnd(34)} ${String(total).padStart(6)}`);
    }
    const ativos = await contar(cliente, 'rh.colaborador', "status = 'ativo'");
    const desligados = await contar(cliente, 'rh.colaborador', "status = 'desligado'");
    log(`  ${'(colaboradores ativos)'.padEnd(34)} ${String(ativos).padStart(6)}`);
    log(`  ${'(colaboradores desligados)'.padEnd(34)} ${String(desligados).padStart(6)}`);

    // ---------------------------------------------------------- credenciais
    if (contexto.personas && contexto.senhaDemo) {
      fs.writeFileSync(ARQUIVO_CREDENCIAIS, montarCredenciais(contexto), 'utf8');
      log('\n─────────────────────────────────────────────');
      log('CREDENCIAIS DE DEMONSTRAÇÃO');
      log('─────────────────────────────────────────────');
      log(`  senha de todos: ${contexto.senhaDemo}\n`);
      for (const persona of contexto.personas) {
        log(`  ${persona.papel.padEnd(11)} ${persona.email.padEnd(34)} ${persona.nome}`);
      }
      log(
        '\n  2FA (papéis rh, recrutador, lider_td, dp e diretoria) já configurado.' +
          ' Código do momento:'
      );
      log('    node --env-file=.env db/codigo-2fa.js dp@fastdemo.local');
      log(`\n  Detalhes e URIs otpauth:// em ${path.relative(process.cwd(), ARQUIVO_CREDENCIAIS)}`);
    }

    log(`\nPronto em ${((Date.now() - inicio) / 1000).toFixed(1)}s.`);
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  if (process.env.DEBUG_SEMEADOR) console.error(erro);
  process.exit(1);
});
