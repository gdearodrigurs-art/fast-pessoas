import { TipoVinculo } from "@/dominios/colaboradores/esquemas";
import {
  FluxoDemanda,
  NivelAprovacao,
  StatusDemanda,
  StatusEtapa,
  TipoMovimentacao,
} from "@/dominios/demandas/esquemas";

// Espelho (só tipos) do payload da API de demandas — o cliente não importa o
// repositório do domínio para não puxar dependências de servidor.

export interface TipoDemanda {
  id: number;
  chave: string;
  nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  fluxo: FluxoDemanda;
}

export interface Demanda {
  id: number;
  numero: number;
  tipo_chave: string;
  tipo_nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  fluxo: FluxoDemanda;
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

export interface Etapa {
  id: number;
  ordem: number;
  nivel: NivelAprovacao;
  status: StatusEtapa;
  usuario_esperado_nome: string | null;
  decisor_nome: string | null;
  decidido_em: string | null;
  motivo: string | null;
}

export interface Movimentacao {
  id: number;
  demanda_id: number;
  tipo: TipoMovimentacao;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_usuario_id: number | null;
  /** De onde a pessoa saiu: posição/lotação da véspera da vigência pretendida. */
  cargo_origem: string | null;
  unidade_origem: string | null;
  cargo_destino_id: number | null;
  cargo_destino: string | null;
  estabelecimento_destino_id: number | null;
  unidade_destino: string | null;
  centro_custo_destino_id: number | null;
  centro_custo_destino: string | null;
  /** REGISTRO: a empresa do grupo de onde sai e para onde vai (0047/0048). */
  empresa_origem: string | null;
  empresa_destino_id: number | null;
  empresa_destino: string | null;
  /** Só em 'transferencia_empresa': o contrato que nasce na empresa destino. */
  matricula_destino: string | null;
  tipo_vinculo_destino: TipoVinculo | null;
  /** Líder na empresa destino (0053). null = ninguém escolheu. */
  gestor_destino_colaborador_id: number | null;
  gestor_destino_nome: string | null;
  vinculo_destino_id: number | null;
  vinculo_destino_matricula: string | null;
  data_pretendida: string;
  justificativa: string;
  dentro_faixa: boolean | null;
  justificativa_excecao: string | null;
  aplicada_em: string | null;
  /** A data pretendida já chegou — calculado no servidor, em São Paulo. */
  efeito_vencido: boolean;
  // Remuneração: null quando a sessão não pode ver (ausência, não máscara) e
  // sempre null nas listas — o valor sai só no detalhe.
  salario_proposto: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
}

export interface CartaoMovimentacao {
  demanda: Demanda;
  movimentacao: Movimentacao;
  etapas: Etapa[];
}

export interface VisaoMovimentacoes {
  minhas: CartaoMovimentacao[];
  do_lider: CartaoMovimentacao[] | null;
  da_diretoria: CartaoMovimentacao[] | null;
  /** Aprovadas com o efeito ainda por aplicar — as vencidas na frente. */
  programadas: CartaoMovimentacao[] | null;
  aplicadas: CartaoMovimentacao[] | null;
}

export interface OpcoesMovimentacao {
  alvos: {
    id: number;
    nome_completo: string;
    cargo_atual: string | null;
    unidade_atual: string | null;
  }[];
  cargos: { id: number; nome: string }[];
  unidades: { id: number; unidade: string }[];
  centros_custo: {
    id: number;
    codigo: string;
    nome: string;
    empresa_id: number;
    empresa_nome: string | null;
  }[];
  /** Vazio para quem não tem movimentacao.transferir_empresa (0048). */
  empresas: { id: number; nome_fantasia: string; cnpj: string | null }[];
  /** Candidatos a líder na empresa destino, já com a empresa de cada um. */
  gestores: {
    colaborador_id: number;
    nome_completo: string;
    cargo_atual: string | null;
    empresa_id: number;
  }[];
}

export interface Visao {
  pode: {
    aprovar: boolean;
    atender: boolean;
    ver_todas: boolean;
    solicitar_movimentacao: boolean;
    aprovar_diretoria: boolean;
    ciencia_movimentacao: boolean;
    ver_salario: boolean;
    transferir_empresa: boolean;
    editar_posicao: boolean;
  };
  tipos: TipoDemanda[];
  minhas: Demanda[];
  aprovacoes: Demanda[] | null;
  equipe_decididas: Demanda[] | null;
  fila: { indicadores: Indicadores; demandas: Demanda[] } | null;
  movimentacoes: VisaoMovimentacoes | null;
}

export interface Detalhe {
  demanda: Demanda;
  transicoes: Transicao[];
  comentarios: Comentario[];
  movimentacao: Movimentacao | null;
  etapas: Etapa[];
  acoes: {
    aprovar: boolean;
    reprovar: boolean;
    assumir: boolean;
    concluir: boolean;
    recusar: boolean;
    comentar: boolean;
    decidir_etapa: NivelAprovacao | null;
    /** Efeito aprovado, data já chegada e ainda não aplicado. */
    aplicar_efeito: boolean;
  };
}
