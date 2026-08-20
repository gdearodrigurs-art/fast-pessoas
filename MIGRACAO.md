# Migração deste projeto para outra máquina (Windows → Windows)

> Gerado em 2026-08-20, na preparação da migração notebook → PC.
> Regra de ouro: **um projeto ativo mora numa máquina só.** Depois de migrado e validado,
> o notebook vira somente leitura para este projeto.

## 1. Clone

```bash
git clone https://github.com/gdearodrigurs-art/fast-pessoas.git "C:\sistema RH"
```

- Branch principal: **`main`**.
- O trabalho corrente vive na branch **`revisao-geral`** (este arquivo está nela):
  `git checkout revisao-geral` após o clone.
- Branches encerradas (`onda-i`, `claude/clever-burnell-1dab94`) estão contidas em `main`
  e também empurradas no remoto — nada de exclusivo nelas.

## 2. Arquivos que NÃO estão no git — copiar manualmente do notebook

Copiar para o mesmo caminho relativo dentro do projeto. **Nenhum destes entra no git.**

| Arquivo (relativo à raiz do projeto) | Tamanho | O que é |
|---|---|---|
| `fast-pessoas/.env` | ~393 bytes | Conexão Supabase (apresentação/demo) + segredos do app |
| `fast-pessoas/.env.local-db` | ~502 bytes | Conexão do PostgreSQL **local** de desenvolvimento |
| `fast-pessoas/.env.example` | ~843 bytes | Modelo das chaves (sem valores) — ainda não versionado |
| `chave assistente de vendas.txt` | ~108 bytes | Chave avulsa na raiz do projeto |
| `.claude/settings.local.json` | pequeno | Permissões locais do Claude Code (opcional — regenerável re-aprovando os prompts) |

O **banco de dados local não precisa ser copiado**: os dados são 100% fictícios e o banco
é reconstruível por migrations + seed (seção 4).

## 3. Runtime e dependências

- **Node.js v24.19.0** (npm 11.17.0) — instalar a mesma major (24.x).
- Python não é usado pelo projeto.

```bash
cd "C:\sistema RH\fast-pessoas"
npm install
```

O lockfile (`package-lock.json`) está versionado — `npm install` reproduz o ambiente.

## 4. Banco de dados local (PostgreSQL)

1. Instalar PostgreSQL (o serviço local que o notebook usava).
2. Copiar `fast-pessoas/.env.local-db` (aponta para o Postgres local).
3. Recriar o banco de desenvolvimento — o jeito mais simples é a bancada, que cria,
   migra e semeia de uma vez:

```bash
node --env-file=.env.local-db db/bancada.js criar dev --banco postgres
```

   Ou, passo a passo, no banco `fast_pessoas_dev`:

```bash
node --env-file=.env.local-db db/migrar.js --banco fast_pessoas_dev
node --env-file=.env.local-db db/semear-demo.js --banco fast_pessoas_dev
```

   Credenciais segregadas de produção (`app_rh`, `app_clima`, `app_folha`) são criadas
   uma única vez por ambiente com `db/provisionar.sql` (como admin) — só se for montar
   um ambiente novo do zero, não para o dev local.

> Ferramentas de banco: ver `fast-pessoas/db/README.md`. Toda ferramenta segue
> `node --env-file=<ambiente> db/<ferramenta>.js <args> --banco <nome>` e responde a `--help`.

## 5. Validar que está funcionando (smoke test)

```bash
cd "C:\sistema RH\fast-pessoas"
npm test
```

```bash
npm run lint
```

```bash
npm run dev:local
```

- `npm test`: ~2 s, sem servidor — tem que sair verde.
- `npm run lint`: tem que sair 0.
- `npm run dev:local`: sobe o Next apontando para o banco **local**; abrir no navegador
  e fazer um login de demonstração (`db/logar-como.js --listar` mostra as personas).

## 6. Integrações externas — logins/chaves necessários no PC novo

| Integração | O que fazer no PC novo |
|---|---|
| **GitHub (`gh`)** | `gh auth login` na mesma conta (gdearodrigurs-art) |
| **Supabase** (apresentação) | Acesso via `fast-pessoas/.env` copiado; MCP global migra com `~/.claude` |
| **PostgreSQL SaveinCloud** (dedicado) | Acesso via credenciais dos `.env`; nada a instalar |
| **API Anthropic** (`@anthropic-ai/sdk`) | Chave viaja nos arquivos `.env` copiados |
| **MCPs globais** (Supabase, Vercel, Fast DW Explorer) | Migram junto com `C:\Users\<você>\.claude` e `.claude.json` |

## 7. Depois de validar

1. Abrir o projeto no app desktop do Claude e testar retomar uma sessão antiga
   (o histórico é indexado por caminho absoluto — manter `C:\sistema RH`).
2. Declarar o projeto migrado. A partir daí, **só editar no PC**.
3. Não apagar nada do notebook até todos os projetos estarem migrados e validados
   por pelo menos 2 semanas de uso real.
