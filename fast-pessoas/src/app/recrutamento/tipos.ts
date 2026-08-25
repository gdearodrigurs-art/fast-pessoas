// Tipos do cliente — espelham os payloads de /api/recrutamento.

import {
  MotivoMovimentacao,
  MotivoRequisicao,
  OrigemCandidato,
  RecomendacaoParecer,
  StatusCandidatura,
  StatusOferta,
  StatusRequisicao,
  StatusVaga,
} from "@/dominios/recrutamento/esquemas";

export interface Permissoes {
  ver: boolean;
  gerir: boolean;
  requisicao_criar: boolean;
  requisicao_decidir: boolean;
  parecer_registrar: boolean;
  parecer_ver: boolean;
}

export interface Requisicao {
  id: number;
  cargo_nome: string;
  unidade: string | null;
  motivo: MotivoRequisicao;
  justificativa: string;
  solicitante_usuario_id: number;
  solicitante_nome: string;
  status: StatusRequisicao;
  decisor_nome: string | null;
  decidido_em: string | null;
  motivo_decisao: string | null;
  vaga_id: number | null;
  criado_em: string;
}

export interface Vaga {
  id: number;
  requisicao_id: number;
  titulo: string;
  cargo_nome: string;
  unidade: string | null;
  solicitante_usuario_id: number;
  faixa_min: number;
  faixa_max: number;
  prazo_alvo: string;
  dias_ate_prazo: number;
  status: StatusVaga;
  candidaturas_ativas: number;
  criado_em: string;
  /** Modelo de processo congelado na abertura (0077). */
  modelo_versao_id: number;
  modelo_nome: string;
}

export interface Etapa {
  id: number;
  tipo: string;
  ordem: number;
  nome: string;
}

export interface Cargo {
  cargo_id: number;
  nome: string;
  faixa_min: number | null;
  faixa_max: number | null;
}

export interface Estabelecimento {
  estabelecimento_versao_id: number;
  unidade: string;
}

export interface Candidato {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  origem: OrigemCandidato;
  consentido_ate: string | null;
  criado_em: string;
}

export interface Painel {
  pode: Permissoes;
  requisicoes: Requisicao[];
  vagas: Vaga[];
  etapas: Etapa[];
  cargos: Cargo[] | null;
  estabelecimentos: Estabelecimento[] | null;
  candidatos: Candidato[] | null;
  indicador_vagas_no_prazo: number | null;
}

export interface CandidaturaCartao {
  id: number;
  candidato_id: number;
  candidato_nome: string;
  candidato_email: string | null;
  candidato_telefone: string | null;
  etapa_atual_id: number;
  etapa_ordem: number;
  status: StatusCandidatura;
  motivo_desfecho: MotivoMovimentacao | null;
  total_pareceres: number;
  oferta_status: StatusOferta | null;
  oferta_valor: number | null;
  oferta_dentro_banda: boolean | null;
  criado_em: string;
}

export interface Kanban {
  vaga: Vaga;
  etapas: Etapa[];
  candidaturas: CandidaturaCartao[];
}

export interface Parecer {
  id: number;
  etapa_nome: string;
  avaliador_usuario_id: number;
  avaliador_nome: string;
  recomendacao: RecomendacaoParecer;
  observacoes: string;
  em: string;
}
