import {
  CategoriaDevolucao,
  EstadoProcesso,
  Iniciativa,
  ModalidadeAviso,
  PerguntaRoteiro,
  ResultadoEstabilidade,
  StatusEntrevista,
  StatusItem,
  TipoEstabilidade,
} from "@/dominios/desligamento/esquemas";

// Espelho (só tipos) do payload da API de desligamentos — o cliente não
// importa o repositório do domínio para não puxar dependências de servidor.

export interface TipoDesligamento {
  id: number;
  tipo: string;
  nome: string;
  exige_aviso: boolean;
  admite_indenizado: boolean;
  direito_manutencao_plano: boolean;
  elegivel_entrevista: boolean;
}

export interface ColaboradorElegivel {
  id: number;
  matricula: string;
  nome_completo: string;
}

export interface Processo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_matricula: string;
  tipo: string;
  tipo_nome: string;
  exige_aviso: boolean;
  admite_indenizado: boolean;
  direito_manutencao_plano: boolean;
  elegivel_entrevista: boolean;
  iniciativa: Iniciativa;
  modalidade_aviso: ModalidadeAviso;
  estado: EstadoProcesso;
  data_comunicacao: string;
  data_projetada_termino: string;
  data_termino_efetiva: string | null;
  data_limite_477: string;
  dias_ate_477: number;
  entrevista_status: StatusEntrevista | null;
  itens_pendentes: number;
  aberto_por_nome: string;
  criado_em: string;
}

export interface Verificacao {
  id: number;
  tipo: TipoEstabilidade;
  resultado: ResultadoEstabilidade;
  origem: "declaracao" | "afastamento";
  justificativa: string | null;
  decisor_nome: string;
  em: string;
}

export interface Item {
  id: number;
  /** Chave no catálogo rh.categoria_devolucao — não é enum desde a 0054. */
  categoria: string;
  /** Rótulo já resolvido pelo servidor: a tela não tem mapa de categoria. */
  categoria_nome: string;
  descricao: string;
  status: StatusItem;
  criado_em: string;
  atualizado_em: string;
}

export type { CategoriaDevolucao };

/**
 * O que ainda está COM o colaborador segundo os REGISTROS DE ENTREGA
 * (rh.epi_entrega + rh.posse_item sem devolução) — aviso do eixo 10, não
 * trava o encerramento.
 */
export interface PendenciaDevolucao {
  origem: "epi" | "posse";
  descricao: string;
  quantidade: number;
  data_entrega: string;
}

export interface CatalogoCategorias {
  pode_administrar: boolean;
  categorias: CategoriaDevolucao[];
}

export interface Entrevista {
  id: number;
  processo_id: number;
  roteiro_versao_id: number;
  roteiro_nome: string;
  perguntas: PerguntaRoteiro[];
  status: StatusEntrevista;
  data_oferta: string;
  data_agendada: string | null;
  data_realizacao: string | null;
  motivo_nao_realizacao: string | null;
  elegivel_indicador: boolean;
  entrevistador_nome: string | null;
  consentimento_uso_agregado: boolean;
}

export interface IndicadorEntrevistas {
  realizadas: number;
  elegiveis: number;
  percentual: number | null;
}

export interface Permissoes {
  iniciar: boolean;
  gerir: boolean;
  conduzir_entrevista: boolean;
  ver_motivo: boolean;
  ver_respostas: boolean;
}

export interface Visao {
  pode: Permissoes;
  processos: Processo[];
  indicador: IndicadorEntrevistas;
  tipos: TipoDesligamento[] | null;
  colaboradores: ColaboradorElegivel[] | null;
}

export interface Detalhe {
  processo: Processo;
  /** Chave ausente para quem não tem desligamento.motivo.ver. */
  motivo?: string | null;
  verificacoes: Verificacao[];
  itens: Item[];
  /** Pendências vindas dos registros de entrega (EPI + posse) — só aviso. */
  pendencias_devolucao: PendenciaDevolucao[];
  /** Só as ATIVAS, e vazio para quem não gere itens — o seletor sai daqui. */
  categorias: CategoriaDevolucao[];
  entrevista: Entrevista | null;
  acoes: {
    avancar: boolean;
    encerrar: boolean;
    encerrar_bloqueado_por_entrevista: boolean;
    cancelar: boolean;
    gerir_itens: boolean;
    entrevista_transicionar: boolean;
    ver_respostas: boolean;
  };
}

export interface RespostasEntrevista {
  entrevista_id: number;
  perguntas: { chave: string; texto: string; tipo: string }[];
  respostas: Record<string, string | number | boolean>;
}

export interface PreviaEstabilidades {
  acidentario: { resultado: ResultadoEstabilidade; detalhe: string };
}
