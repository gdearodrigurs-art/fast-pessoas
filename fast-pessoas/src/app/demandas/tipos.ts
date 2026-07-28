import { StatusDemanda } from "@/dominios/demandas/esquemas";

// Espelho (só tipos) do payload da API de demandas — o cliente não importa o
// repositório do domínio para não puxar dependências de servidor.

export interface TipoDemanda {
  id: number;
  chave: string;
  nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
}

export interface Demanda {
  id: number;
  numero: number;
  tipo_chave: string;
  tipo_nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  solicitante_usuario_id: number;
  solicitante_nome: string;
  atendente_nome: string | null;
  descricao: string;
  status: StatusDemanda;
  recusada_na_aprovacao: boolean;
  prazo: string;
  dias_ate_prazo: number;
  criado_em: string;
}

export interface Transicao {
  id: number;
  de_status: StatusDemanda | null;
  para_status: StatusDemanda;
  por_nome: string;
  motivo: string | null;
  em: string;
}

export interface Comentario {
  id: number;
  autor_usuario_id: number;
  autor_nome: string;
  autor_papel: string;
  texto: string;
  em: string;
}

export interface Indicadores {
  na_fila: number;
  vencendo_hoje: number;
  atrasadas: number;
  aguardando_aprovacao: number;
}

export interface Visao {
  pode: { aprovar: boolean; atender: boolean; ver_todas: boolean };
  tipos: TipoDemanda[];
  minhas: Demanda[];
  aprovacoes: Demanda[] | null;
  equipe_decididas: Demanda[] | null;
  fila: { indicadores: Indicadores; demandas: Demanda[] } | null;
}

export interface Detalhe {
  demanda: Demanda;
  transicoes: Transicao[];
  comentarios: Comentario[];
  acoes: {
    aprovar: boolean;
    reprovar: boolean;
    assumir: boolean;
    concluir: boolean;
    recusar: boolean;
    comentar: boolean;
  };
}
