import { z } from "zod";
import { PAPEIS, Papel } from "../identidade/esquemas";

export const ROTULOS_PAPEL: Record<Papel, string> = {
  funcionario: "Funcionário",
  gestor: "Gestor",
  rh: "RH (generalista de DP)",
  recrutador: "Recrutador (R&S)",
  lider_td: "Líder de T&D",
  dp: "Departamento Pessoal",
  diretoria: "Diretoria de Pessoas",
  admin: "Administrador",
};

/**
 * O rótulo do papel para a TELA — nunca indexe `ROTULOS_PAPEL` direto.
 *
 * O mapa acima cobre os oito papéis que nascem com o sistema, e o dono decidiu
 * que operadores podem criar perfis novos. Perfil criado pela tela não está
 * aqui, e indexar direto devolve `undefined` — que já era o que aparecia ao
 * lado do nome da pessoa no cabeçalho da home. Sem rótulo, mostra a chave crua:
 * feia, mas verdadeira.
 */
export function rotuloPapel(papel: string): string {
  return (ROTULOS_PAPEL as Record<string, string>)[papel] ?? papel;
}

/**
 * Uma linha dizendo o que o papel faz — exibida no seletor de /usuarios e no
 * cabeçalho de cada perfil em /perfis. É rótulo de INTERFACE, não regra: a
 * regra é a composição papel → chave em sistema.papel_permissao, editável em
 * /perfis. Se o administrador recompor um perfil, esta frase pode envelhecer —
 * por isso a tela /perfis sempre mostra as chaves reais ao lado dela.
 */
export const DESCRICOES_PAPEL: Record<Papel, string> = {
  funcionario:
    "Self-service: as próprias férias, benefícios, documentos, demandas e check-in de clima.",
  gestor:
    "Tudo do funcionário mais a equipe: liderados, aprovações, feedback, avaliações e requisição de vaga da própria área.",
  rh: "RH generalista de DP: ficha, férias, ocorrências, entrevista de desligamento, clima e metas. Sem recrutamento (virou papel próprio) e sem salário.",
  recrutador:
    "Só Recrutamento & Seleção: requisições, vagas, candidatos, pareceres e ofertas. Sem ficha, sem desligamento, sem afastamento e sem salário.",
  lider_td:
    "Treinamento & Desenvolvimento / Business Partner: headcount, cargos, estrutura e resultado de avaliação para sucessão e ROI. Sem salário individual, sem conteúdo clínico e sem motivo de desligamento.",
  dp: "Departamento Pessoal completo: dado sensível, admissão, desligamento, afastamento, benefícios, SST e folha.",
  diretoria:
    "Diretoria de Pessoas: leitura ampla, decisão de avaliação e de requisição, motivo de desligamento e clima individual.",
  admin:
    "Administração do sistema: usuários, perfis de acesso e trilhas de auditoria — não é acesso a dado de pessoas.",
};

export const esquemaCriacaoUsuario = z.object({
  email: z.email("E-mail inválido").max(254),
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  papel: z.enum(PAPEIS),
});

export type CriacaoUsuario = z.infer<typeof esquemaCriacaoUsuario>;

export const esquemaAtualizacaoUsuario = z
  .object({
    ativo: z.boolean().optional(),
    papel: z.enum(PAPEIS).optional(),
  })
  .refine((dados) => dados.ativo !== undefined || dados.papel !== undefined, {
    message: "Informe ao menos um campo para atualizar",
  });

export type AtualizacaoUsuario = z.infer<typeof esquemaAtualizacaoUsuario>;

// ---------------------------------------------------------------------------
// Perfis de acesso (composição papel × chave) — tela /perfis
// ---------------------------------------------------------------------------

export const esquemaPapel = z.enum(PAPEIS);

/**
 * A tela envia o ESTADO FINAL do perfil (todas as chaves marcadas), não um
 * delta: assim o diff auditado é calculado no servidor contra o que está
 * gravado, e o resultado de duas abas abertas ao mesmo tempo é sempre o que
 * está na tela de quem salvou por último — nunca uma soma silenciosa.
 */
export const esquemaComposicaoPerfil = z.object({
  chaves: z.array(z.string().min(1).max(120)).max(500),
});

export type ComposicaoPerfil = z.infer<typeof esquemaComposicaoPerfil>;

/**
 * Chaves que o papel `admin` NUNCA pode perder. Sem elas o sistema se tranca:
 * ninguém mais administra usuários nem recompõe perfis, e a única saída seria
 * SQL direto no banco.
 */
export const CHAVES_INDISPENSAVEIS_ADMIN: readonly string[] = [
  "usuario.administrar",
  "perfil.administrar",
];

/**
 * Agrupamento por domínio, para a tela não ser uma lista de 60+ chaves soltas.
 * Percorrida em ordem — o prefixo mais específico vem primeiro. Chave criada
 * por migration futura cai em "Outros" até ser mapeada aqui: aparece na tela
 * de qualquer jeito, nunca fica escondida.
 */
const GRUPOS_POR_PREFIXO: ReadonlyArray<readonly [string, string]> = [
  ["rh.cargo.", "Cargos e estrutura"],
  ["rh.estabelecimento.", "Cargos e estrutura"],
  ["rh.posicao.", "Cargos e estrutura"],
  ["rh.colaborador.", "Pessoas e ficha"],
  ["rh.evento.", "Pessoas e ficha"],
  ["rh.ocorrencia.", "Pessoas e ficha"],
  ["rh.feedback.", "Pessoas e ficha"],
  ["rh.gestor.", "Pessoas e ficha"],
  // Disciplinar (0080/0084) caía em "Outros" — as quatro chaves são leitura e
  // escrita sobre a ficha da pessoa, e é ali que o administrador as procura.
  ["rh.disciplinar.", "Pessoas e ficha"],
  ["rh.auditar", "Administração do sistema"],
  ["usuario.", "Administração do sistema"],
  ["perfil.", "Administração do sistema"],
  ["privacidade.", "Administração do sistema"],
  ["demanda.", "Demandas"],
  // Estes três chegaram por migration (0021, 0026 e 0027) e ficaram sem mapa:
  // as dez chaves de ponto, promoção/transferência e painel executivo caíam
  // todas em "Outros", no fim da tela. Apareciam — o fallback funciona —, mas
  // num balaio sem nome, que é o pior lugar para o administrador encontrar
  // "quem pode ver o espelho de ponto da empresa inteira".
  ["ponto.", "Ponto e banco de horas"],
  ["movimentacao.", "Promoção e transferência"],
  ["painel.", "Metas e indicadores"],
  ["clima.", "Clima"],
  ["pesquisa.", "Clima"],
  ["indicador.", "Metas e indicadores"],
  ["relatorio.", "Metas e indicadores"],
  ["documento.", "Documentos"],
  ["ferias.", "Férias"],
  ["afastamento.", "Afastamentos"],
  ["desligamento.", "Desligamento"],
  ["entrevista.", "Desligamento"],
  ["beneficio.", "Benefícios"],
  ["adesao.", "Benefícios"],
  ["admissao.", "Admissão"],
  ["avaliacao.", "Avaliação de desempenho"],
  ["rs.", "Recrutamento e seleção"],
  ["folha.", "Folha de pagamento"],
  ["sst.", "Saúde e segurança"],
];

/** Ordem de exibição dos grupos; grupo não listado vai ao fim, em A→Z. */
export const ORDEM_GRUPOS: readonly string[] = [
  "Pessoas e ficha",
  "Cargos e estrutura",
  "Promoção e transferência",
  "Demandas",
  "Férias",
  "Afastamentos",
  "Admissão",
  "Desligamento",
  "Benefícios",
  "Ponto e banco de horas",
  "Folha de pagamento",
  "Saúde e segurança",
  "Recrutamento e seleção",
  "Avaliação de desempenho",
  "Clima",
  "Metas e indicadores",
  "Documentos",
  "Administração do sistema",
];

export function grupoDaChave(chave: string): string {
  for (const [prefixo, grupo] of GRUPOS_POR_PREFIXO) {
    if (chave.startsWith(prefixo)) return grupo;
  }
  return "Outros";
}

/**
 * Chaves que o administrador precisa ver com PESO na tela /perfis: a caixa de
 * cada uma recebe o selo de sensível.
 *
 * Duas portas de entrada nesta lista, e basta uma:
 *   (a) autoriza leitura de dado pessoal identificável — remuneração, saúde,
 *       sigilo, contato de titular externo, categoria especial (gênero
 *       autodeclarado, dependente). Na prática: a leitura grava
 *       audit.leitura_sensivel com esta chave em `chave_permissao`;
 *   (b) dá alcance de EMPRESA INTEIRA sobre dado de pessoa. Linha a linha pode
 *       não ser sensível; o volume é. Ver a ficha de UMA pessoa e ver a de 70 de
 *       uma vez são concessões de peso diferente, e a tela tem que dizer isso.
 *
 * Alcance de EQUIPE fica de fora de propósito — é a fronteira que a migration
 * 0039 desenhou (`rh.colaborador.ver` sozinha alcança si e liderados; o alcance
 * amplo tem chave própria).
 *
 * LEITURA DA PORTA (b), fixada aqui porque a redação larga ("alcance de empresa
 * inteira sobre dado de pessoa") já foi lida de dois jeitos: (b) vale quando o
 * alcance amplo é sobre o MESMO tipo de dado que seria sensível pessoa a pessoa
 * — ficha, documento, ponto, afastamento, saúde, remuneração. Não vale para
 * fato trabalhista comum visto em lote (quem tem demanda aberta, quem está em
 * processo de admissão, quem programou férias): senão metade do catálogo entra
 * e o selo deixa de significar coisa alguma justamente por estar em tudo.
 *
 * COMO ESTA LISTA FOI CONFERIDA (refeita do zero em 2026-07-31, porque a
 * conferência anterior — "das 17 chaves, exatamente 3 faltavam, nenhuma outra"
 * — não era exaustiva: ela não enumerou os PONTOS DE TRILHA, enumerou as chaves
 * que já estavam na lista). O método reproduzível é:
 *   1. `grep -rn "chavePermissao:" src/ --include=*.ts` devolve TODOS os pontos
 *      que gravam audit.leitura_sensivel; resolver as constantes (CHAVE_*) e as
 *      chaves dinâmicas (ponto/servico.ts:2015 recebe a chave por parâmetro);
 *      toda chave que aparecer ali é porta (a) até prova em contrário.
 *   2. Ler as 81 linhas de `sistema.permissao` e, para cada uma que prometa
 *      alcance amplo, abrir o payload que a rota devolve — a descrição da chave
 *      não basta: `sst.ver` diz "sem conteúdo clínico" e devolve CAT com o
 *      rótulo "Doença ocupacional" e descrição livre do acidente.
 *   3. Antes de acrescentar qualquer chave, medir quantas contas passam a
 *      exigir 2FA (a rede é de mão única: só fecha).
 *
 * Resultado da conferência de 2026-07-31: DUAS chaves faltavam (`sst.ver` e
 * `folha.operar`, ambas abaixo), UMA foi avaliada e recusada com a conta feita
 * (`ponto.ver.equipe`, na nota do fim), e nenhuma outra das 81 passa nas
 * portas. As candidatas de alcance amplo sobre fato trabalhista comum —
 * `desligamento.ver`, `demanda.ver.todas`, `admissao.ver`, `ferias.administrar`
 * — ficam fora pela leitura de (b) acima: o que nelas é sensível de verdade
 * (motivo do desligamento, respostas de entrevista, salário proposto) já tem
 * chave própria, e essas chaves já estão nesta lista.
 *
 * CUIDADO AO MEXER — isto não é só cosmético desde a migration 0040:
 * src/dominios/identidade/servico.ts soma `chaveSensivel()` em OU com
 * `sistema.permissao.exige_2fa` para decidir quem precisa de segundo fator.
 * Acrescentar chave aqui PASSA A EXIGIR 2FA de todo papel que a tenha. A rede é
 * de mão única (só fecha), mas a conta de quem ela fecha é real: antes de
 * incluir, rode o SELECT que lista os papéis que ganham a exigência.
 */
const CHAVES_SENSIVEIS = new Set<string>([
  "rh.colaborador.sensivel.ver",
  "rh.posicao.ver",
  "rh.posicao.editar",
  "rh.ocorrencia.restrita.ver",
  "afastamento.saude.ver",
  "sst.saude.ver",
  "desligamento.motivo.ver",
  "entrevista.respostas.ver",
  "clima.resposta.individual.ver",
  "documento.sensivel.ver",
  "rs.parecer.ver",
  "avaliacao.resultado.ver",
  "folha.ver",
  "folha.aprovar",
  // ---------------------------------------------------------------- (b) alcance amplo
  // A ficha de todo o quadro de uma vez (0039). É a caixa que MAIS precisa do
  // selo e era justamente a que não o tinha: a tela oferecia "ver a empresa
  // inteira" com o mesmo peso visual de uma chave qualquer.
  "rh.colaborador.ver.todos",
  // O GED inteiro (0024): atestado, contrato, holerite de qualquer pessoa.
  "documento.ver.todos",
  // Reescreve a ficha cadastral de qualquer pessoa — para editar, abre.
  "rh.colaborador.editar",
  // Espelho de ponto de qualquer pessoa (0027). O serviço de ponto já trata
  // essa leitura como sensível ("revela rotina, atrasos e saúde") e grava a
  // trilha com esta chave; só o selo faltava.
  "ponto.administrar",
  // ---------------------------------------------------------------- (a) já geram trilha
  // Diversidade, performance e custo de pessoal (0026) — o serviço grava
  // audit.leitura_sensivel em três pontos, inclusive sobre gênero autodeclarado.
  "painel.executivo.ver",
  // Diversidade (gênero autodeclarado) e composição familiar (dependentes):
  // agregados, e ainda assim com trilha de leitura por decisão do domínio.
  "relatorio.ver",
  // Valor da oferta (é salário) e contato do candidato — titular externo, LGPD.
  // As duas chaves abrem o mesmo payload no kanban da vaga, e a trilha registra
  // ora uma ora outra conforme a que autorizou.
  "rs.gerir",
  "rs.ver",
  // DEPENDENTE é dado de TERCEIRO — nome, nascimento, parentesco, CPF de quem
  // nunca assinou nada com a empresa, e composição familiar por inferência.
  // beneficios/servico.ts:1044 já gravava audit.leitura_sensivel com uma destas
  // duas (conforme a que autorizou) ao ler dependente de quem não é o titular
  // da sessão. Chave que gera trilha de leitura sensível e não aparecia como
  // sensível era o sistema discordando de si mesmo. Só `dp` e `rh` as têm, e
  // ambos já exigiam 2FA: nenhum login muda.
  "adesao.gerir",
  "beneficio.ver",
  // "Ver afastamentos de TODOS os colaboradores" — porta (b). O detalhe clínico
  // fica com afastamento.saude.ver, e sem ela até o TIPO vira rótulo genérico
  // (afastamentos/esquemas.ts:29); o que sobra ainda é quem está afastado, desde
  // quando e por quanto tempo, da empresa inteira. 90 dias de afastamento não
  // precisam de CID para dizer o que dizem.
  "afastamento.ver",
  // ---------------------------------------------------------- achadas na reauditoria de 2026-07-31
  // GÊMEA ESTRUTURAL DE afastamento.ver, e estava de fora. A descrição da chave
  // no banco diz "sem conteúdo clínico", e é verdade que o detalhe cifrado do
  // ASO fica com sst.saude.ver (na lista) — mas o que `sst.ver` devolve, da
  // empresa inteira e com nome e matrícula, é:
  //   GET /api/sst/cats          → CatVisao: tipo "Doença ocupacional" /
  //     "Acidente típico" / "de trajeto", data, houve_afastamento e a DESCRIÇÃO
  //     LIVRE do acidente (até 4.000 caracteres, sst/esquemas.ts:264);
  //   GET /api/sst/psicossociais → PsicossocialCompleta: classificação de risco
  //     psicossocial por pessoa (só as observações exigem sst.saude.ver).
  // Acidente de trabalho e risco psicossocial nominais são saúde por qualquer
  // leitura, e é o mesmo raciocínio que colocou afastamento.ver aqui. Deixar a
  // gêmea fora era o sistema aplicar dois critérios ao mesmo tipo de dado.
  // Medido antes: só `dp` e `rh` a possuem, ambos já exigiam 2FA — 0 contas
  // mudam de fluxo de entrada.
  "sst.ver",
  // REMUNERAÇÃO DE PESSOA IDENTIFICADA, pela porta de escrita. `folha.ver` e
  // `folha.aprovar` já estavam; `folha.operar` faltava, e o que ela devolve
  // (repositorio.ts:273, VariavelResumo) é colaborador_nome + matricula +
  // valor_centavos de toda a competência. É o mesmo precedente de
  // rh.posicao.editar e rh.colaborador.editar, que estão aqui porque para
  // escrever é preciso abrir. Medido antes: só `dp` a possui, já exigia 2FA —
  // 0 contas mudam de fluxo de entrada.
  "folha.operar",
  // NÃO ENTRA: `movimentacao.solicitar`. Ela aparece como chave_permissao em dois
  // pontos de trilha (demandas/servico.ts:410 e :880) e mesmo assim falha nas
  // duas portas. Em :410 quem autoriza é a AUTORIA (`souSolicitante`, :398), não
  // a chave — é o solicitante relendo o salário que ele mesmo digitou; a chave
  // ali é o rótulo da trilha. Em :880 o dado é a faixa salarial do CARGO, banda
  // de tabela, não remuneração de pessoa identificável (essa já tem
  // rh.posicao.ver/editar, ambas na lista). E o alcance é de EQUIPE — liderados
  // vigentes —, a fronteira que esta lista deixa de fora de propósito.
  // Consequência medida antes de decidir: é a única candidata que vive também no
  // papel `gestor` (6 contas, nenhuma com totp_secret). Incluí-la mandaria as
  // seis para o enrolamento de 2FA. Se o dono quiser isso, o caminho é
  // `sistema.permissao.exige_2fa` na chave — a 0040 separou "exige 2FA" de
  // "sensível" justamente para elevar proteção sem mentir sobre o que a chave
  // abre. Ver a migration 0044 para a conta completa.
  //
  // NÃO ENTRA, e esta é a omissão que a reauditoria de 2026-07-31 corrigiu no
  // REGISTRO: `ponto.ver.equipe`. Ela é chave_permissao literal em
  // audit.leitura_sensivel (ponto/servico.ts:2015, via ChaveAlcancePonto), e o
  // próprio módulo descreve o que ela abre como "revela rotina, atrasos e
  // saúde" (:1927). Pela letra da porta (a) ela entraria — e nunca tinha sido
  // sequer citada aqui, nem para entrar nem para ficar fora. Fica fora pela
  // MESMA razão de movimentacao.solicitar: o alcance é de EQUIPE (liderados
  // vigentes), a fronteira que esta lista deixa de fora de propósito, enquanto
  // a irmã de alcance amplo, `ponto.administrar`, já está na lista.
  // Consequência medida antes de decidir, com a decisão real de
  // usuarioExige2fa aplicada conta a conta: incluí-la levaria 6 contas do papel
  // `gestor`, NENHUMA com totp_secret, para o enrolamento de 2FA —
  // cristiane.carvalho, igor.guimaraes, leticia.falcao, marcio.macedo,
  // rosana.gomes e a persona gestor@fastdemo.local, que a documentação da demo
  // descreve como "só senha". Se o dono quiser gestor com segundo fator, o
  // caminho continua sendo `sistema.permissao.exige_2fa` na chave.
  //
  // NÃO ENTRAM, por DECISÃO EXPLÍCITA do dono (A1:a e A3:a, docs/20, migration
  // 0084): `rh.posicao.ver.equipe` e `rh.disciplinar.ver.equipe`. As duas
  // gravam audit.leitura_sensivel SEMPRE (passariam na porta (a)), mas o
  // alcance é de EQUIPE — a mesma fronteira de ponto.ver.equipe e
  // movimentacao.solicitar, decidida com a mesma conta: incluí-las mandaria as
  // 6 contas do papel gestor (nenhuma com totp_secret) para o enrolamento de
  // 2FA, que é exatamente o que a A1:a existe para evitar. As irmãs de alcance
  // global (`rh.posicao.ver`, e o disciplinar amplo servido por
  // `rh.disciplinar.ver` a dp/diretoria, que já exigem 2FA por papel-composição)
  // continuam protegidas como sempre. Se o dono mudar de ideia, o caminho é
  // `sistema.permissao.exige_2fa` na chave, não esta lista.
]);

export function chaveSensivel(chave: string): boolean {
  return CHAVES_SENSIVEIS.has(chave);
}
