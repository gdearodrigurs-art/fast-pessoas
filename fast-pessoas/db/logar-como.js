// db/logar-como.js — fábrica de sessão de uma persona. NÃO é bypass.
//
// Substitui a dança que todo verificador reimplementou: POST em /api/identidade/entrar,
// ler o Set-Cookie, gerar o TOTP, POST no segundo fator, guardar o cookie novo. Dezenas
// de vezes, cada uma errando numa coisa diferente.
//
// ------------------------------------------------------- por que não é um bypass
//
// Ela pula a DIGITAÇÃO da senha e do TOTP. Não pula a lógica de autorização: refaz a
// mesma decisão que `autenticar()` toma — conta inativa não entra, conta sem senha não
// entra, e quem compõe chave que exige segundo fator sem ter TOTP configurado recebe uma
// sessão com `pendente_2fa`, que o proxy tranca no fluxo de configuração.
//
// O motivo é histórico e caro: os melhores achados deste projeto vieram de agentes
// entrando de verdade — gestor de outro CNPJ aprovando demanda, ficha vazando o vínculo
// que a autorização bloqueia, 2FA decidido por nome de papel, uma caixa marcada levando
// de 1 para 70 colaboradores. Com atalho ingênuo essa classe inteira de defeito fica
// invisível. E, depois da 0040, a sessão carrega estado real: um bypass que inventasse
// `pendente_2fa=false` faria passar teste que devia falhar.
//
// ------------------------------------------------------- o que ela NÃO prova
//
// Ela pula o TOTP. Então achado sobre 2FA, sobre enrolamento ou sobre bloqueio de
// entrada NÃO pode ser provado com esta ferramenta — nem para o lado positivo nem para o
// negativo. Sessão daqui nasce com o segundo fator já dado por bom; ela não passou pelo
// /api/identidade/entrar nem pela validação do código. Para esses, login de verdade, com
// o código do db/codigo-2fa.js.
// O que ela diz sobre 2FA vale como leitura do banco, não como prova de comportamento:
// "esta persona É obrigada" é a conta que o app faria, não o app tendo feito.
//
// ------------------------------------------------------- TypeScript × CommonJS
//
// O domínio é .ts e as ferramentas de db/ são CommonJS; não dá para importar .ts no node
// direto. As saídas eram três: compilar o domínio (traz o Next inteiro junto), reescrever
// a decisão de cabeça (drift silencioso), ou espelhar. Espelhei — a montagem da sessão é
// reproduzida aqui em JS lendo O MESMO banco e assinando com a MESMA biblioteca (jose).
//
// FONTE DA VERDADE, e o que precisa ser espelhado se ela mudar:
//   src/dominios/identidade/servico.ts    autenticar(): ativo + senha_hash + a conta do
//                                         segundo fator; `pendente_2fa` no payload
//   src/dominios/identidade/repositorio.ts  listarChavesDoUsuario(): o SQL das chaves,
//                                         copiado abaixo palavra por palavra
//   src/lib/sessao.ts                     criarSessao(): HS256, exp 8h, cookie fp_sessao
//   src/dominios/usuarios/esquemas.ts     CHAVES_SENSIVEIS — esta NÃO é espelhada: é lida
//                                         do próprio .ts em tempo de execução (ver
//                                         chavesSensiveis()), porque lista copiada é
//                                         lista que diverge sem ninguém perceber.
//
// ------------------------------------------------------- as três travas
//
//   1. recusa em NODE_ENV=production
//   2. recusa DATABASE_URL que não seja local — exigirLocal, sem escapatória por bandeira
//   3. vive em db/, fora de src/ — não entra no build nem no bundle
//
// Uso:
//   node --env-file=.env.local-db db/logar-como.js dp@fastdemo.local --banco fast_pessoas_dev
//   node --env-file=.env.local-db db/logar-como.js dp@fastdemo.local --banco fast_pessoas_dev --curl
//   node --env-file=.env.local-db db/logar-como.js --listar --banco fast_pessoas_dev
const fs = require('fs');
const path = require('path');
const { SignJWT } = require('jose');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  comBanco,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const RAIZ = path.join(__dirname, '..');
const FONTE_SENSIVEIS = path.join(RAIZ, 'src', 'dominios', 'usuarios', 'esquemas.ts');

// Espelho de src/lib/sessao.ts. Trocar lá sem trocar aqui produz cookie que o app recusa
// em silêncio — por isso os três estão juntos e nomeados.
const NOME_COOKIE = 'fp_sessao';
const DURACAO_SEGUNDOS = 8 * 60 * 60;
const ALGORITMO = 'HS256';

// O servidor de verificação do ponto 2 do arnês: uma vaga só, na 3001, subida por
// db/servidor.js — que lê o MESMO .env.local-db e portanto o mesmo SESSAO_SEGREDO.
const BASE_PADRAO = 'http://localhost:3001';
const ROTA_PADRAO = '/api/identidade/sessao';

const AJUDA = `
db/logar-como.js — monta a sessão de uma persona e imprime o cookie. Não é bypass.

  node --env-file=.env.local-db db/logar-como.js <email> --banco <nome> [bandeiras]
  node --env-file=.env.local-db db/logar-como.js --listar --banco <nome>

Bandeiras:
  --banco <nome>   obrigatório, sem padrão — a ferramenta nunca escolhe banco
  --listar         as personas do banco, com papel e quantas chaves cada uma compõe
  --curl           imprime a linha de curl pronta em vez do cookie cru
  --url <caminho>  a rota do --curl (padrão ${ROTA_PADRAO}); aceita URL inteira

Exemplos reais:
  node --env-file=.env.local-db db/logar-como.js dp@fastdemo.local --banco fast_pessoas_dev
  node --env-file=.env.local-db db/logar-como.js gestor@fastdemo.local --banco fast_pessoas_dev --curl
  node --env-file=.env.local-db db/logar-como.js rh@fastdemo.local --banco fast_pessoas_dev --curl --url /api/colaboradores
  node --env-file=.env.local-db db/logar-como.js --listar --banco fast_pessoas_dev

A saída padrão leva UMA linha — o cookie, ou o curl — para caber num $(...). Quem é a
pessoa, qual vínculo, qual empresa e quantas chaves ela compõe saem no erro padrão.

O cookie só vale no servidor que usa o MESMO SESSAO_SEGREDO e o MESMO banco. Aqui é o
db/servidor.js na ${BASE_PADRAO}, que lê o .env.local-db igual a você.

NÃO PROVA 2FA. A ferramenta pula o TOTP; achado sobre segundo fator, enrolamento ou
bloqueio de entrada exige login de verdade, com o código do db/codigo-2fa.js.
`;

// Copiado palavra por palavra de listarChavesDoUsuario(), em
// src/dominios/identidade/repositorio.ts. O `AND u.ativo` faz parte da regra: conta
// inativa não compõe chave nenhuma.
const SQL_CHAVES = `
  SELECT pp.chave, p.exige_2fa
    FROM sistema.usuario u
    JOIN sistema.papel_permissao pp ON pp.papel = u.papel
    JOIN sistema.permissao p ON p.chave = pp.chave
   WHERE u.id = $1 AND u.ativo`;

// A régua de "hoje" do domínio (src/dominios/estrutura/repositorio.ts): hoje é em São
// Paulo, não em UTC. Lotação vigente resolvida em UTC troca de empresa depois das 21h.
const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/**
 * A lista de chaves sensíveis, LIDA do TypeScript em tempo de execução.
 *
 * Ela entra na conta do segundo fator em OU com `permissao.exige_2fa`, e já foi
 * reauditada uma vez. Copiá-la para cá criaria duas listas com um dono só: a divergência
 * apareceria como uma persona que a ferramenta diz estar liberada e o app tranca — e o
 * defeito seria do meu lado, no arquivo em que ninguém olha.
 *
 * Se o formato do .ts mudar, isto ESTOURA em vez de devolver lista vazia. Lista vazia
 * daria uma resposta plausível e errada, que é o pior desfecho possível aqui.
 */
function chavesSensiveis() {
  const fonte = fs.readFileSync(FONTE_SENSIVEIS, 'utf8');
  const bloco = fonte.match(/const CHAVES_SENSIVEIS = new Set<string>\(\[([\s\S]*?)\]\);/);
  if (!bloco) {
    throw new Error(
      `Não achei "const CHAVES_SENSIVEIS = new Set<string>([" em ${path.relative(RAIZ, FONTE_SENSIVEIS)}.\n` +
        '  Essa lista entra na decisão de 2FA em OU com permissao.exige_2fa. Sem ela a\n' +
        '  ferramenta diria "não precisa de 2FA" para quem o app tranca — prefiro parar.\n' +
        '  Conserte o leitor em db/logar-como.js:chavesSensiveis().'
    );
  }
  // Os comentários vêm primeiro: o bloco tem frases com aspas dentro ("ver a empresa
  // inteira"), e sem tirá-las elas entrariam como se fossem chave.
  const limpo = bloco[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const chaves = [...limpo.matchAll(/"([a-z0-9_.]+)"/g)].map((m) => m[1]);
  if (!chaves.length) {
    throw new Error(`CHAVES_SENSIVEIS está vazia em ${path.relative(RAIZ, FONTE_SENSIVEIS)} — isso não é esperado.`);
  }
  return new Set(chaves);
}

function formatarData(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --------------------------------------------------------------------------- listar
async function listar(conexao) {
  const linhas = await comBanco(conexao, async (cliente) => {
    const { rows } = await cliente.query(`
      SELECT u.id, u.email, u.nome, u.papel, u.ativo,
             u.totp_secret IS NOT NULL AS tem_totp,
             count(pp.chave) AS chaves,
             count(pp.chave) FILTER (WHERE p.exige_2fa) AS chaves_2fa
        FROM sistema.usuario u
        LEFT JOIN sistema.papel_permissao pp ON pp.papel = u.papel
        LEFT JOIN sistema.permissao p ON p.chave = pp.chave
       GROUP BY u.id, u.email, u.nome, u.papel, u.ativo, u.totp_secret
       ORDER BY u.ativo DESC, count(pp.chave) DESC, u.email`);
    return rows;
  });

  if (!linhas.length) {
    throw new Error(`Nenhum usuário em ${conexao.banco}. O banco foi semeado?`);
  }
  const largura = Math.max(...linhas.map((l) => l.email.length));
  console.log('e-mail'.padEnd(largura) + '  papel        chaves  2fa  situação');
  for (const l of linhas) {
    const situacao = l.ativo
      ? l.tem_totp
        ? 'TOTP configurado'
        : ''
      : 'INATIVA — não entra';
    console.log(
      l.email.padEnd(largura) +
        '  ' +
        l.papel.padEnd(11) +
        String(l.chaves).padStart(7) +
        String(l.chaves_2fa).padStart(5) +
        '  ' +
        situacao
    );
  }
  // As contagens são por PAPEL: quem tem o mesmo papel compõe as mesmas chaves. O que
  // muda entre duas personas do mesmo papel é o escopo — a equipe, a empresa do vínculo.
  console.log(
    `\n${linhas.length} persona(s) em ${conexao.banco}. A coluna "chaves" é do papel; ` +
      'o escopo\nvem do vínculo, e é por isso que duas personas do mesmo papel enxergam coisas diferentes.'
  );
}

// ------------------------------------------------------------------------ a persona
async function carregarPersona(cliente, email) {
  const { rows } = await cliente.query(
    `SELECT id, email, nome, papel, ativo,
            senha_hash IS NOT NULL AS tem_senha,
            totp_secret IS NOT NULL AS tem_totp
       FROM sistema.usuario
      WHERE lower(email) = lower($1)`,
    [email]
  );
  if (!rows.length) {
    throw new Error(
      `Não existe "${email}" em ${cliente.database || 'no banco'}.\n` +
        '  Veja quem existe: node --env-file=… db/logar-como.js --listar --banco <nome>'
    );
  }
  return rows[0];
}

/**
 * Os vínculos da pessoa, com a empresa VIGENTE de cada um.
 *
 * São vários de propósito: contar gente e contar contrato são coisas diferentes, e
 * transferência entre CNPJs deixa a mesma pessoa com um vínculo encerrado e um aberto.
 * Quem usa esta ferramenta para caçar vazamento entre empresas precisa ver os dois — foi
 * exatamente aí que a ficha vazou o vínculo que a autorização bloqueava.
 */
async function carregarVinculos(cliente, usuarioId) {
  const { rows } = await cliente.query(
    `SELECT c.id, c.matricula, c.status, c.data_admissao::text AS admissao,
            p.id AS pessoa_id, p.nome_completo AS pessoa,
            l.empresa_id, eg.cnpj,
            COALESCE(v.nome_fantasia, v.razao_social) AS empresa
       FROM rh.colaborador c
       JOIN rh.pessoa p ON p.id = c.pessoa_id
       LEFT JOIN rh.lotacao l
              ON l.colaborador_id = c.id
             AND l.inicio_vigencia <= ${HOJE_SP}
             AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= ${HOJE_SP})
       LEFT JOIN rh.empresa_grupo eg ON eg.id = l.empresa_id
       LEFT JOIN rh.empresa_grupo_versao v
              ON v.empresa_id = eg.id AND v.status = 'ativa'
      WHERE c.usuario_id = $1
      ORDER BY c.data_admissao, c.id`,
    [usuarioId]
  );
  return rows;
}

/**
 * A conta do segundo fator, espelhando usuarioExige2fa() de identidade/servico.ts:
 * duas fontes em OU, e a rede só FECHA — flag esquecido numa chave sensível nova não
 * abre a porta, e chave marcada só no banco não depende do TypeScript para valer.
 */
function contarChaves(chaves, sensiveis) {
  const porFlag = chaves.filter((c) => c.exige_2fa).length;
  const porLista = chaves.filter((c) => sensiveis.has(c.chave)).length;
  const exige = chaves.some((c) => c.exige_2fa || sensiveis.has(c.chave));
  return { total: chaves.length, porFlag, porLista, exige };
}

async function assinar(payload) {
  const segredo = process.env.SESSAO_SEGREDO;
  if (!segredo) {
    throw new Error(
      'SESSAO_SEGREDO ausente.\n' +
        '  É a chave que assina o cookie; sem ela o app recusaria qualquer sessão.\n' +
        '  Ela vem do --env-file, o mesmo que o db/servidor.js lê:\n' +
        '    node --env-file=.env.local-db db/logar-como.js <email> --banco <nome>'
    );
  }
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITMO })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SEGUNDOS}s`)
    .sign(new TextEncoder().encode(segredo));
}

/**
 * A mesma linha de auditoria que o login de verdade grava (registrarAcao), com o diff
 * dizendo de onde ela veio. Omitir seria a ferramenta produzindo sessão que não deixa
 * rastro — e rastro é um dos eixos. O diff é o que impede a trilha de mentir: houve
 * sessão, e ela foi fabricada com o TOTP pulado.
 */
async function registrarNaTrilha(cliente, usuario) {
  await cliente.query(
    `INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
     VALUES ($1, $2, 'login_sucesso', 'sistema.usuario', $3, $4)`,
    [
      usuario.id,
      usuario.papel,
      String(usuario.id),
      JSON.stringify({ origem: 'db/logar-como.js', totp: 'pulado' }),
    ]
  );
}

// --------------------------------------------------------------------------- entrar
async function entrar(conexao, bandeiras, email) {
  const sensiveis = chavesSensiveis();

  const dados = await comBanco(conexao, async (cliente) => {
    const usuario = await carregarPersona(cliente, email);

    // As duas recusas de autenticar(). Não são zelo: são a diferença entre fábrica de
    // sessão e bypass. Conta desativada que continuasse entrando por aqui esconderia
    // justamente o defeito de desligamento que não corta o acesso.
    if (!usuario.ativo) {
      throw new Error(
        `Recusado: ${usuario.email} está INATIVA e o app não a deixaria entrar.\n` +
          '  Esta ferramenta pula a digitação da senha, não a autorização.'
      );
    }
    if (!usuario.tem_senha) {
      throw new Error(
        `Recusado: ${usuario.email} não tem senha definida — o login de verdade falharia.`
      );
    }

    const { rows: chaves } = await cliente.query(SQL_CHAVES, [usuario.id]);
    const vinculos = await carregarVinculos(cliente, usuario.id);
    await registrarNaTrilha(cliente, usuario);
    return { usuario, chaves, vinculos };
  });

  const { usuario, chaves, vinculos } = dados;
  const conta = contarChaves(chaves, sensiveis);
  // Espelho exato do fim de autenticar(): quem é obrigado e ainda não configurou o TOTP
  // recebe sessão PENDENTE, e o proxy a tranca no fluxo de configuração. Inventar
  // `false` aqui faria passar teste que devia falhar.
  const pendente = conta.exige && !usuario.tem_totp;

  const jwt = await assinar({
    usuario_id: Number(usuario.id),
    papel: usuario.papel,
    nome: usuario.nome,
    ...(pendente ? { pendente_2fa: true } : {}),
  });

  // O resumo vai para o erro padrão e a saída padrão leva uma linha só — é ela que cabe
  // num $(...). A pergunta seguinte de quem usa isto é sempre "essa persona enxerga o
  // quê?", então a resposta vem junto, sem precisar de uma segunda consulta.
  const diga = (...a) => console.error(...a);
  diga(`persona   ${usuario.nome} <${usuario.email}>`);
  diga(`usuário   #${usuario.id} · papel ${usuario.papel} · ativo · ` +
    `${usuario.tem_totp ? 'TOTP configurado' : 'sem TOTP'}`);

  if (!vinculos.length) {
    diga('vínculo   nenhum — é conta de sistema, não tem ficha nem empresa');
  } else {
    diga(`pessoa    #${vinculos[0].pessoa_id} ${vinculos[0].pessoa}`);
    for (const v of vinculos) {
      const empresa = v.empresa ? `${v.empresa} (${v.cnpj || 'sem CNPJ'})` : 'sem lotação vigente';
      diga(
        `vínculo   #${v.id} matrícula ${v.matricula} · ${v.status} desde ${v.admissao} · ${empresa}`
      );
    }
    if (vinculos.length > 1) {
      diga('          (mais de um vínculo: uma pessoa, dois contratos — confira o escopo)');
    }
  }

  diga(
    `chaves    ${conta.total} de permissão · ${conta.porFlag} com exige_2fa · ` +
      `${conta.porLista} na lista de sensíveis`
  );
  diga(
    conta.exige
      ? pendente
        ? '2FA       obrigatório e NÃO configurado -> sessão pendente_2fa: o proxy só deixa\n' +
          '          passar /configurar-2fa e /api/identidade/2fa/*. É assim no app também.'
        : '2FA       obrigatório e configurado — aqui o código foi PULADO, não validado'
      : '2FA       não exigido por nenhuma chave desta persona'
  );
  const expira = new Date(Date.now() + DURACAO_SEGUNDOS * 1000).toISOString();
  diga(`sessão    ${ALGORITMO}, vale 8h (até ${formatarData(expira)}) · ${conexao.banco}@${conexao.host}`);
  diga('trilha    audit.alteracao: login_sucesso com origem="db/logar-como.js"');
  diga('');

  const cookie = `${NOME_COOKIE}=${jwt}`;
  if (bandeiras.curl) {
    const rota = typeof bandeiras.url === 'string' ? bandeiras.url : ROTA_PADRAO;
    const alvo = /^https?:\/\//.test(rota) ? rota : `${BASE_PADRAO}${rota.startsWith('/') ? '' : '/'}${rota}`;
    console.log(`curl -s -b "${cookie}" ${alvo}`);
  } else {
    console.log(cookie);
  }
}

// ----------------------------------------------------------------------------- main
async function main() {
  const { livres, bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  // Trava 1. Antes de qualquer coisa: em produção esta ferramenta não tem uso legítimo
  // nenhum, e o custo de ela existir lá é uma sessão de qualquer pessoa sem senha.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Recusado: NODE_ENV=production.\n' +
        '  Fábrica de sessão é instrumento de verificação. Em produção ela seria uma\n' +
        '  porta dos fundos, e porta dos fundos não tem versão "só desta vez".'
    );
  }

  const conexao = resolverConexao(bandeiras);
  // Trava 2. exigirLocal, e não exigirLocalOuPermissao: aqui NÃO existe bandeira de
  // escapatória de propósito. Consultar o remoto às vezes é legítimo; fabricar sessão
  // na base de apresentação não é legítimo nunca.
  exigirLocal(
    conexao,
    'Sessão fabricada é instrumento de bancada. No remoto ela seria porta dos fundos.'
  );

  if (bandeiras.listar) {
    if (livres.length) {
      throw new Error('--listar não leva e-mail: ou lista todas, ou entra como uma.');
    }
    return listar(conexao);
  }

  const email = livres[0];
  if (!email) {
    throw new Error(
      'Falta o e-mail da persona.\n' +
        '  node --env-file=.env.local-db db/logar-como.js dp@fastdemo.local --banco fast_pessoas_dev\n' +
        '  Para ver quem existe: o mesmo comando com --listar no lugar do e-mail.'
    );
  }
  if (livres.length > 1) {
    throw new Error(
      `Um e-mail por vez. Vieram ${livres.length}: ${livres.join(', ')}\n` +
        '  Cookie de duas personas ao mesmo tempo não existe — rode duas vezes.'
    );
  }
  return entrar(conexao, bandeiras, email);
}

main().catch(morrer);
