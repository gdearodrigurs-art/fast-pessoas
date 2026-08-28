"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  ROTULOS_TIPO_EMPRESA,
  TIPOS_EMPRESA,
  type TipoEmpresa,
} from "@/dominios/estrutura/esquemas";
import { BlocoCarga } from "./bloco-carga";
import estilos from "./page.module.css";

// Três catálogos, três seções, a mesma gramática em todas:
//   criar · renomear (versão nova com vigência) · inativar/reativar.
// Excluir não existe de propósito — quem tem gente ou histórico apontando
// continua respondendo pelo passado.

interface Empresa {
  id: number;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tipo: TipoEmpresa | null;
  inicio_vigencia: string | null;
  inativada_em: string | null;
  vinculos: number;
  centros_custo: number;
}

interface CentroCusto {
  id: number;
  empresa_id: number;
  empresa_nome: string | null;
  codigo: string;
  nome: string | null;
  inicio_vigencia: string | null;
  inativado_em: string | null;
  /** Preenchido quando a EMPRESA que mantém o centro está inativada. */
  empresa_inativada_em: string | null;
  alocacoes: number;
}

interface Lotacao {
  id: number;
  cnpj: string | null;
  razao_social: string | null;
  unidade: string | null;
  endereco_resumido: string | null;
  inicio_vigencia: string | null;
  inativado_em: string | null;
  alocacoes: number;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarCnpj(cnpj: string | null): string {
  if (!cnpj) return "—";
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

// Campo NASCE VAZIO. `tipo` era "matriz" chumbado: quem criasse a segunda,
// terceira e quarta empresa do grupo sem reparar no seletor gravaria quatro
// matrizes — um rótulo de negócio que ninguém escolheu. Vazio obriga a escolha,
// e a semeadura de "nova versão" continua vindo da versão VIGENTE.
const EMPRESA_VAZIA = {
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  tipo: "" as TipoEmpresa | "",
  inicio_vigencia: "",
};

const CENTRO_VAZIO = {
  empresa_id: "",
  codigo: "",
  nome: "",
  inicio_vigencia: "",
};

const LOTACAO_VAZIA = {
  cnpj: "",
  razao_social: "",
  unidade: "",
  endereco_resumido: "",
  inicio_vigencia: "",
};

export function PainelEstrutura({
  podeEmpresa,
  podeCentroCusto,
  podeLotacao,
  podeImportar,
}: {
  podeEmpresa: boolean;
  podeCentroCusto: boolean;
  podeLotacao: boolean;
  /** Chave sistema.carga.importar: o bloco de carga inicial por planilha. */
  podeImportar: boolean;
}) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [lotacoes, setLotacoes] = useState<Lotacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [novaEmpresa, setNovaEmpresa] = useState(EMPRESA_VAZIA);
  const [erroEmpresa, setErroEmpresa] = useState<string | null>(null);
  const [empresaEmEdicao, setEmpresaEmEdicao] = useState<number | null>(null);
  const [versaoEmpresa, setVersaoEmpresa] = useState(EMPRESA_VAZIA);

  const [novoCentro, setNovoCentro] = useState(CENTRO_VAZIO);
  const [erroCentro, setErroCentro] = useState<string | null>(null);
  const [centroEmEdicao, setCentroEmEdicao] = useState<number | null>(null);
  const [versaoCentro, setVersaoCentro] = useState({
    nome: "",
    inicio_vigencia: "",
  });

  const [novaLotacao, setNovaLotacao] = useState(LOTACAO_VAZIA);
  const [erroLotacao, setErroLotacao] = useState<string | null>(null);
  const [lotacaoEmEdicao, setLotacaoEmEdicao] = useState<number | null>(null);
  const [versaoLotacao, setVersaoLotacao] = useState(LOTACAO_VAZIA);

  const carregar = useCallback(async () => {
    try {
      const [respEmpresas, respCentros, respLotacoes] = await Promise.all([
        podeEmpresa ? fetch("/api/estrutura/empresas") : null,
        podeCentroCusto ? fetch("/api/estrutura/centros-custo") : null,
        podeLotacao ? fetch("/api/estabelecimentos") : null,
      ]);
      if (respEmpresas?.ok) {
        setEmpresas((await respEmpresas.json()).empresas ?? []);
      }
      if (respCentros?.ok) {
        setCentros((await respCentros.json()).centros_custo ?? []);
      }
      if (respLotacoes?.ok) {
        setLotacoes((await respLotacoes.json()).estabelecimentos ?? []);
      }
    } finally {
      setCarregando(false);
    }
  }, [podeEmpresa, podeCentroCusto, podeLotacao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(
    url: string,
    metodo: "POST" | "PATCH",
    corpo: unknown,
    aoErrar: (mensagem: string) => void,
    aplicar: (dados: Record<string, unknown>) => void,
    padrao: string
  ) {
    setSalvando(true);
    aoErrar("");
    try {
      const resposta = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        aoErrar(dados.erro ?? padrao);
        return false;
      }
      aplicar(dados);
      return true;
    } catch {
      aoErrar("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // ---------------------------------------------------------------- empresa

  async function criarEmpresa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const ok = await enviar(
      "/api/estrutura/empresas",
      "POST",
      {
        cnpj: novaEmpresa.cnpj,
        razao_social: novaEmpresa.razao_social || undefined,
        nome_fantasia: novaEmpresa.nome_fantasia,
        tipo: novaEmpresa.tipo,
        inicio_vigencia: novaEmpresa.inicio_vigencia,
      },
      (m) => setErroEmpresa(m || null),
      (dados) => setEmpresas((dados.empresas as Empresa[]) ?? []),
      "Não foi possível criar a empresa."
    );
    if (ok) setNovaEmpresa(EMPRESA_VAZIA);
  }

  async function renomearEmpresa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (empresaEmEdicao === null) return;
    const ok = await enviar(
      `/api/estrutura/empresas/${empresaEmEdicao}`,
      "POST",
      {
        cnpj: versaoEmpresa.cnpj,
        razao_social: versaoEmpresa.razao_social || undefined,
        nome_fantasia: versaoEmpresa.nome_fantasia,
        tipo: versaoEmpresa.tipo,
        inicio_vigencia: versaoEmpresa.inicio_vigencia,
      },
      (m) => setErroEmpresa(m || null),
      (dados) => setEmpresas((dados.empresas as Empresa[]) ?? []),
      "Não foi possível abrir a nova versão."
    );
    if (ok) setEmpresaEmEdicao(null);
  }

  async function alternarEmpresa(empresa: Empresa) {
    await enviar(
      `/api/estrutura/empresas/${empresa.id}`,
      "PATCH",
      { inativo: empresa.inativada_em === null },
      (m) => setErroEmpresa(m || null),
      (dados) => setEmpresas((dados.empresas as Empresa[]) ?? []),
      "Não foi possível mudar a situação."
    );
  }

  // ---------------------------------------------------------------- centro de custo

  async function criarCentro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const ok = await enviar(
      "/api/estrutura/centros-custo",
      "POST",
      {
        empresa_id: Number(novoCentro.empresa_id),
        codigo: novoCentro.codigo,
        nome: novoCentro.nome,
        inicio_vigencia: novoCentro.inicio_vigencia,
      },
      (m) => setErroCentro(m || null),
      (dados) => setCentros((dados.centros_custo as CentroCusto[]) ?? []),
      "Não foi possível criar o centro de custo."
    );
    if (ok) setNovoCentro(CENTRO_VAZIO);
  }

  async function renomearCentro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (centroEmEdicao === null) return;
    const ok = await enviar(
      `/api/estrutura/centros-custo/${centroEmEdicao}`,
      "POST",
      versaoCentro,
      (m) => setErroCentro(m || null),
      (dados) => setCentros((dados.centros_custo as CentroCusto[]) ?? []),
      "Não foi possível renomear."
    );
    if (ok) setCentroEmEdicao(null);
  }

  async function alternarCentro(centro: CentroCusto) {
    await enviar(
      `/api/estrutura/centros-custo/${centro.id}`,
      "PATCH",
      { inativo: centro.inativado_em === null },
      (m) => setErroCentro(m || null),
      (dados) => setCentros((dados.centros_custo as CentroCusto[]) ?? []),
      "Não foi possível mudar a situação."
    );
  }

  // ---------------------------------------------------------------- lotação

  async function criarLotacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const ok = await enviar(
      "/api/estabelecimentos",
      "POST",
      {
        cnpj: novaLotacao.cnpj,
        razao_social: novaLotacao.razao_social || undefined,
        unidade: novaLotacao.unidade,
        endereco_resumido: novaLotacao.endereco_resumido.trim() || undefined,
        inicio_vigencia: novaLotacao.inicio_vigencia,
      },
      (m) => setErroLotacao(m || null),
      (dados) => setLotacoes((dados.estabelecimentos as Lotacao[]) ?? []),
      "Não foi possível criar a lotação."
    );
    if (ok) setNovaLotacao(LOTACAO_VAZIA);
  }

  async function renomearLotacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (lotacaoEmEdicao === null) return;
    const ok = await enviar(
      `/api/estabelecimentos/${lotacaoEmEdicao}/versoes`,
      "POST",
      {
        razao_social: versaoLotacao.razao_social || undefined,
        unidade: versaoLotacao.unidade,
        endereco_resumido: versaoLotacao.endereco_resumido.trim() || undefined,
        inicio_vigencia: versaoLotacao.inicio_vigencia,
      },
      (m) => setErroLotacao(m || null),
      (dados) => setLotacoes((dados.estabelecimentos as Lotacao[]) ?? []),
      "Não foi possível abrir a nova versão."
    );
    if (ok) setLotacaoEmEdicao(null);
  }

  async function alternarLotacao(lotacao: Lotacao) {
    await enviar(
      `/api/estabelecimentos/${lotacao.id}`,
      "PATCH",
      { inativo: lotacao.inativado_em === null },
      (m) => setErroLotacao(m || null),
      (dados) => setLotacoes((dados.estabelecimentos as Lotacao[]) ?? []),
      "Não foi possível mudar a situação."
    );
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />
      <main className={estilos.conteudo}>
        <h1>Estrutura do grupo</h1>
        <p className={estilos.subtitulo}>
          Registro, lotação e centro de custo são três coisas diferentes e
          independentes: a pessoa pode estar registrada numa empresa do grupo,
          trabalhar no prédio de outra e ter o custo caindo num terceiro lugar.
        </p>

        {carregando && <p className={estilos.vazio}>Carregando…</p>}

        {podeEmpresa && (
          <section className={estilos.cartao}>
            <h2>Registro — empresas do grupo</h2>
            <p className={estilos.aviso}>
              Em qual empresa (qual CNPJ) a pessoa está registrada. Renomear é
              versão nova com vigência: o nome de fevereiro continua sendo o
              nome de fevereiro. Empresa com vínculo apontando não se exclui —
              se inativa. O CNPJ pode ficar em branco enquanto o DP não passa o
              número.
            </p>
            {empresas.length === 0 ? (
              <p className={estilos.vazio}>Nenhuma empresa cadastrada.</p>
            ) : (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Razão social</th>
                      <th>CNPJ</th>
                      <th>Tipo</th>
                      <th className={estilos.numerico}>Vínculos</th>
                      <th>Desde</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresas.map((empresa) => (
                      <tr
                        key={empresa.id}
                        className={
                          empresa.inativada_em ? estilos.linhaInativa : undefined
                        }
                      >
                        <td>
                          {empresa.nome_fantasia ?? "(sem versão ativa)"}{" "}
                          {empresa.inativada_em && (
                            <span className={estilos.seloInativo}>inativa</span>
                          )}
                        </td>
                        <td>{empresa.razao_social ?? "—"}</td>
                        <td>{formatarCnpj(empresa.cnpj)}</td>
                        <td>
                          {empresa.tipo
                            ? ROTULOS_TIPO_EMPRESA[empresa.tipo]
                            : "—"}
                        </td>
                        <td className={estilos.numerico}>{empresa.vinculos}</td>
                        <td>
                          {empresa.inicio_vigencia
                            ? formatarData(empresa.inicio_vigencia)
                            : "—"}
                        </td>
                        <td className={estilos.acoesLinha}>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            onClick={() => {
                              setEmpresaEmEdicao(empresa.id);
                              setVersaoEmpresa({
                                cnpj: empresa.cnpj ?? "",
                                razao_social: empresa.razao_social ?? "",
                                nome_fantasia: empresa.nome_fantasia ?? "",
                                tipo: empresa.tipo ?? "",
                                inicio_vigencia: "",
                              });
                            }}
                          >
                            Renomear
                          </button>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => void alternarEmpresa(empresa)}
                          >
                            {empresa.inativada_em ? "Reativar" : "Inativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {empresaEmEdicao !== null && (
              <form
                className={estilos.subFormulario}
                onSubmit={renomearEmpresa}
              >
                <h3>Nova versão da empresa</h3>
                <div className={estilos.formulario}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="evNome">
                      Nome fantasia
                    </label>
                    <input
                      className={estilos.campo}
                      id="evNome"
                      required
                      maxLength={120}
                      value={versaoEmpresa.nome_fantasia}
                      onChange={(e) =>
                        setVersaoEmpresa((a) => ({
                          ...a,
                          nome_fantasia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="evRazao">
                      Razão social
                    </label>
                    <input
                      className={estilos.campo}
                      id="evRazao"
                      maxLength={200}
                      value={versaoEmpresa.razao_social}
                      onChange={(e) =>
                        setVersaoEmpresa((a) => ({
                          ...a,
                          razao_social: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="evCnpj">
                      CNPJ
                    </label>
                    <input
                      className={estilos.campo}
                      id="evCnpj"
                      maxLength={18}
                      value={versaoEmpresa.cnpj}
                      onChange={(e) =>
                        setVersaoEmpresa((a) => ({ ...a, cnpj: e.target.value }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="evTipo">
                      Tipo
                    </label>
                    <select
                      className={estilos.campo}
                      id="evTipo"
                      required
                      value={versaoEmpresa.tipo}
                      onChange={(e) =>
                        setVersaoEmpresa((a) => ({
                          ...a,
                          tipo: e.target.value as TipoEmpresa,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {TIPOS_EMPRESA.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {ROTULOS_TIPO_EMPRESA[tipo]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="evInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="evInicio"
                      type="date"
                      required
                      value={versaoEmpresa.inicio_vigencia}
                      onChange={(e) =>
                        setVersaoEmpresa((a) => ({
                          ...a,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={salvando}
                >
                  {salvando ? "Salvando…" : "Abrir nova versão"}
                </button>{" "}
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => setEmpresaEmEdicao(null)}
                >
                  Cancelar
                </button>
              </form>
            )}

            <form className={estilos.formulario} onSubmit={criarEmpresa}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="empNome">
                  Nome fantasia
                </label>
                <input
                  className={estilos.campo}
                  id="empNome"
                  required
                  maxLength={120}
                  value={novaEmpresa.nome_fantasia}
                  onChange={(e) =>
                    setNovaEmpresa((a) => ({
                      ...a,
                      nome_fantasia: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="empRazao">
                  Razão social (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="empRazao"
                  maxLength={200}
                  value={novaEmpresa.razao_social}
                  onChange={(e) =>
                    setNovaEmpresa((a) => ({
                      ...a,
                      razao_social: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="empCnpj">
                  CNPJ (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="empCnpj"
                  maxLength={18}
                  value={novaEmpresa.cnpj}
                  onChange={(e) =>
                    setNovaEmpresa((a) => ({ ...a, cnpj: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="empTipo">
                  Tipo
                </label>
                <select
                  className={estilos.campo}
                  id="empTipo"
                  required
                  value={novaEmpresa.tipo}
                  onChange={(e) =>
                    setNovaEmpresa((a) => ({
                      ...a,
                      tipo: e.target.value as TipoEmpresa,
                    }))
                  }
                >
                  <option value="">Selecione…</option>
                  {TIPOS_EMPRESA.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {ROTULOS_TIPO_EMPRESA[tipo]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="empInicio">
                  Início da vigência
                </label>
                <input
                  className={estilos.campo}
                  id="empInicio"
                  type="date"
                  required
                  value={novaEmpresa.inicio_vigencia}
                  onChange={(e) =>
                    setNovaEmpresa((a) => ({
                      ...a,
                      inicio_vigencia: e.target.value,
                    }))
                  }
                />
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={salvando}
              >
                {salvando ? "Criando…" : "Criar empresa"}
              </button>
            </form>
            {erroEmpresa && <p className={estilos.erro}>{erroEmpresa}</p>}
          </section>
        )}

        {podeLotacao && (
          <section className={estilos.cartao}>
            <h2>Lotação — locais de trabalho</h2>
            <p className={estilos.aviso}>
              O prédio, a loja, o galpão. Um local pode abrigar gente registrada
              em empresas diferentes do grupo, e por isso não tem CNPJ próprio
              (o campo continua aqui, opcional, para quem quiser anotar o
              estabelecimento do eSocial).
            </p>
            {lotacoes.length === 0 ? (
              <p className={estilos.vazio}>Nenhum local cadastrado.</p>
            ) : (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Local</th>
                      <th>Endereço</th>
                      <th className={estilos.numerico}>Alocações</th>
                      <th>Desde</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotacoes.map((lotacao) => (
                      <tr
                        key={lotacao.id}
                        className={
                          lotacao.inativado_em ? estilos.linhaInativa : undefined
                        }
                      >
                        <td>
                          {lotacao.unidade ?? "(sem versão ativa)"}{" "}
                          {lotacao.inativado_em && (
                            <span className={estilos.seloInativo}>inativa</span>
                          )}
                        </td>
                        <td>{lotacao.endereco_resumido ?? "—"}</td>
                        <td className={estilos.numerico}>
                          {lotacao.alocacoes}
                        </td>
                        <td>
                          {lotacao.inicio_vigencia
                            ? formatarData(lotacao.inicio_vigencia)
                            : "—"}
                        </td>
                        <td className={estilos.acoesLinha}>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            onClick={() => {
                              setLotacaoEmEdicao(lotacao.id);
                              setVersaoLotacao({
                                cnpj: lotacao.cnpj ?? "",
                                razao_social: lotacao.razao_social ?? "",
                                unidade: lotacao.unidade ?? "",
                                endereco_resumido:
                                  lotacao.endereco_resumido ?? "",
                                inicio_vigencia: "",
                              });
                            }}
                          >
                            Renomear
                          </button>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => void alternarLotacao(lotacao)}
                          >
                            {lotacao.inativado_em ? "Reativar" : "Inativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {lotacaoEmEdicao !== null && (
              <form
                className={estilos.subFormulario}
                onSubmit={renomearLotacao}
              >
                <h3>Nova versão do local</h3>
                <div className={estilos.formulario}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="lvNome">
                      Nome do local
                    </label>
                    <input
                      className={estilos.campo}
                      id="lvNome"
                      required
                      maxLength={120}
                      value={versaoLotacao.unidade}
                      onChange={(e) =>
                        setVersaoLotacao((a) => ({
                          ...a,
                          unidade: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupoLargo}>
                    <label className={estilos.rotulo} htmlFor="lvEnd">
                      Endereço resumido
                    </label>
                    <input
                      className={estilos.campo}
                      id="lvEnd"
                      maxLength={300}
                      value={versaoLotacao.endereco_resumido}
                      onChange={(e) =>
                        setVersaoLotacao((a) => ({
                          ...a,
                          endereco_resumido: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="lvInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="lvInicio"
                      type="date"
                      required
                      value={versaoLotacao.inicio_vigencia}
                      onChange={(e) =>
                        setVersaoLotacao((a) => ({
                          ...a,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={salvando}
                >
                  {salvando ? "Salvando…" : "Abrir nova versão"}
                </button>{" "}
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => setLotacaoEmEdicao(null)}
                >
                  Cancelar
                </button>
              </form>
            )}

            <form className={estilos.formulario} onSubmit={criarLotacao}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="lotNome">
                  Nome do local
                </label>
                <input
                  className={estilos.campo}
                  id="lotNome"
                  required
                  maxLength={120}
                  value={novaLotacao.unidade}
                  onChange={(e) =>
                    setNovaLotacao((a) => ({ ...a, unidade: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupoLargo}>
                <label className={estilos.rotulo} htmlFor="lotEnd">
                  Endereço resumido (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="lotEnd"
                  maxLength={300}
                  value={novaLotacao.endereco_resumido}
                  onChange={(e) =>
                    setNovaLotacao((a) => ({
                      ...a,
                      endereco_resumido: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="lotCnpj">
                  CNPJ do estabelecimento (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="lotCnpj"
                  maxLength={18}
                  value={novaLotacao.cnpj}
                  onChange={(e) =>
                    setNovaLotacao((a) => ({ ...a, cnpj: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="lotInicio">
                  Início da vigência
                </label>
                <input
                  className={estilos.campo}
                  id="lotInicio"
                  type="date"
                  required
                  value={novaLotacao.inicio_vigencia}
                  onChange={(e) =>
                    setNovaLotacao((a) => ({
                      ...a,
                      inicio_vigencia: e.target.value,
                    }))
                  }
                />
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={salvando}
              >
                {salvando ? "Criando…" : "Criar local"}
              </button>
            </form>
            {erroLotacao && <p className={estilos.erro}>{erroLotacao}</p>}
          </section>
        )}

        {podeCentroCusto && (
          <section className={estilos.cartao}>
            <h2>Centro de custo</h2>
            <p className={estilos.aviso}>
              Onde o custo da pessoa cai. O código é a identidade contábil e não
              muda; o nome é versionado — renomear hoje não reescreve a folha de
              fevereiro. A empresa é quem mantém o centro no plano de contas, e
              uma alocação pode apontar para centro de outra empresa do grupo
              (serviço compartilhado).
            </p>
            {centros.length === 0 ? (
              <p className={estilos.vazio}>Nenhum centro de custo cadastrado.</p>
            ) : (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome</th>
                      <th>Empresa</th>
                      <th className={estilos.numerico}>Alocações</th>
                      <th>Desde</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {centros.map((centro) => (
                      <tr
                        key={centro.id}
                        className={
                          centro.inativado_em || centro.empresa_inativada_em
                            ? estilos.linhaInativa
                            : undefined
                        }
                      >
                        <td>
                          {centro.codigo}{" "}
                          {centro.inativado_em && (
                            <span className={estilos.seloInativo}>inativo</span>
                          )}
                          {/* O centro pode estar ativo e mesmo assim fora dos
                              seletores, porque a empresa que o mantém saiu de
                              operação. A linha continua aqui — inativar não
                              apaga o passado, só tira da escolha nova. */}
                          {!centro.inativado_em && centro.empresa_inativada_em && (
                            <span className={estilos.seloInativo}>
                              empresa inativa
                            </span>
                          )}
                        </td>
                        <td>{centro.nome ?? "(sem versão ativa)"}</td>
                        <td>{centro.empresa_nome ?? "—"}</td>
                        <td className={estilos.numerico}>{centro.alocacoes}</td>
                        <td>
                          {centro.inicio_vigencia
                            ? formatarData(centro.inicio_vigencia)
                            : "—"}
                        </td>
                        <td className={estilos.acoesLinha}>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            onClick={() => {
                              setCentroEmEdicao(centro.id);
                              setVersaoCentro({
                                nome: centro.nome ?? "",
                                inicio_vigencia: "",
                              });
                            }}
                          >
                            Renomear
                          </button>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => void alternarCentro(centro)}
                          >
                            {centro.inativado_em ? "Reativar" : "Inativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {centroEmEdicao !== null && (
              <form className={estilos.subFormulario} onSubmit={renomearCentro}>
                <h3>Novo nome do centro de custo</h3>
                <div className={estilos.formulario}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="cvNome">
                      Nome
                    </label>
                    <input
                      className={estilos.campo}
                      id="cvNome"
                      required
                      maxLength={120}
                      value={versaoCentro.nome}
                      onChange={(e) =>
                        setVersaoCentro((a) => ({ ...a, nome: e.target.value }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="cvInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="cvInicio"
                      type="date"
                      required
                      value={versaoCentro.inicio_vigencia}
                      onChange={(e) =>
                        setVersaoCentro((a) => ({
                          ...a,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={salvando}
                >
                  {salvando ? "Salvando…" : "Renomear"}
                </button>{" "}
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => setCentroEmEdicao(null)}
                >
                  Cancelar
                </button>
              </form>
            )}

            <form className={estilos.formulario} onSubmit={criarCentro}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="ccEmpresa">
                  Empresa que mantém
                </label>
                <select
                  className={estilos.campo}
                  id="ccEmpresa"
                  required
                  value={novoCentro.empresa_id}
                  onChange={(e) =>
                    setNovoCentro((a) => ({ ...a, empresa_id: e.target.value }))
                  }
                >
                  <option value="">Selecione…</option>
                  {empresas
                    .filter((empresa) => empresa.inativada_em === null)
                    .map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome_fantasia ?? `empresa ${empresa.id}`}
                      </option>
                    ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="ccCodigo">
                  Código
                </label>
                <input
                  className={estilos.campo}
                  id="ccCodigo"
                  required
                  maxLength={30}
                  value={novoCentro.codigo}
                  onChange={(e) =>
                    setNovoCentro((a) => ({ ...a, codigo: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="ccNome">
                  Nome
                </label>
                <input
                  className={estilos.campo}
                  id="ccNome"
                  required
                  maxLength={120}
                  value={novoCentro.nome}
                  onChange={(e) =>
                    setNovoCentro((a) => ({ ...a, nome: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="ccInicio">
                  Início da vigência
                </label>
                <input
                  className={estilos.campo}
                  id="ccInicio"
                  type="date"
                  required
                  value={novoCentro.inicio_vigencia}
                  onChange={(e) =>
                    setNovoCentro((a) => ({
                      ...a,
                      inicio_vigencia: e.target.value,
                    }))
                  }
                />
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={salvando}
              >
                {salvando ? "Criando…" : "Criar centro de custo"}
              </button>
            </form>
            {erroCentro && <p className={estilos.erro}>{erroCentro}</p>}
          </section>
        )}

        {podeCentroCusto && !podeEmpresa && (
          <p className={estilos.vazio}>
            Para criar centro de custo é preciso escolher a empresa que o
            mantém, e a lista de empresas exige a chave rh.empresa.administrar.
          </p>
        )}

        {podeImportar && (
          <BlocoCarga
            titulo="Carga inicial — importar estrutura por planilha"
            rota="/api/estrutura/importacao"
            colunas="empresa ; cnpj ; razao_social ; tipo ; estabelecimento ; cc_codigo ; cc_nome"
            explicacao={
              "Cada linha pode trazer só a empresa, ou a empresa com uma unidade " +
              "e/ou um centro de custo. O tipo (matriz/filial) só é exigido quando " +
              "a linha cria a empresa; o CNPJ pode ficar vazio."
            }
            exemplo={"Supply;41235678000101;Fast Supply Ltda;matriz;Matriz Centro;CC-1000;Operação Matriz Centro"}
            aoImportar={() => void carregar()}
          />
        )}
      </main>
    </div>
  );
}
