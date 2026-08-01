#!/usr/bin/env node
// .claude/hooks/guarda-bash.js — as regras de ouro que valem para comando de terminal.
//
// Roda como PreToolUse do Bash. Recebe o JSON da chamada por stdin e devolve, por stdout,
// {"hookSpecificOutput":{"permissionDecision":"deny", ...}} quando a chamada é barrada.
//
// POR QUE ISTO EXISTE, e não é prosa no prompt: três instruções claras foram violadas neste
// projeto. "NÃO use git reset" — um agente rodou git reset. "Confira o número da migration
// antes" — três colisões. "Não deixe lixo" — lixo em quatro commits. Contenção não se
// escreve, se constrói.
//
// E VALE PARA OS SUBAGENTES. A documentação do Claude Code é explícita: quando um subagente
// chama uma ferramenta, PreToolUse dispara os mesmos hooks, e a entrada carrega agent_id e
// agent_type. Uma regra escrita uma vez governa os 195.
//
// ------------------------------------------------------------------ o limite deste arquivo
// Tudo aqui é trava POR GRAFIA: casa contra o texto do comando. Alias novo, script novo no
// package.json ou caminho diferente passam por cima. Isso é DISSUASÃO, não garantia, e está
// declarado assim na tabela do ponto 7 do arnês de propósito — quem depender disto como
// garantia vai se enganar.
//
// A trava de verdade, para o que os nossos próprios scripts fazem, mora DENTRO deles: hook
// não enxerga fs.writeFileSync de um subprocesso node. Hook guarda o que o agente faz direto;
// script guarda o que script faz.

const { execFileSync } = require('child_process');
const path = require('path');

const SENTINELA = 'ARNES_FECHAMENTO=1';
const RAIZ = path.resolve(__dirname, '..', '..');

/** Arquivo já versionado = já foi escrito e commitado uma vez. */
function estaNoGit(caminho) {
  // O comando pode citar o caminho relativo à raiz ou a fast-pessoas/. Tenta as duas leituras.
  for (const base of [RAIZ, path.join(RAIZ, 'fast-pessoas')]) {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', caminho], { cwd: base, stdio: 'ignore' });
      return true;
    } catch {
      /* tenta a próxima base */
    }
  }
  return false;
}

// Cada regra: nome, quando casa, e o que dizer. A explicação importa tanto quanto a barreira —
// o agente barrado precisa saber o que fazer em vez de tentar de novo com outra grafia.
const REGRAS = [
  {
    nome: 'historico do git',
    casa: (c) =>
      /\bgit\s+reset\s+(--hard|--merge|--keep)\b/.test(c) ||
      // Duas condições separadas de propósito: juntar tudo num regex só fazia `git push -f`
      // escapar, porque o \s+ depois de "push" já tinha comido o espaço que o \s-f procurava.
      // Achado pelo teste em .claude/hooks/testar.js — que é exatamente para isso que ele serve.
      (/\bgit\s+push\b/.test(c) && /(--force\b|--force-with-lease\b|\s-f(\s|$))/.test(c)) ||
      /\bgit\s+clean\s+[^|;&]*-[a-z]*[fd]/.test(c) ||
      /\bgit\s+(rebase|filter-branch|filter-repo)\b/.test(c) ||
      /\bgit\s+reflog\s+(delete|expire)\b/.test(c) ||
      /\bgit\s+branch\s+-D\b/.test(c),
    porque:
      'Reescrever histórico apaga trabalho que ninguém consegue recuperar depois. ' +
      'Um agente já rodou `git reset` neste projeto apesar de o prompt dizer NÃO use.',
    faca: 'Para desfazer algo, faça um commit novo que reverta. Se for mesmo necessário, peça ao dono.',
  },
  {
    nome: 'apagar prova',
    casa: (c) =>
      /\brm\b[^|;&]*\b(provas|docs\/snapshots|docs\/achados)\b/.test(c) ||
      /\bRemove-Item\b[^|;&]*\b(provas|snapshots|achados)\b/i.test(c) ||
      /\bgit\s+rm\b[^|;&]*\b(provas|docs\/snapshots)\b/.test(c),
    porque:
      'Prova que some não é prova. A prova ponta a ponta da onda I (91/91 telas, 45/45 chamadas) ' +
      'morava numa pasta temporária e foi apagada numa limpeza — por um dia a única evidência ' +
      'foi uma frase dentro de uma mensagem de commit, que não se re-roda.',
    faca: 'Se o arquivo é lixo mesmo, diga qual e por quê no relatório, e deixe a decisão subir.',
  },
  {
    nome: 'migration ja versionada',
    // Barra só o que JÁ ESTÁ NO GIT. Migration recém-criada pelo `migracoes.js nova` é
    // untracked, e apagá-la é trabalho legítimo — errar o nome acontece.
    //
    // A primeira versão barrava qualquer rm sobre db/migrations, e na primeira hora de uso um
    // agente ficou preso: criou 0054 e 0055 testando o `nova`, não conseguiu apagar, e teve de
    // contornar por PowerShell. Ele escreveu isso no relatório em vez de deixar passar — e
    // ainda apontou a consequência que eu não tinha visto: lixo em db/migrations/ é exatamente
    // o que quebra a alocação do próximo número, ou seja, a regra criava o problema que a
    // ferramenta vizinha existe para resolver.
    casa: (c) => {
      if (!/\b(rm|Remove-Item|del|git\s+rm)\b/i.test(c)) return false;
      const alvos = c.match(/[\w./\\-]*db[\/\\]migrations[\/\\][\w.-]+\.sql/gi);
      if (!alvos) {
        // Apagar a PASTA inteira, ou com curinga, sempre barra: não dá para conferir um a um.
        return /db[\/\\]migrations(\s|$|[\/\\](\*|$))/i.test(c);
      }
      return alvos.some((a) => estaNoGit(a));
    },
    porque:
      'Migration versionada é imutável por desenho: o db/migrar.js guarda o SHA-256 de cada uma e ' +
      'trava o runner inteiro se o conteúdo mudar. Apagar o arquivo quebra isso para todo mundo, ' +
      'não só para você.',
    faca:
      'Mudança de schema é migration NOVA: node db/migracoes.js nova <nome>. ' +
      'Migration que você acabou de criar e ainda não commitou pode ser apagada normalmente.',
  },
  {
    nome: 'escrita no Supabase',
    casa: (c) =>
      // Caminho explícito: --env-file=.env (o do Supabase) somado a um script que escreve.
      (/--env-file[= ]\.env(?![.\w-])/.test(c) &&
        /(db[\/\\]migrar\.js|db[\/\\]semear|db[\/\\]seed-admin\.js|db[\/\\]bancada\.js)/.test(c)) ||
      // Os atalhos do package.json, que ESCONDEM o --env-file=.env dentro deles. Foram achados
      // pelo teste do próprio hook: eu tinha marcado `npm run db:migrar` como caso que passa, e
      // ele é exatamente `node --env-file=.env db/migrar.js`. É a fraqueza "grafia" ao vivo —
      // atalho versionado passando por cima da regra. Toda vez que nascer um script novo que
      // escreva, ele precisa entrar aqui, e é por isso que esta linha é dissuasão e não garantia.
      /npm\s+run\s+db:(migrar|demo)\b/.test(c),
    porque:
      'O .env aponta para o Supabase, que é base de APRESENTAÇÃO — o dono abre aquilo na frente da ' +
      'diretoria. Agente não escreve nele; o banco de trabalho é o local. (LGPD: só dado fictício, ' +
      'e a base de demonstração tem que ficar sempre limpa.)',
    faca:
      'Use --env-file=.env.local-db e a bancada da sua frente. ' +
      'Só o ato de fechamento escreve no Supabase, declarando ' +
      SENTINELA +
      ' no início do comando.',
  },
  {
    nome: 'retrato do mapa ou do snapshot',
    casa: (c) =>
      /db[\/\\]mapa\.js[^|;&]*\bretrato\b/.test(c) ||
      /npm\s+run\s+mapa:retrato\b/.test(c) ||
      /db[\/\\]snapshot\.js[^|;&]*\btirar\b/.test(c),
    porque:
      'Quem retrata apaga o próprio gatilho. O retrato é a linha de base contra a qual a mudança ' +
      'desta onda seria detectada — regravá-la antes de alguém julgar é auto-absolvição. A ordem ' +
      'é rígida: conferir → julgar → retratar.',
    faca:
      'Rode `node db/mapa.js` (sem "retrato") para conferir. O retrato é o último passo do ' +
      'fechamento da onda, e só ele declara ' +
      SENTINELA +
      '.',
  },
  {
    nome: 'desligar o portao',
    casa: (c) => /--sem-portao\b/.test(c),
    porque:
      'A bandeira faz o mapa sair 0 mesmo com arquivo novo em eixo tocado — ou seja, desliga ' +
      'exatamente o alarme que decide se a camada adversarial roda.',
    faca: 'Se o portão está vermelho por causa alheia, escale o bloqueio em vez de silenciá-lo.',
  },
];

function decidir(comando) {
  // A sentinela é declaração de intenção na própria linha de comando. Não é segredo: quem
  // contorna escolheu contornar, em vez de tropeçar sem perceber.
  if (comando.includes(SENTINELA)) return null;

  for (const r of REGRAS) {
    if (r.casa(comando)) return r;
  }
  return null;
}

let entrada = '';
process.stdin.on('data', (d) => (entrada += d));
process.stdin.on('end', () => {
  let dados;
  try {
    dados = JSON.parse(entrada || '{}');
  } catch {
    // Hook que quebra não pode travar o trabalho: na dúvida, deixa passar e fica quieto.
    process.exit(0);
  }

  const comando = String(dados?.tool_input?.command || '');
  if (!comando) process.exit(0);

  const regra = decidir(comando);
  if (!regra) process.exit(0);

  const quem = dados.agent_type ? ` (agente ${dados.agent_type})` : '';
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Regra de ouro do arnês — ${regra.nome}${quem}.\n\n` +
          `POR QUÊ: ${regra.porque}\n\n` +
          `EM VEZ DISSO: ${regra.faca}`,
      },
    })
  );
  process.exit(0);
});
