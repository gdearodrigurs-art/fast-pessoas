# Domínios — padrão de organização

Cada domínio é uma pasta com 4 camadas fixas (nomes em pt-BR):

```
src/dominios/<dominio>/
  esquemas.ts      # validação de entrada/saída (zod) — nada entra sem passar aqui
  repositorio.ts   # SQL parametrizado (NUNCA concatenar); recebe o cliente da transação
  servico.ts       # regra de negócio; única camada que orquestra repositórios
  (rotas)          # em src/app/api/<dominio>/... — fina: valida sessão/permissão e chama o serviço
```

Regras inegociáveis (ver `docs/02-arquitetura.md`):

- A rota valida **permissão por chave** (`sistema.tem_permissao`) em TODA chamada — nunca por papel direto, nunca no front.
- Escrita sempre via `comTransacao(usuarioId, ...)` de `src/lib/banco.ts` — transação + `app.usuario_id` para RLS/auditoria.
- Toda mutação relevante grava em `audit.alteracao` (diff com rótulo resolvido); toda leitura de dado sensível grava em `audit.leitura_sensivel`.
- Dado sensível **ausente** do payload de quem não pode ver — ausência, não máscara.
- `rh.evento_colaborador` é projeção append-only: todo fato nasce numa entidade de origem.
- Datas em UTC no banco; exibição com `America/Sao_Paulo` explícito.

Domínios previstos: `identidade`, `colaboradores`, `demandas`, `clima`, `documentos`,
`ponto`, `folha`, `fiscal`, `avaliacao`, `beneficios`, `recrutamento`,
`admissao_desligamento`, `sst`, `integracoes` — na ordem do roadmap (`docs/02-arquitetura.md`).
