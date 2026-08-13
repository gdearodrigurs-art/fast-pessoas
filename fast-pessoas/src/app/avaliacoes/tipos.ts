import {
  Decisao,
  Recomendacao,
  StatusCiclo,
  TipoCiclo,
} from "@/dominios/avaliacao/esquemas";

// Espelhos dos payloads do serviço (src/dominios/avaliacao/servico.ts) para
// os componentes de cliente — sem importar código de servidor no bundle.

export interface Permissoes {
  responder: boolean;
  configurar: boolean;
  decidir: boolean;
  resultado_ver: boolean;
}

export interface CicloResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_colaborador_id: number;
  avaliador_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  origem: "admissao" | "lote" | "manual";
  prazo: string;
  dias_para_prazo: number;
  modelo_versao: number;
  avaliacao_estado: "rascunho" | "enviada" | null;
  tem_decisao: boolean;
  criado_em: string;
}

export interface PendenciaSemGestor {
  colaborador_nome: string;
  matricula: string;
  marco: "experiencia_45" | "experiencia_90";
  prazo: string;
}

export interface Painel {
  pode: Permissoes;
  modelos: { geral_ativo: boolean; cargos_com_modelo: number };
  ciclos_gerados_agora: number;
  minhas: CicloResumo[] | null;
  ciclos: CicloResumo[] | null;
  pendencias_sem_gestor: PendenciaSemGestor[] | null;
}

export interface ResultadoLote {
  abertos: number;
  sem_gestor: { colaborador_nome: string; matricula: string }[];
}

// ------------------------------------------------------------------ modelo

export interface Indicador {
  id: number;
  nome: string;
  descricao: string;
  peso: number;
  ordem: number;
}

export interface Pilar {
  id: number;
  nome: string;
  peso: number;
  ordem: number;
  indicadores: Indicador[];
}

export interface Faixa {
  id: number;
  minimo: number;
  maximo: number;
  rotulo: string;
  recomendacao: Recomendacao;
}

export interface Estrutura {
  modelo_versao_id: number;
  versao: number;
  nome: string;
  pilares: Pilar[];
  faixas: Faixa[];
}

export interface ModeloResumo {
  id: number;
  versao: number;
  nome: string;
  status: "rascunho" | "ativa" | "encerrada";
  inicio_vigencia: string;
  fim_vigencia: string | null;
  /** null = modelo GERAL (fallback); senão o cargo desta família. */
  cargo_id: number | null;
  cargo_nome: string | null;
}

export interface FamiliaModelo {
  /** null = Geral (o piso/fallback); senão o cargo desta família. */
  cargo_id: number | null;
  rotulo: string;
  /** Todas as versões desta família, mais nova primeiro. */
  modelos: ModeloResumo[];
  ativa: Estrutura | null;
  rascunho: Estrutura | null;
}

export interface PainelModelos {
  /** Geral primeiro, depois um por cargo que já tem modelo. */
  familias: FamiliaModelo[];
  /** Cargos com versão ativa que ainda não têm modelo (alimenta o seletor). */
  cargos_sem_modelo: { id: number; nome: string }[];
}

// ------------------------------------------------------------------ detalhe do ciclo

export interface RespostaGravada {
  indicador_id: number;
  nota: number | null;
  nao_observado: boolean;
  atualizado_em: string;
}

export interface MemoriaIndicador {
  indicador_id: number;
  nome: string;
  peso: number;
  peso_normalizado: number | null;
  nota: number | null;
  nao_observado: boolean;
}

export interface MemoriaPilar {
  pilar_id: number;
  nome: string;
  peso: number;
  peso_normalizado: number | null;
  excluido: boolean;
  respondidos: number;
  nao_observados: number;
  nota_pilar: number | null;
  indicadores: MemoriaIndicador[];
}

export interface MemoriaCalculo {
  pilares: MemoriaPilar[];
  percentual: number;
  regras?: {
    nao_observado: string;
    arredondamento: string;
    faixa: string;
  };
}

export interface ResultadoPayload {
  percentual: number;
  faixa_rotulo: string;
  faixa_minimo: number;
  faixa_maximo: number;
  recomendacao: Recomendacao;
  memoria_calculo: MemoriaCalculo;
  em: string;
}

export interface DecisaoGravada {
  decisao: Decisao;
  divergente: boolean;
  justificativa: string | null;
  decisor_nome: string;
  em: string;
}

export interface CicloPayload {
  id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  origem: "admissao" | "lote" | "manual";
  prazo: string;
  dias_para_prazo: number;
  modelo_versao: number;
  modelo_nome: string;
  avaliacao_estado: "rascunho" | "enviada" | null;
  enviado_em: string | null;
  criado_em: string;
}

/** Estado explicado do ciclo — o que substitui a tela em branco (G1a). */
export interface SituacaoCiclo {
  titulo: string;
  detalhe: string;
  proximo_passo: string;
  o_que_posso_fazer: string[];
}

export interface Detalhe {
  pode: Permissoes & { sou_avaliador: boolean };
  ciclo: CicloPayload;
  situacao: SituacaoCiclo;
  estrutura: Estrutura | null;
  respostas: RespostaGravada[] | null;
  resultado: ResultadoPayload | null;
  decisao: DecisaoGravada | null;
  acoes: { responder: boolean; decidir: boolean; cancelar: boolean };
}
