// Tipos do cliente — espelham os payloads de /api/admissoes.

import {
  EstadoProcesso,
  StatusItem,
} from "@/dominios/admissao/esquemas";

export interface Processo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data_admissao: string;
  data_inicio_prevista: string;
  dias_ate_inicio: number;
  estado: EstadoProcesso;
  contrato_experiencia: boolean;
  prazo_experiencia_1: string | null;
  prazo_experiencia_2: string | null;
  dias_prazo_1: number | null;
  dias_prazo_2: number | null;
  checklist_versao: number;
  total_itens: number;
  itens_resolvidos: number;
  obrigatorios_pendentes: number;
  criado_em: string;
  atualizado_em: string;
}

export interface Candidato {
  id: number;
  nome_completo: string;
  matricula: string;
  data_admissao: string;
}

export interface Painel {
  pode: { gerir: boolean };
  processos: Processo[];
  candidatos: Candidato[] | null;
  indicador_no_prazo: number | null;
}

export interface Item {
  id: number;
  ordem: number;
  descricao: string;
  obrigatorio: boolean;
  status: StatusItem;
  concluido_por_nome: string | null;
  concluido_em: string | null;
}

export interface Detalhe {
  processo: Processo;
  itens: Item[];
  percentual: number;
  acoes: {
    tratar_itens: boolean;
    concluir: boolean;
    cancelar: boolean;
  };
}
