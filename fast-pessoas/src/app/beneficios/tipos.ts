import type {
  CategoriaBeneficio,
  Criterio,
  NaturezaSolicitacao,
  Parentesco,
  StatusAdesao,
} from "@/dominios/beneficios/esquemas";
import type { StatusDemanda } from "@/dominios/demandas/esquemas";

// Espelho (só tipos) do payload da API de benefícios — o cliente não importa
// repositório/serviço do domínio para não puxar dependências de servidor.

export interface RegraVigente {
  id: number;
  criterio: Criterio;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  inicio_vigencia: string;
}

export interface Beneficio {
  id: number;
  chave: string;
  nome: string;
  categoria: CategoriaBeneficio;
  ativo: boolean;
  regra: RegraVigente | null;
}

export interface RegraVersao {
  id: number;
  status: "rascunho" | "ativa" | "encerrada";
  criterio: Criterio;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export interface ItemCatalogo {
  beneficio_id: number;
  chave: string;
  nome: string;
  categoria: string;
  categoria_rotulo: string;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  ja_aderido: boolean;
  solicitacao_pendente: boolean;
}

export interface Adesao {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_matricula: string;
  beneficio_id: number;
  beneficio_chave: string;
  beneficio_nome: string;
  categoria: CategoriaBeneficio;
  status: StatusAdesao;
  inicio: string;
  fim: string | null;
  valor: number | null;
  desconto: number | null;
  demanda_id: number | null;
}

export interface Solicitacao {
  demanda_id: number;
  numero: number;
  descricao: string;
  status: StatusDemanda;
  prazo: string;
  dias_ate_prazo: number;
  criado_em: string;
  solicitante_usuario_id: number;
  solicitante_nome: string;
  solicitante_colaborador_id: number | null;
  natureza: NaturezaSolicitacao | null;
  beneficio_id: number | null;
  beneficio_nome: string | null;
  adesao_id: number | null;
  /** O que a pessoa propôs numa revisão de valor (H3); null nas demais. */
  valor_pedido: number | null;
}

export interface Dependente {
  id: number;
  colaborador_id: number;
  nome: string;
  nascimento: string;
  parentesco: Parentesco;
  cpf: string | null;
  /** Conta na dedução do IRRF? Ato do DP (conferência); autoatendimento nasce false. */
  deduz_irrf: boolean;
}

export interface UnidadeOpcao {
  id: number;
  unidade: string | null;
}

export interface ColaboradorOpcao {
  id: number;
  nome_completo: string;
  matricula: string;
}

export interface Visao {
  pode: {
    solicitar: boolean;
    gerir: boolean;
    administrar: boolean;
    ver: boolean;
  };
  perfil: {
    colaborador_id: number;
    nome_completo: string;
    matricula: string;
    tipo_vinculo: string;
    unidade: string | null;
    status: string;
  } | null;
  catalogo: ItemCatalogo[];
  minhas_adesoes: Adesao[];
  minhas_solicitacoes: Solicitacao[];
  meus_dependentes: Dependente[];
  gestao: {
    solicitacoes_pendentes: Solicitacao[];
    adesoes: Adesao[];
    colaboradores: ColaboradorOpcao[];
    beneficios: Beneficio[];
  } | null;
  administracao: {
    beneficios: Beneficio[];
    unidades: UnidadeOpcao[];
  } | null;
}
