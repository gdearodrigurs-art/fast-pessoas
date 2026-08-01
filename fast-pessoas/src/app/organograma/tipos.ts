// Tipos do contrato de GET /api/organograma — espelham
// src/dominios/organograma/esquemas.ts. Vivem fora do componente porque a MESMA
// árvore é desenhada de dois jeitos na mesma tela: em árvore vertical (padrão,
// tela larga) e em lista indentada (fallback de tela estreita).
//
// Nenhum campo de remuneração existe aqui — nem salário de pessoa, nem faixa de
// vaga. O organograma é estrutura.

export interface NoBase {
  chave: string;
  nivel: number;
  /** Os TRÊS campos da 0047 — vaga em aberto só tem lotação. */
  empresa_id: number | null;
  empresa_nome: string | null;
  estabelecimento_id: number | null;
  unidade: string | null;
  centro_custo_id: number | null;
  centro_custo: string | null;
  cargo_id: number | null;
  cargo_nome: string | null;
  destacado: boolean;
}

export interface NoPessoa extends NoBase {
  tipo: "pessoa";
  colaborador_id: number;
  nome: string;
  status: string;
  diretos: number;
  total_subarvore: number;
  gestor_fora_do_quadro: boolean;
  fora_da_hierarquia: boolean;
  filhos: No[];
}

export interface NoVaga extends NoBase {
  tipo: "vaga";
  vaga_id: number;
  titulo: string;
  status: string;
  prazo_alvo: string;
}

export type No = NoPessoa | NoVaga;

export interface Opcao {
  id: number;
  nome: string;
}

export interface Organograma {
  alcance: "todos" | "equipe" | "proprio";
  raizes: NoPessoa[];
  vagas_sem_no: NoVaga[];
  headcount: {
    realizado: number;
    aprovado: number;
    vagas_em_aberto: number;
    lacuna: number;
  } | null;
  estrutura_opcoes: {
    empresas: Opcao[];
    lotacoes: Opcao[];
    centros_custo: Opcao[];
  };
  cargos: Opcao[];
  destacados: number;
  avisos: string[];
}

/**
 * Cor por unidade. Paleta fixa (nada de gerar cor por hash — ilegível): a
 * posição na lista de unidades ativas decide, então a cor é estável entre
 * recargas enquanto o cadastro não mudar.
 */
export const CORES_UNIDADE = [
  "#d21217",
  "#1f6f8b",
  "#6b4fa0",
  "#2e7d4f",
  "#b06a00",
  "#7a5c3e",
  "#4a4f9c",
  "#a03c6e",
];

export const COR_SEM_UNIDADE = "#8c8781";

export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

/** Rótulo do quanto a pessoa lidera — o mesmo texto nas duas visões. */
export function rotuloLiderados(no: NoPessoa): string {
  if (no.diretos === 0) return "sem liderados";
  return `${no.diretos} direto(s) · ${no.total_subarvore} na equipe`;
}
