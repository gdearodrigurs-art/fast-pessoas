"use client";

import estilos from "./filtro-estrutura.module.css";

/**
 * Os TRÊS campos que o dono separou, como filtro — um só componente para a
 * lista de colaboradores, os relatórios, o organograma e a folha.
 *
 *   REGISTRO        em qual empresa do grupo (qual CNPJ) a pessoa está registrada
 *   LOTAÇÃO         o local físico onde ela trabalha
 *   CENTRO DE CUSTO onde o custo dela cai
 *
 * São independentes, e por isso os três selects são independentes: escolher a
 * empresa NÃO restringe a lista de centros de custo. Alguém registrado na
 * Supply pode ter o custo caindo no CSC — é o exemplo do próprio dono, e
 * encadear os seletores esconderia justamente esse caso.
 *
 * COMBINÁVEL: o que estiver preenchido entra junto, em E. Nenhum é obrigatório
 * e nenhum nasce com valor — em branco significa "todos", que é a leitura que
 * as telas já davam antes desta onda.
 */

export interface OpcaoEstrutura {
  id: number;
  nome: string;
}

export interface OpcoesFiltroEstrutura {
  empresas: OpcaoEstrutura[];
  lotacoes: OpcaoEstrutura[];
  centros_custo: OpcaoEstrutura[];
}

/** "" = não filtrar por este campo. Guardado como texto: é valor de <select>. */
export interface ValorFiltroEstrutura {
  empresa_id: string;
  estabelecimento_id: string;
  centro_custo_id: string;
}

export const FILTRO_ESTRUTURA_VAZIO: ValorFiltroEstrutura = {
  empresa_id: "",
  estabelecimento_id: "",
  centro_custo_id: "",
};

export function filtroEstruturaAtivo(valor: ValorFiltroEstrutura): boolean {
  return (
    valor.empresa_id !== "" ||
    valor.estabelecimento_id !== "" ||
    valor.centro_custo_id !== ""
  );
}

/** Monta os parâmetros de consulta — só o que foi escolhido vai para a URL. */
export function parametrosFiltroEstrutura(
  valor: ValorFiltroEstrutura,
  parametros = new URLSearchParams()
): URLSearchParams {
  if (valor.empresa_id) parametros.set("empresa_id", valor.empresa_id);
  if (valor.estabelecimento_id) {
    parametros.set("estabelecimento_id", valor.estabelecimento_id);
  }
  if (valor.centro_custo_id) {
    parametros.set("centro_custo_id", valor.centro_custo_id);
  }
  return parametros;
}

export function FiltroEstrutura({
  opcoes,
  valor,
  aoMudar,
  prefixoId,
  desabilitado = false,
  mostrarLimpar = true,
}: {
  opcoes: OpcoesFiltroEstrutura | null;
  valor: ValorFiltroEstrutura;
  aoMudar: (valor: ValorFiltroEstrutura) => void;
  /** Prefixo dos ids: a mesma tela pode ter mais de um filtro. */
  prefixoId: string;
  desabilitado?: boolean;
  mostrarLimpar?: boolean;
}) {
  const empresas = opcoes?.empresas ?? [];
  const lotacoes = opcoes?.lotacoes ?? [];
  const centros = opcoes?.centros_custo ?? [];
  const ativo = filtroEstruturaAtivo(valor);

  return (
    <div className={estilos.filtro}>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={`${prefixoId}Empresa`}>
          Registro (empresa do grupo)
        </label>
        <select
          className={estilos.campo}
          id={`${prefixoId}Empresa`}
          disabled={desabilitado}
          value={valor.empresa_id}
          onChange={(evento) =>
            aoMudar({ ...valor, empresa_id: evento.target.value })
          }
        >
          <option value="">Todas</option>
          {empresas.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </option>
          ))}
        </select>
      </div>

      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={`${prefixoId}Lotacao`}>
          Lotação (local de trabalho)
        </label>
        <select
          className={estilos.campo}
          id={`${prefixoId}Lotacao`}
          disabled={desabilitado}
          value={valor.estabelecimento_id}
          onChange={(evento) =>
            aoMudar({ ...valor, estabelecimento_id: evento.target.value })
          }
        >
          <option value="">Todas</option>
          {lotacoes.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </option>
          ))}
        </select>
      </div>

      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={`${prefixoId}Centro`}>
          Centro de custo
        </label>
        <select
          className={estilos.campo}
          id={`${prefixoId}Centro`}
          disabled={desabilitado}
          value={valor.centro_custo_id}
          onChange={(evento) =>
            aoMudar({ ...valor, centro_custo_id: evento.target.value })
          }
        >
          <option value="">Todos</option>
          {centros.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </option>
          ))}
        </select>
      </div>

      {mostrarLimpar && (
        <button
          className={estilos.limpar}
          type="button"
          disabled={desabilitado || !ativo}
          onClick={() => aoMudar(FILTRO_ESTRUTURA_VAZIO)}
        >
          Limpar os três
        </button>
      )}
    </div>
  );
}
