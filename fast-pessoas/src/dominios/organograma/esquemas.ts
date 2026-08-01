import { z } from "zod";
import {
  esquemaFiltroEstrutura,
  type OpcoesFiltroEstrutura,
} from "../estrutura/esquemas";

// ------------------------------------------------------------------ organograma
// VISÃO sobre dado que já existe — este domínio não tem tabela própria.
// Fontes: rh.relacao_gestor (vigente) + rh.colaborador (no quadro) +
// rh.posicao_colaborador/rh.cargo_versao (cargo) + rh.lotacao/
// rh.estabelecimento_versao (unidade) + rh.vaga/rh.requisicao_vaga (vagas).
//
// SEM DADO SENSÍVEL: salário (rh.colaborador.sensivel.ver / rh.posicao.ver) e
// faixa da vaga (rh.vaga.faixa_min/faixa_max) NUNCA entram no payload desta
// tela — nem para quem tem a chave. O organograma é estrutura, não remuneração;
// por isso ele também não grava audit.leitura_sensivel: não há leitura sensível.

/**
 * Teto de profundidade da caminhada na hierarquia. Não é enfeite: em dado real
 * a relação gestor→liderado pode formar CICLO (A lidera B, B lidera A) — o
 * índice único do banco garante "um gestor vigente por liderado", não a
 * aciclicidade. Quem estourar o teto ou ficar preso em ciclo é reportado em
 * `avisos` e desenhado como raiz solta, nunca omitido em silêncio.
 */
export const PROFUNDIDADE_MAXIMA = 20;

/** Status de vaga que conta como "posição em aberto" (nem fechada, nem cancelada). */
export const STATUS_VAGA_EM_ABERTO = ["aberta", "congelada"] as const;

/**
 * Recorte do organograma. Os TRÊS campos da estrutura (registro, lotação e
 * centro de custo) vêm de `esquemaFiltroEstrutura` — o `estabelecimento_id`
 * que a tela já tinha É a lotação, e agora ganha os dois irmãos. Todos são
 * combináveis entre si e com cargo e busca, e todos mantêm os ancestrais: o
 * filtro recorta quem é DESTACADO, nunca quebra a linha de subordinação.
 */
export const esquemaConsultaOrganograma = z
  .object({
    /** Recorte por cargo funcional (rh.cargo.id) — mantém os ancestrais. */
    cargo_id: z.coerce.number().int().positive().optional(),
    /** Busca por nome: destaca o nó e abre o caminho até ele. */
    busca: z.string().trim().min(2).max(100).optional(),
  })
  .extend(esquemaFiltroEstrutura.shape);

export type ConsultaOrganograma = z.infer<typeof esquemaConsultaOrganograma>;

// ------------------------------------------------------------------ contrato de saída

export type AlcanceOrganograma = "todos" | "equipe" | "proprio";

interface NoBase {
  /** Chave estável para o React e para o estado de colapso na tela. */
  chave: string;
  /** Profundidade a partir da raiz visível (0 = raiz). */
  nivel: number;
  /** Os três campos da 0047. Vaga em aberto só tem lotação — os outros vêm nulos. */
  empresa_id: number | null;
  empresa_nome: string | null;
  estabelecimento_id: number | null;
  unidade: string | null;
  centro_custo_id: number | null;
  centro_custo: string | null;
  cargo_id: number | null;
  cargo_nome: string | null;
  /** Casou com o filtro/busca em vigor — a tela abre o caminho e destaca. */
  destacado: boolean;
}

export interface NoPessoa extends NoBase {
  tipo: "pessoa";
  colaborador_id: number;
  nome: string;
  /** 'ativo' ou 'afastado' — desligado não entra na árvore. */
  status: string;
  /** Liderados diretos no quadro (contagem do quadro completo, não do filtro). */
  diretos: number;
  /** Liderados da subárvore inteira, excluindo a própria pessoa. */
  total_subarvore: number;
  /** Gestor vigente aponta para alguém fora do quadro (desligado, por ex.). */
  gestor_fora_do_quadro: boolean;
  /**
   * Hierarquia doente neste nó: a pessoa está DENTRO de um laço gestor→liderado,
   * ou foi pendurada na raiz porque a descida bateu no teto de profundidade.
   * `avisos` diz qual dos dois é. Não marca quem só está pendurado num laço —
   * essa gente tem árvore e contagens normais.
   */
  fora_da_hierarquia: boolean;
  filhos: NoOrganograma[];
}

/**
 * Nó FANTASMA: posição em aberto, não pessoa. Pendura no gestor solicitante da
 * requisição. Nunca traz faixa salarial.
 */
export interface NoVaga extends NoBase {
  tipo: "vaga";
  vaga_id: number;
  titulo: string;
  status: string;
  prazo_alvo: string;
}

export type NoOrganograma = NoPessoa | NoVaga;

export interface HeadcountOrganograma {
  /** Pessoas no quadro dentro do recorte visível. */
  realizado: number;
  /** realizado + vagas aprovadas em aberto. */
  aprovado: number;
  vagas_em_aberto: number;
  /** Posições em aberto = aprovado - realizado. */
  lacuna: number;
}

export interface OpcaoOrganograma {
  id: number;
  nome: string;
}

export interface Organograma {
  alcance: AlcanceOrganograma;
  raizes: NoPessoa[];
  /** Vaga em aberto cujo solicitante não é colaborador no quadro. */
  vagas_sem_no: NoVaga[];
  headcount: HeadcountOrganograma | null;
  /** Opções dos três seletores — mesma fonte da lista e dos relatórios. */
  estrutura_opcoes: OpcoesFiltroEstrutura;
  cargos: OpcaoOrganograma[];
  /** Quantos nós casaram com o filtro/busca (0 = nada encontrado). */
  destacados: number;
  /** Ciclo, profundidade estourada, gestor fora do quadro — texto para a tela. */
  avisos: string[];
}
