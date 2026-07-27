# Fast Pessoas

Sistema próprio de DP/RH da Fast. Next.js + TypeScript + Node.js, PostgreSQL dedicado (SaveinCloud).
Arquitetura, módulos e roadmap: [`../docs/`](../docs/README.md) · decisões: [`../00_contexto/decisoes_arquiteturais.md`](../00_contexto/decisoes_arquiteturais.md).

## Rodar em desenvolvimento

```bash
npm install
copy .env.example .env   # e preencher DATABASE_URL
npm run db:migrar        # aplica db/migrations/*.sql
npm run dev
```

Requer um PostgreSQL acessível (local ou o dedicado da SaveinCloud). As credenciais
segregadas de produção (`app_rh`, `app_clima`, `app_folha`) são criadas uma única vez
por ambiente com `db/provisionar.sql` (como admin — senhas do secret manager).

## Estrutura

```
db/migrations/    # SQL numerado e imutável — alteração = migration nova (expand/contract)
db/provisionar.sql# credenciais/GRANTs por ambiente (não é migration)
src/lib/banco.ts  # pool + comTransacao (SET LOCAL app.usuario_id — base de RLS e auditoria)
src/dominios/     # um domínio por pasta, 4 camadas — ver src/dominios/LEIA-ME.md
src/app/          # rotas (App Router); API fina que valida permissão e chama o serviço
```

## Princípios inegociáveis

1. Permissão por chave validada no backend em toda chamada; dado sensível **ausente** do payload de quem não pode ver.
2. Escrita transacional; `audit` e `evento_colaborador` são append-only (GRANT + trigger).
3. Regra parametrizável é versionada com vigência — fechado não reabre.
4. Nenhum cálculo legal fora do domínio `folha/`; nenhuma transmissão fora do `fiscal/`.
5. Telas nascem como protótipo validado com DP/RH antes do código (`../prototipos/`).
