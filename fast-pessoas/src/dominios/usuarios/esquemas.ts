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
  ["rh.auditar", "Administração do sistema"],
  ["usuario.", "Administração do sistema"],
  ["perfil.", "Administração do sistema"],
  ["demanda.", "Demandas"],
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
  "Demandas",
  "Férias",
  "Afastamentos",
  "Admissão",
  "Desligamento",
  "Benefícios",
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
 * Chaves que abrem dado sensível (remuneração, saúde, sigilo). A tela marca
 * cada uma com um selo para o administrador ver o peso do que concede — toda
 * leitura autorizada por elas grava em audit.leitura_sensivel.
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
]);

export function chaveSensivel(chave: string): boolean {
  return CHAVES_SENSIVEIS.has(chave);
}
