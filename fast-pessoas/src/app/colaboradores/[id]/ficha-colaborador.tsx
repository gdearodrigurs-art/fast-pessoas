"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import {
  GENEROS,
  Genero,
  MOTIVOS_POSICAO,
  MotivoPosicao,
  ROTULOS_GENERO,
  ROTULOS_MOTIVO_POSICAO,
  ROTULOS_OCORRENCIA,
  ROTULOS_STATUS,
  ROTULOS_STATUS_ACAO,
  ROTULOS_VINCULO,
  STATUS_COLABORADOR,
  StatusAcao,
  StatusColaborador,
  TIPOS_OCORRENCIA,
  TIPOS_VINCULO,
  TipoOcorrencia,
  TipoVinculo,
  hojeNaOperacao,
} from "@/dominios/colaboradores/esquemas";
import { formatarMinutos } from "@/dominios/ponto/esquemas";
import type { PermissoesFicha } from "./page";
import estilos from "./page.module.css";

/**
 * Bloco de ponto da ficha. Busca o próprio dado no domínio DONO
 * (`/api/ponto/resumo/[id]`, chave `ponto.ver.proprio` + alcance conferido no
 * serviço). Quem não alcança recebe 403 e o cartão simplesmente não aparece —
 * ausência, não máscara.
 */
interface ResumoPontoFicha {
  saldo_banco_minutos: number;
  media_he_por_dia_util_minutos_ultimo_mes: number;
  total_he_ultimo_mes_minutos: number;
  ultima_apuracao: { competencia: string } | null;
  intercorrencias_abertas: number;
  espelho_href: string;
}

function BlocoPontoFicha({ colaboradorId }: { colaboradorId: number }) {
  const [resumo, setResumo] = useState<ResumoPontoFicha | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/ponto/resumo/${colaboradorId}`, {
          cache: "no-store",
        });
        if (!ativo || !resposta.ok) return;
        setResumo((await resposta.json()) as ResumoPontoFicha);
      } catch {
        /* ficha segue sem o bloco de ponto */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [colaboradorId]);

  if (resumo === null) return null;
  return (
    <div className={estilos.cartao} style={{ marginTop: 16 }}>
      <h2>Ponto e banco de horas</h2>
      <div className={estilos.gradeDados}>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Saldo do banco de horas</div>
          <div className={estilos.val}>
            {formatarMinutos(resumo.saldo_banco_minutos)}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Hora extra no último mês</div>
          <div className={estilos.val}>
            {formatarMinutos(resumo.total_he_ultimo_mes_minutos)}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Média de HE por dia</div>
          <div className={estilos.val}>
            {formatarMinutos(resumo.media_he_por_dia_util_minutos_ultimo_mes)}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Última competência apurada</div>
          <div className={estilos.val}>
            {resumo.ultima_apuracao?.competencia ?? "—"}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Intercorrências abertas</div>
          <div className={estilos.val}>{resumo.intercorrencias_abertas}</div>
        </div>
      </div>
      <p style={{ marginTop: 12 }}>
        <Link className={estilos.botaoLinha} href={resumo.espelho_href}>
          Abrir espelho de ponto
        </Link>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ bloco disciplinar (restrito — eixo 4/8)
// Conteúdo SEMPRE restrito (dp/diretoria). O cartão busca o próprio dado
// (`/api/disciplinar?colaborador_id=`, chave `rh.disciplinar.ver` + trilha de
// leitura no serviço). 403 => o cartão simplesmente NÃO aparece — ausência, não
// máscara. O escalonamento é MANUAL: mostramos o histórico por tipo para o DP
// decidir; o sistema não escalona sozinho.

interface MedidaFicha {
  id: number;
  tipo_chave: string;
  tipo_nome: string;
  com_periodo: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  aplicada_em: string;
  inicio: string | null;
  fim: string | null;
  registrado_por_nome: string;
  registrado_em: string;
}

interface ContagemTipoFicha {
  tipo_chave: string;
  nome: string;
  total: number;
}

interface TipoFicha {
  chave: string;
  nome: string;
  com_periodo: boolean;
}

interface VisaoDisciplinar {
  medidas: MedidaFicha[];
  historico: ContagemTipoFicha[];
  tipos: TipoFicha[];
}

const MEDIDA_EM_BRANCO = {
  tipo_chave: "",
  descricao: "",
  impacto: "",
  acao_combinada: "",
  aplicada_em: "",
  inicio: "",
  fim: "",
};

function BlocoDisciplinarFicha({
  colaboradorId,
  podeRegistrar,
}: {
  colaboradorId: number;
  podeRegistrar: boolean;
}) {
  const [dados, setDados] = useState<VisaoDisciplinar | null>(null);
  const [visivel, setVisivel] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [nova, setNova] = useState({ ...MEDIDA_EM_BRANCO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Erro de CARGA (distinto do `erro` do formulário): 5xx/timeout/rede não
  // escondem o cartão — só sinalizam para tentar de novo. Só o 403 esconde.
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  // Recarrega após registrar. Fora de effect (é ação de usuário) — pode
  // setState direto.
  async function recarregar() {
    try {
      const resposta = await fetch(
        `/api/disciplinar?colaborador_id=${colaboradorId}`,
        { cache: "no-store" }
      );
      if (resposta.status === 403) {
        // Só o 403 esconde: ausência legítima da chave.
        setVisivel(false);
        return;
      }
      if (!resposta.ok) {
        // 5xx/rede: instabilidade, não ausência — mantém o cartão e sinaliza.
        setErroCarregar("Não foi possível carregar. Tente novamente.");
        return;
      }
      setErroCarregar(null);
      setDados((await resposta.json()) as VisaoDisciplinar);
    } catch {
      setErroCarregar("Falha de conexão. Tente novamente.");
    }
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/disciplinar?colaborador_id=${colaboradorId}`,
          { cache: "no-store" }
        );
        if (!ativo) return;
        if (resposta.status === 403) {
          // Só o 403 esconde o cartão: ausência legítima da chave. Qualquer
          // outro erro (5xx/timeout/rede) é instabilidade, NÃO "ficha limpa" —
          // esconder aqui seria falso-negativo (o DP lê ausência onde há dado).
          setVisivel(false);
          return;
        }
        if (!resposta.ok) {
          setErroCarregar("Não foi possível carregar. Tente novamente.");
          return;
        }
        setDados((await resposta.json()) as VisaoDisciplinar);
      } catch {
        if (ativo) setErroCarregar("Falha de conexão. Tente novamente.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [colaboradorId]);

  const tipoSelecionado = dados?.tipos.find(
    (tipo) => tipo.chave === nova.tipo_chave
  );

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/disciplinar?colaborador_id=${colaboradorId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo_chave: nova.tipo_chave,
            descricao: nova.descricao,
            aplicada_em: nova.aplicada_em,
            impacto: nova.impacto.trim() || undefined,
            acao_combinada: nova.acao_combinada.trim() || undefined,
            inicio: tipoSelecionado?.com_periodo
              ? nova.inicio || undefined
              : undefined,
            fim: tipoSelecionado?.com_periodo ? nova.fim || undefined : undefined,
          }),
        }
      );
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        return;
      }
      setNova({ ...MEDIDA_EM_BRANCO });
      setFormAberto(false);
      await recarregar();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  if (!visivel) return null;

  return (
    <div className={estilos.cartao} style={{ marginTop: 16 }}>
      <div className={estilos.itemTopo} style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Disciplinar</h2>
        <span className={estilos.tagRestrito}>RESTRITA · leitura logada</span>
      </div>

      {erroCarregar !== null && dados === null ? (
        <div>
          <p className={estilos.erro}>{erroCarregar}</p>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => {
              setErroCarregar(null);
              void recarregar();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : dados === null ? (
        <p className={estilos.vazio}>Carregando…</p>
      ) : (
        <>
          {dados.historico.length > 0 && (
            <p className={estilos.itemExtra} style={{ marginTop: 0 }}>
              Histórico por tipo:{" "}
              {dados.historico
                .map((linha) => `${linha.nome} (${linha.total})`)
                .join(" · ")}
            </p>
          )}

          {podeRegistrar && !formAberto && (
            <p style={{ margin: "10px 0" }}>
              <button
                className={estilos.botao}
                type="button"
                onClick={() => {
                  setErro(null);
                  setFormAberto(true);
                }}
              >
                + Registrar medida
              </button>
            </p>
          )}

          {podeRegistrar && formAberto && (
            <form className={estilos.formulario} onSubmit={enviar}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="mdTipo">
                  Tipo
                </label>
                <select
                  className={estilos.campo}
                  id="mdTipo"
                  required
                  value={nova.tipo_chave}
                  onChange={(e) =>
                    setNova((atual) => ({ ...atual, tipo_chave: e.target.value }))
                  }
                >
                  <option value="">selecione…</option>
                  {dados.tipos.map((tipo) => (
                    <option key={tipo.chave} value={tipo.chave}>
                      {tipo.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="mdData">
                  Data do fato
                </label>
                <input
                  className={estilos.campo}
                  id="mdData"
                  type="date"
                  required
                  max={HOJE_NA_OPERACAO}
                  value={nova.aplicada_em}
                  onChange={(e) =>
                    setNova((atual) => ({
                      ...atual,
                      aplicada_em: e.target.value,
                    }))
                  }
                />
              </div>
              {tipoSelecionado?.com_periodo && (
                <>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="mdInicio">
                      Início do período
                    </label>
                    <input
                      className={estilos.campo}
                      id="mdInicio"
                      type="date"
                      required
                      value={nova.inicio}
                      onChange={(e) =>
                        setNova((atual) => ({ ...atual, inicio: e.target.value }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="mdFim">
                      Fim do período
                    </label>
                    <input
                      className={estilos.campo}
                      id="mdFim"
                      type="date"
                      required
                      value={nova.fim}
                      onChange={(e) =>
                        setNova((atual) => ({ ...atual, fim: e.target.value }))
                      }
                    />
                  </div>
                </>
              )}
              <div className={estilos.campoGrupoLargo}>
                <label className={estilos.rotulo} htmlFor="mdDescricao">
                  Descrição (fato, motivo)
                </label>
                <textarea
                  className={estilos.campo}
                  id="mdDescricao"
                  rows={3}
                  required
                  maxLength={4000}
                  value={nova.descricao}
                  onChange={(e) =>
                    setNova((atual) => ({ ...atual, descricao: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="mdImpacto">
                  Impacto (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="mdImpacto"
                  type="text"
                  maxLength={2000}
                  value={nova.impacto}
                  onChange={(e) =>
                    setNova((atual) => ({ ...atual, impacto: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="mdAcao">
                  Ação combinada (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="mdAcao"
                  type="text"
                  maxLength={2000}
                  value={nova.acao_combinada}
                  onChange={(e) =>
                    setNova((atual) => ({
                      ...atual,
                      acao_combinada: e.target.value,
                    }))
                  }
                />
              </div>
              {erro && <p className={estilos.erro}>{erro}</p>}
              <button className={estilos.botao} type="submit" disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar"}
              </button>
              <button
                className={estilos.botaoLinha}
                type="button"
                onClick={() => setFormAberto(false)}
              >
                Cancelar
              </button>
            </form>
          )}

          {dados.medidas.length === 0 ? (
            <p className={estilos.vazio}>Nenhuma medida disciplinar registrada.</p>
          ) : (
            dados.medidas.map((medida) => (
              <div key={medida.id} className={estilos.itemRegistro}>
                <div className={estilos.itemTopo}>
                  <span className={`${estilos.clf} ${estilos.clfAlerta}`}>
                    {medida.tipo_nome}
                  </span>
                  <span>{formatarData(medida.aplicada_em)}</span>
                  <span>registrado por {medida.registrado_por_nome}</span>
                </div>
                <div className={estilos.itemTexto}>{medida.descricao}</div>
                {medida.inicio && medida.fim && (
                  <div className={estilos.itemExtra}>
                    Período: {formatarData(medida.inicio)} a{" "}
                    {formatarData(medida.fim)}
                  </div>
                )}
                {medida.impacto && (
                  <div className={estilos.itemExtra}>
                    Impacto: {medida.impacto}
                  </div>
                )}
                {medida.acao_combinada && (
                  <div className={estilos.itemExtra}>
                    Ação combinada: {medida.acao_combinada}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ bloco de posse de patrimônio (0081)
// Patrimônio da empresa em posse do colaborador (notebook, ferramenta, carro).
// Menos sensível que o disciplinar: dp+rh veem e registram (rh.posse.ver /
// rh.posse.registrar). O cartão busca o próprio dado (/api/posse?colaborador_id=)
// e usa o MESMO loader do BlocoDisciplinarFicha: 403 => o cartão some (ausência
// legítima da chave); 5xx/timeout/rede => erro visível + "tentar novamente" —
// esconder ali seria falso-negativo. A categoria vem do catálogo administrável
// rh.categoria_devolucao (0054), o mesmo do checklist de desligamento.

interface ItemPosseFicha {
  id: number;
  categoria_chave: string;
  categoria_nome: string;
  descricao: string;
  quantidade: number;
  numero_serie: string | null;
  data_entrega: string;
  termo_documento_id: number | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  devolvido_em: string | null;
}

interface CategoriaPosseFicha {
  chave: string;
  nome: string;
}

interface VisaoPosse {
  itens: ItemPosseFicha[];
  categorias: CategoriaPosseFicha[];
}

const POSSE_EM_BRANCO = {
  categoria_chave: "",
  descricao: "",
  quantidade: "",
  numero_serie: "",
  data_entrega: "",
  termo_documento_id: "",
};

function BlocoPosseFicha({
  colaboradorId,
  podeRegistrar,
  ehPropriaFicha,
}: {
  colaboradorId: number;
  podeRegistrar: boolean;
  /** A ciência é ato do TITULAR: o botão só aparece na própria ficha (o
   *  serviço reconfere e devolve 404 a não-titular). */
  ehPropriaFicha: boolean;
}) {
  const [dados, setDados] = useState<VisaoPosse | null>(null);
  const [visivel, setVisivel] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [novo, setNovo] = useState({ ...POSSE_EM_BRANCO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Erro de CARGA (distinto do `erro` do formulário): 5xx/timeout/rede não
  // escondem o cartão — só sinalizam para tentar de novo. Só o 403 esconde.
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [acaoEmCurso, setAcaoEmCurso] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  // Recarrega após registrar/devolver/ciência. Fora de effect (é ação de
  // usuário) — pode setState direto.
  async function recarregar() {
    try {
      const resposta = await fetch(`/api/posse?colaborador_id=${colaboradorId}`, {
        cache: "no-store",
      });
      if (resposta.status === 403) {
        // Só o 403 esconde: ausência legítima da chave.
        setVisivel(false);
        return;
      }
      if (!resposta.ok) {
        // 5xx/rede: instabilidade, não ausência — mantém o cartão e sinaliza.
        setErroCarregar("Não foi possível carregar. Tente novamente.");
        return;
      }
      setErroCarregar(null);
      setDados((await resposta.json()) as VisaoPosse);
    } catch {
      setErroCarregar("Falha de conexão. Tente novamente.");
    }
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/posse?colaborador_id=${colaboradorId}`,
          { cache: "no-store" }
        );
        if (!ativo) return;
        if (resposta.status === 403) {
          // Só o 403 esconde o cartão: ausência legítima da chave. Qualquer
          // outro erro (5xx/timeout/rede) é instabilidade, NÃO "sem itens" —
          // esconder aqui seria falso-negativo.
          setVisivel(false);
          return;
        }
        if (!resposta.ok) {
          setErroCarregar("Não foi possível carregar. Tente novamente.");
          return;
        }
        setDados((await resposta.json()) as VisaoPosse);
      } catch {
        if (ativo) setErroCarregar("Falha de conexão. Tente novamente.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [colaboradorId]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/posse?colaborador_id=${colaboradorId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoria_chave: novo.categoria_chave,
            descricao: novo.descricao,
            // Em branco vira chave ausente — assim o erro é "Informe a
            // quantidade" e não "Quantidade mínima: 1" (Number("") vira zero).
            quantidade:
              novo.quantidade.trim() === ""
                ? undefined
                : Number(novo.quantidade),
            numero_serie: novo.numero_serie.trim() || undefined,
            data_entrega: novo.data_entrega,
            termo_documento_id: novo.termo_documento_id
              ? Number(novo.termo_documento_id)
              : null,
          }),
        }
      );
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        return;
      }
      setNovo({ ...POSSE_EM_BRANCO });
      setFormAberto(false);
      await recarregar();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function agir(itemId: number, acao: "devolucao" | "ciencia") {
    setErroAcao(null);
    setAcaoEmCurso(itemId);
    try {
      const resposta = await fetch(`/api/posse/${itemId}/${acao}`, {
        method: "POST",
      });
      if (!resposta.ok) {
        setErroAcao(await lerErro(resposta));
        return;
      }
      await recarregar();
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setAcaoEmCurso(null);
    }
  }

  if (!visivel) return null;

  return (
    <div className={estilos.cartao} style={{ marginTop: 16 }}>
      <h2>Patrimônio em posse</h2>

      {erroCarregar !== null && dados === null ? (
        <div>
          <p className={estilos.erro}>{erroCarregar}</p>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => {
              setErroCarregar(null);
              void recarregar();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : dados === null ? (
        <p className={estilos.vazio}>Carregando…</p>
      ) : (
        <>
          {podeRegistrar && !formAberto && (
            <p style={{ margin: "10px 0" }}>
              <button
                className={estilos.botao}
                type="button"
                onClick={() => {
                  setErro(null);
                  setFormAberto(true);
                }}
              >
                + Registrar entrega
              </button>
            </p>
          )}

          {podeRegistrar && formAberto && (
            <form className={estilos.formulario} onSubmit={enviar}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="psCategoria">
                  Categoria
                </label>
                {/* As opções vêm do catálogo administrável (só as ativas),
                    nunca de uma lista escrita aqui. */}
                <select
                  className={estilos.campo}
                  id="psCategoria"
                  required
                  value={novo.categoria_chave}
                  onChange={(e) =>
                    setNovo((atual) => ({
                      ...atual,
                      categoria_chave: e.target.value,
                    }))
                  }
                >
                  <option value="">selecione…</option>
                  {dados.categorias.map((categoria) => (
                    <option key={categoria.chave} value={categoria.chave}>
                      {categoria.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="psDescricao">
                  Item
                </label>
                <input
                  className={estilos.campo}
                  id="psDescricao"
                  type="text"
                  required
                  maxLength={500}
                  placeholder="ex.: Notebook Dell i7 patrimônio 123"
                  value={novo.descricao}
                  onChange={(e) =>
                    setNovo((atual) => ({ ...atual, descricao: e.target.value }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="psQuantidade">
                  Quantidade
                </label>
                <input
                  className={estilos.campo}
                  id="psQuantidade"
                  type="number"
                  required
                  min={1}
                  max={999}
                  value={novo.quantidade}
                  onChange={(e) =>
                    setNovo((atual) => ({
                      ...atual,
                      quantidade: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="psSerie">
                  Nº de série / patrimônio (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="psSerie"
                  type="text"
                  maxLength={120}
                  value={novo.numero_serie}
                  onChange={(e) =>
                    setNovo((atual) => ({
                      ...atual,
                      numero_serie: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="psData">
                  Data da entrega
                </label>
                <input
                  className={estilos.campo}
                  id="psData"
                  type="date"
                  required
                  max={HOJE_NA_OPERACAO}
                  value={novo.data_entrega}
                  onChange={(e) =>
                    setNovo((atual) => ({
                      ...atual,
                      data_entrega: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="psTermo">
                  Termo no GED — nº do documento (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="psTermo"
                  type="number"
                  min={1}
                  value={novo.termo_documento_id}
                  onChange={(e) =>
                    setNovo((atual) => ({
                      ...atual,
                      termo_documento_id: e.target.value,
                    }))
                  }
                />
              </div>
              {erro && <p className={estilos.erro}>{erro}</p>}
              <button className={estilos.botao} type="submit" disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar"}
              </button>
              <button
                className={estilos.botaoLinha}
                type="button"
                onClick={() => setFormAberto(false)}
              >
                Cancelar
              </button>
            </form>
          )}

          {dados.itens.length === 0 ? (
            <p className={estilos.vazio}>
              Nenhum patrimônio registrado em posse deste colaborador.
            </p>
          ) : (
            dados.itens.map((item) => (
              <div key={item.id} className={estilos.itemRegistro}>
                <div className={estilos.itemTopo}>
                  <span className={`${estilos.clf} ${estilos.clfNeutro}`}>
                    {item.categoria_nome}
                  </span>
                  <span>entregue em {formatarData(item.data_entrega)}</span>
                  <span>
                    {item.devolvido_em
                      ? `devolvido em ${formatarDataEvento(item.devolvido_em)}`
                      : "em uso"}
                  </span>
                </div>
                <div className={estilos.itemTexto}>
                  {item.descricao} (qtd {item.quantidade})
                  {item.numero_serie ? ` · nº ${item.numero_serie}` : ""}
                </div>
                <div className={estilos.itemExtra}>
                  Termo:{" "}
                  {item.termo_documento_id ? (
                    <a
                      href={`/api/documentos/${item.termo_documento_id}/download`}
                    >
                      {item.termo_titulo ?? `#${item.termo_documento_id}`}
                    </a>
                  ) : (
                    "sem termo no GED"
                  )}
                  {" · Ciência: "}
                  {item.ciencia_registrada
                    ? "registrada"
                    : item.termo_documento_id
                      ? "pendente (o titular dá a ciência sobre o termo)"
                      : "sem termo, sem ciência"}
                </div>
                {podeRegistrar && item.devolvido_em === null && (
                  <p style={{ margin: "8px 0 0" }}>
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      disabled={acaoEmCurso === item.id}
                      onClick={() => void agir(item.id, "devolucao")}
                    >
                      {acaoEmCurso === item.id
                        ? "Registrando…"
                        : "Registrar devolução"}
                    </button>
                    {ehPropriaFicha &&
                      item.termo_documento_id !== null &&
                      !item.ciencia_registrada && (
                        <button
                          className={estilos.botaoLinha}
                          type="button"
                          disabled={acaoEmCurso === item.id}
                          onClick={() => void agir(item.id, "ciencia")}
                          title="Aceite eletrônico: só o titular registra a própria ciência"
                        >
                          Dar ciência
                        </button>
                      )}
                  </p>
                )}
              </div>
            ))
          )}
          {erroAcao && <p className={estilos.erro}>{erroAcao}</p>}
        </>
      )}
    </div>
  );
}

/** RCF vigente do cargo da posição atual — documento de gestão, não sensível. */
interface Rcf {
  cargo_id: number;
  versao_id: number;
  nome: string;
  setor: string | null;
  cargo_lider_nome: string | null;
  tipo_contrato_previsto: TipoVinculo | null;
  missao: string | null;
  atividades: string[];
  cha: {
    conhecimentos?: string[];
    habilidades?: string[];
    atitudes?: string[];
  };
  observacoes: string | null;
  descricao: string | null;
  inicio_vigencia: string;
}

interface Ficha {
  id: number;
  matricula: string;
  matricula_esocial: string;
  cpf: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  data_nascimento: string | null;
  rcf: Rcf | null;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  email: string;
  usuario_ativo: boolean;
  cargo_nome: string | null;
  /** REGISTRO vigente: em qual empresa do grupo este vínculo está registrado. */
  empresa_id: number | null;
  empresa_nome: string | null;
  /** LOTAÇÃO vigente: o local físico. */
  unidade: string | null;
  /** CENTRO DE CUSTO vigente: código e nome. */
  centro_custo: string | null;
  centro_custo_nome: string | null;
  gestor_id: number | null;
  gestor_nome: string | null;
  ultimo_feedback_em: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
  feedback_vencido: boolean;
  /** A pessoa por trás desta ficha, e todos os contratos dela no grupo. */
  pessoa_id: number;
  vinculos: VinculoDaPessoa[];
}

interface VinculoDaPessoa {
  id: number;
  matricula: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  data_desligamento: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  sucede_vinculo_id: number | null;
  sucedido_por_vinculo_id: number | null;
}

interface Evento {
  id: number;
  tipo: string;
  ocorrido_em: string;
  resumo: string;
  /** Em qual contrato o fato caiu — a linha do tempo atravessa vínculos. */
  vinculo_id: number;
  vinculo_matricula: string;
}

interface Ocorrencia {
  id: number;
  tipo: TipoOcorrencia;
  restrita: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  ocorrida_em: string;
  registrado_por_nome: string;
}

interface Feedback {
  id: number;
  realizado_em: string;
  resumo: string;
  registrado_por_nome: string;
}

interface Cadencia {
  ultimo_em: string | null;
  dias_desde: number | null;
  vencido: boolean;
  parametro_dias: number;
}

interface Acao {
  id: number;
  descricao: string;
  prazo: string;
  status: StatusAcao;
  responsavel_nome: string;
  vencida: boolean;
}

interface Posicao {
  id: number;
  cargo_id: number;
  cargo_nome: string;
  salario: number;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface RelacaoGestor {
  id: number;
  gestor_colaborador_id: number;
  gestor_nome: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

/** Uma linha de vigência da alocação: os três campos juntos. */
interface Lotacao {
  id: number;
  empresa_id: number;
  empresa_nome: string | null;
  estabelecimento_id: number;
  unidade: string | null;
  centro_custo_id: number;
  centro_custo: string;
  centro_custo_nome: string | null;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

const ALOCACAO_VAZIA = {
  empresa_id: "",
  estabelecimento_id: "",
  centro_custo_id: "",
  inicio_vigencia: "",
};

/**
 * SEMEADURA da nova alocação — o padrão de SecaoJornadas (ponto) e
 * SecaoParametrosGerais (folha): o formulário NÃO inventa valor de negócio; ele
 * repete o que está VIGENTE agora, para quem só quer trocar um dos três não ter
 * que redigitar os outros dois. Sem alocação vigente, os três nascem vazios.
 *
 * `inicio_vigencia` NUNCA é semeado — hoje não é "a data certa" de nada, e
 * chutá-la abriria uma vigência com data que ninguém escolheu.
 */
function semearAlocacao(historico: Lotacao[]): typeof ALOCACAO_VAZIA {
  const vigente =
    historico.find((linha) => linha.fim_vigencia === null) ??
    [...historico].sort((a, b) =>
      a.inicio_vigencia === b.inicio_vigencia
        ? b.id - a.id
        : a.inicio_vigencia < b.inicio_vigencia
          ? 1
          : -1
    )[0];
  if (!vigente) return ALOCACAO_VAZIA;
  return {
    empresa_id: String(vigente.empresa_id),
    estabelecimento_id: String(vigente.estabelecimento_id),
    centro_custo_id: String(vigente.centro_custo_id),
    inicio_vigencia: "",
  };
}

interface EmpresaOpcao {
  id: number;
  nome: string;
  cnpj: string | null;
}

interface CentroCustoOpcao {
  id: number;
  codigo: string;
  nome: string;
  empresa_id: number;
  empresa_nome: string | null;
}

interface CargoOpcao {
  id: number;
  nome: string | null;
}

interface EstabelecimentoOpcao {
  id: number;
  unidade: string | null;
  cnpj: string | null;
  inativado_em: string | null;
}

interface ColaboradorOpcao {
  id: number;
  nome_completo: string;
  matricula: string;
}

type Aba = "dados" | "linha" | "ocorrencias" | "feedbacks" | "admin";

const ESTILO_PILL: Record<StatusColaborador, string> = {
  ativo: estilos.pillAtivo,
  afastado: estilos.pillAfastado,
  desligado: estilos.pillDesligado,
};

const ESTILO_CLF: Record<TipoOcorrencia, string> = {
  positivo: estilos.clfPositivo,
  negativo: estilos.clfNegativo,
  neutro: estilos.clfNeutro,
  alerta: estilos.clfAlerta,
};

const ESTILO_ACAO: Record<StatusAcao, string> = {
  aberta: estilos.etiquetaAberta,
  concluida: estilos.etiquetaConcluida,
  cancelada: estilos.etiquetaCancelada,
};

const TIPOS_EVENTO: Record<string, { rotulo: string; simbolo: string; cor: string }> = {
  admissao: { rotulo: "Admissão", simbolo: "⚑", cor: "#1a7f37" },
  desligamento: { rotulo: "Desligamento", simbolo: "✕", cor: "#c62828" },
  promocao: { rotulo: "Mudança de cargo", simbolo: "▲", cor: "#6d4fc2" },
  posicao_inicial: { rotulo: "Posição inicial", simbolo: "★", cor: "#6d4fc2" },
  reajuste: { rotulo: "Reajuste", simbolo: "$", cor: "#b58500" },
  feedback: { rotulo: "Feedback", simbolo: "✎", cor: "#1565c0" },
  ocorrencia: { rotulo: "Ocorrência", simbolo: "⚠", cor: "#c96f00" },
  // Eco NEUTRO da medida disciplinar: chega só a quem tem a chave restrita (o
  // servidor filtra a linha por payload.restrita); o motivo nunca entra no
  // resumo — o detalhe fica no cartão Disciplinar, com leitura logada.
  disciplinar: { rotulo: "Medida disciplinar", simbolo: "§", cor: "#8e24aa" },
  mudanca_gestor: { rotulo: "Mudança de gestor", simbolo: "⇄", cor: "#00838f" },
  transferencia: { rotulo: "Transferência", simbolo: "➜", cor: "#00838f" },
  transferencia_continuidade: {
    rotulo: "Continuidade (mudança de registro)",
    simbolo: "➜",
    cor: "#00838f",
  },
  alteracao_status: { rotulo: "Status", simbolo: "•", cor: "#6b6763" },
  alteracao_vinculo: { rotulo: "Vínculo", simbolo: "•", cor: "#6b6763" },
};

const EVENTO_PADRAO = { rotulo: "Evento", simbolo: "•", cor: "#6b6763" };

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Datas de evento vêm em UTC; instantes reais são exibidos em
// America/Sao_Paulo. Fato datado (sem hora) é gravado à meia-noite UTC —
// nesse caso exibimos a própria data do fato, sem deslocar o fuso.
const formatoDataSp = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatoDataUtc = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Teto dos três campos de vigência que gravam DIRETO na ficha (posição, gestor
// e alocação). O servidor é quem manda — `esquemaVigenciaNaoFutura` recusa data
// futura porque o sistema inteiro lê "vigente" por `fim_vigencia IS NULL` e a
// linha de amanhã já responderia por hoje. Aqui é só o aviso antes de digitar:
// quem quer decidir antes vai pela movimentação, que agenda o efeito.
const HOJE_NA_OPERACAO = hojeNaOperacao();

function formatarDataEvento(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const fatoDatado = /T00:00:00(\.000)?Z$/.test(iso);
  return (fatoDatado ? formatoDataUtc : formatoDataSp).format(data);
}

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Operação falhou. Tente novamente.";
}

export function FichaColaborador({
  colaboradorId,
  permissoes,
}: {
  colaboradorId: number;
  permissoes: PermissoesFicha;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [linhaDoTempo, setLinhaDoTempo] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");

  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[] | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[] | null>(null);
  const [cadencia, setCadencia] = useState<Cadencia | null>(null);
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [posicoes, setPosicoes] = useState<Posicao[] | null>(null);
  const [relacoesGestor, setRelacoesGestor] = useState<RelacaoGestor[] | null>(null);
  const [lotacoes, setLotacoes] = useState<Lotacao[] | null>(null);
  const [cargos, setCargos] = useState<CargoOpcao[] | null>(null);
  const [estabelecimentos, setEstabelecimentos] = useState<EstabelecimentoOpcao[] | null>(null);
  // Catálogos de REGISTRO e CENTRO DE CUSTO (migration 0047): só os ativos.
  const [empresasOpcoes, setEmpresasOpcoes] = useState<EmpresaOpcao[] | null>(null);
  const [centrosCustoOpcoes, setCentrosCustoOpcoes] = useState<CentroCustoOpcao[] | null>(null);
  const [colaboradoresOpcoes, setColaboradoresOpcoes] = useState<ColaboradorOpcao[] | null>(null);

  const [erroAba, setErroAba] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [formOcorrenciaAberto, setFormOcorrenciaAberto] = useState(false);
  const [formFeedbackAberto, setFormFeedbackAberto] = useState(false);
  const [formEdicaoAberto, setFormEdicaoAberto] = useState(false);

  const [novaOcorrencia, setNovaOcorrencia] = useState({
    ocorrida_em: "",
    // Classificação da conduta nasce VAZIA: o sinal (positivo/negativo) é o
    // que a ficha registra sobre a pessoa — a tela não chuta por ordem do enum.
    tipo: "" as TipoOcorrencia | "",
    restrita: false,
    descricao: "",
    impacto: "",
    acao_combinada: "",
  });
  const [novoFeedback, setNovoFeedback] = useState({ realizado_em: "", resumo: "" });
  const [novaAcao, setNovaAcao] = useState({ descricao: "", prazo: "" });
  const [edicao, setEdicao] = useState({
    nome_completo: "",
    tipo_vinculo: "clt" as TipoVinculo,
    status: "ativo" as StatusColaborador,
    data_desligamento: "",
    data_nascimento: "",
    // "" = não alterar. O valor guardado NUNCA vem no payload da ficha (LGPD:
    // gênero autodeclarado só existe em agregado), então o campo é de escrita.
    genero: "" as Genero | "",
    retrato: "",
    contexto: "",
  });
  const [novaPosicao, setNovaPosicao] = useState({
    cargo_id: "",
    salario: "",
    inicio_vigencia: "",
    // Motivo nasce VAZIO: é o rótulo que distingue promoção de reajuste
    // coletivo, mérito e enquadramento no histórico de posições.
    motivo: "" as MotivoPosicao | "",
  });
  const [novoGestor, setNovoGestor] = useState({ gestor_colaborador_id: "", inicio_vigencia: "" });
  const [novaLotacao, setNovaLotacao] = useState(ALOCACAO_VAZIA);

  const carregarFicha = useCallback(async () => {
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}`);
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        setFicha(null);
        return;
      }
      const dados = await resposta.json();
      setFicha(dados.colaborador);
      setLinhaDoTempo(dados.linha_do_tempo ?? []);
      setErro(null);
      setEdicao({
        nome_completo: dados.colaborador.nome_completo,
        tipo_vinculo: dados.colaborador.tipo_vinculo,
        status: dados.colaborador.status,
        data_desligamento: dados.colaborador.data_desligamento ?? "",
        data_nascimento: dados.colaborador.data_nascimento ?? "",
        genero: "",
        retrato: dados.colaborador.retrato ?? "",
        contexto: dados.colaborador.contexto ?? "",
      });
    } catch {
      setErro("Falha de conexão. Recarregue a página.");
    } finally {
      setCarregando(false);
    }
  }, [colaboradorId]);

  const carregarOcorrencias = useCallback(async () => {
    const resposta = await fetch(`/api/colaboradores/${colaboradorId}/ocorrencias`);
    if (resposta.ok) {
      const dados = await resposta.json();
      setOcorrencias(dados.ocorrencias ?? []);
    }
  }, [colaboradorId]);

  const carregarFeedbacks = useCallback(async () => {
    const [respostaFeedbacks, respostaAcoes] = await Promise.all([
      fetch(`/api/colaboradores/${colaboradorId}/feedbacks`),
      fetch(`/api/colaboradores/${colaboradorId}/acoes`),
    ]);
    if (respostaFeedbacks.ok) {
      const dados = await respostaFeedbacks.json();
      setFeedbacks(dados.feedbacks ?? []);
      setCadencia(dados.cadencia ?? null);
    }
    if (respostaAcoes.ok) {
      const dados = await respostaAcoes.json();
      setAcoes(dados.acoes ?? []);
    }
  }, [colaboradorId]);

  const carregarPosicoes = useCallback(async () => {
    const resposta = await fetch(`/api/colaboradores/${colaboradorId}/posicao`);
    if (resposta.ok) {
      const dados = await resposta.json();
      setPosicoes(dados.posicoes ?? []);
    }
  }, [colaboradorId]);

  const carregarAdministracao = useCallback(async () => {
    if (permissoes.podeAdminGestor) {
      fetch(`/api/colaboradores/${colaboradorId}/gestor`).then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setRelacoesGestor(dados.historico ?? []);
        }
      });
      fetch("/api/colaboradores").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setColaboradoresOpcoes(dados.colaboradores ?? []);
        }
      });
    }
    if (permissoes.podeAdminLotacao) {
      fetch(`/api/colaboradores/${colaboradorId}/lotacao`).then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          const historico: Lotacao[] = dados.historico ?? [];
          setLotacoes(historico);
          setNovaLotacao(semearAlocacao(historico));
        }
      });
      fetch("/api/estabelecimentos").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setEstabelecimentos(dados.estabelecimentos ?? []);
        }
      });
      fetch("/api/estrutura/opcoes").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setEmpresasOpcoes(dados.empresas ?? []);
          setCentrosCustoOpcoes(dados.centros_custo ?? []);
        }
      });
    }
    if (permissoes.podeAdminCargo) {
      fetch("/api/cargos").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setCargos(dados.cargos ?? []);
        }
      });
    }
  }, [colaboradorId, permissoes]);

  useEffect(() => {
    void (async () => {
      await carregarFicha();
    })();
  }, [carregarFicha]);

  useEffect(() => {
    void (async () => {
      if (aba === "dados" && permissoes.podeVerSalario && posicoes === null) {
        await carregarPosicoes();
      }
      if (aba === "ocorrencias" && ocorrencias === null) {
        await carregarOcorrencias();
      }
      if (aba === "feedbacks" && feedbacks === null) {
        await carregarFeedbacks();
      }
      if (aba === "admin") {
        if (permissoes.podeVerSalario && posicoes === null) {
          await carregarPosicoes();
        }
        if (relacoesGestor === null && lotacoes === null) {
          carregarAdministracao();
        }
      }
    })();
    // Dependências intencionais: dispara só na troca de aba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  async function enviarOcorrencia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/ocorrencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocorrida_em: novaOcorrencia.ocorrida_em,
          tipo: novaOcorrencia.tipo,
          restrita: novaOcorrencia.restrita,
          descricao: novaOcorrencia.descricao,
          impacto: novaOcorrencia.impacto.trim() || undefined,
          acao_combinada: novaOcorrencia.acao_combinada.trim() || undefined,
        }),
      });
      if (!resposta.ok) {
        setErroAba(await lerErro(resposta));
        return;
      }
      setNovaOcorrencia({
        ocorrida_em: "",
        tipo: "",
        restrita: false,
        descricao: "",
        impacto: "",
        acao_combinada: "",
      });
      setFormOcorrenciaAberto(false);
      await Promise.all([carregarOcorrencias(), carregarFicha()]);
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarFeedback(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/feedbacks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoFeedback),
      });
      if (!resposta.ok) {
        setErroAba(await lerErro(resposta));
        return;
      }
      setNovoFeedback({ realizado_em: "", resumo: "" });
      setFormFeedbackAberto(false);
      await Promise.all([carregarFeedbacks(), carregarFicha()]);
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAcao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/acoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaAcao),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível criar a ação.");
        return;
      }
      setAcoes(dados.acoes ?? []);
      setNovaAcao({ descricao: "", prazo: "" });
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatusAcao(acaoId: number, status: "concluida" | "cancelada") {
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(
        `/api/colaboradores/${colaboradorId}/acoes/${acaoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível atualizar a ação.");
        return;
      }
      setAcoes(dados.acoes ?? []);
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const corpo: Record<string, unknown> = {
        nome_completo: edicao.nome_completo,
        tipo_vinculo: edicao.tipo_vinculo,
        status: edicao.status,
        retrato: edicao.retrato.trim() || null,
        contexto: edicao.contexto.trim() || null,
      };
      if (edicao.status === "desligado" && edicao.data_desligamento) {
        corpo.data_desligamento = edicao.data_desligamento;
      }
      if (edicao.data_nascimento) {
        corpo.data_nascimento = edicao.data_nascimento;
      }
      if (edicao.genero !== "") {
        corpo.genero = edicao.genero;
      }
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        setErroAba(await lerErro(resposta));
        return;
      }
      setFormEdicaoAberto(false);
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarPosicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/posicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cargo_id: Number(novaPosicao.cargo_id),
          salario: Number(novaPosicao.salario),
          inicio_vigencia: novaPosicao.inicio_vigencia,
          motivo: novaPosicao.motivo,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível registrar a posição.");
        return;
      }
      setPosicoes(dados.posicoes ?? []);
      setNovaPosicao({ cargo_id: "", salario: "", inicio_vigencia: "", motivo: "" });
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarGestor(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await definirGestor(
      novoGestor.gestor_colaborador_id ? Number(novoGestor.gestor_colaborador_id) : null,
      novoGestor.inicio_vigencia
    );
  }

  async function definirGestor(gestorId: number | null, inicioVigencia: string) {
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/gestor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestor_colaborador_id: gestorId,
          inicio_vigencia: inicioVigencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível atualizar o gestor.");
        return;
      }
      setRelacoesGestor(dados.historico ?? []);
      setNovoGestor({ gestor_colaborador_id: "", inicio_vigencia: "" });
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarLotacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/lotacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: Number(novaLotacao.empresa_id),
          estabelecimento_id: Number(novaLotacao.estabelecimento_id),
          centro_custo_id: Number(novaLotacao.centro_custo_id),
          inicio_vigencia: novaLotacao.inicio_vigencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível atualizar a alocação.");
        return;
      }
      const historico: Lotacao[] = dados.historico ?? [];
      setLotacoes(historico);
      // Semeia de novo a partir do que ACABOU de virar vigente — o formulário
      // continua espelhando o estado atual, nunca o que foi digitado antes.
      setNovaLotacao(semearAlocacao(historico));
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const mostrarAdmin =
    permissoes.podeVerSalario ||
    permissoes.podeEditarPosicao ||
    permissoes.podeAdminGestor ||
    permissoes.podeAdminLotacao;

  const posicaoVigente = posicoes?.find((posicao) => posicao.fim_vigencia === null) ?? null;

  if (carregando) {
    return (
      <div className={estilos.pagina}>
        <Cabecalho>
          <Link className={acaoCabecalho} href="/colaboradores">
            Colaboradores
          </Link>
        </Cabecalho>
        <main className={estilos.conteudo}>
          <p className={estilos.vazio}>Carregando…</p>
        </main>
      </div>
    );
  }

  if (erro || !ficha) {
    return (
      <div className={estilos.pagina}>
        <Cabecalho>
          <Link className={acaoCabecalho} href="/colaboradores">
            Colaboradores
          </Link>
        </Cabecalho>
        <main className={estilos.conteudo}>
          <p className={estilos.erro}>{erro ?? "Colaborador não encontrado."}</p>
          <Link className={estilos.voltar} href="/colaboradores">
            ← Voltar à lista
          </Link>
        </main>
      </div>
    );
  }

  // Quem foi demitido e recontratado em outra empresa do grupo tem mais de um
  // contrato. Só nesse caso a linha do tempo precisa dizer em qual cada fato
  // caiu — para quem tem um vínculo só, a tela fica exatamente como era.
  const temMaisDeUmVinculo = (ficha.vinculos?.length ?? 1) > 1;
  // Vínculo encerrado: os três campos da 0047 e o cargo mostram o que valia no
  // fim do contrato, não o que vale hoje — o contrato acabou.
  const vinculoEncerrado = ficha.status === "desligado";
  const sufixoEncerrado = vinculoEncerrado ? " no encerramento" : "";

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/colaboradores">
          Colaboradores
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/colaboradores">
          ← Voltar à lista
        </Link>

        <div className={estilos.cabecalhoFicha}>
          <div className={estilos.avatar}>{iniciais(ficha.nome_completo)}</div>
          <div className={estilos.info}>
            <h1>{ficha.nome_completo}</h1>
            <div className={estilos.chips}>
              <span className={estilos.chip}>matrícula {ficha.matricula}</span>
              {ficha.cargo_nome && <span className={estilos.chip}>{ficha.cargo_nome}</span>}
              {ficha.unidade && <span className={estilos.chip}>{ficha.unidade}</span>}
              <span className={`${estilos.pill} ${ESTILO_PILL[ficha.status]}`}>
                {ROTULOS_STATUS[ficha.status]}
              </span>
              <span className={estilos.chip}>
                admissão {formatarData(ficha.data_admissao)}
              </span>
              <span className={estilos.chip}>{ROTULOS_VINCULO[ficha.tipo_vinculo]}</span>
            </div>
            {ficha.retrato && (
              <div className={estilos.retrato}>
                <b>Retrato atual</b>
                {ficha.retrato}
              </div>
            )}
            {ficha.contexto && (
              <div className={estilos.retrato}>
                <b>Contexto histórico</b>
                {ficha.contexto}
              </div>
            )}
          </div>
          <div className={estilos.acoesTopo}>
            {permissoes.podeRegistrarOcorrencia && (
              <button
                className={estilos.botao}
                type="button"
                onClick={() => {
                  setAba("ocorrencias");
                  setFormOcorrenciaAberto(true);
                }}
              >
                + Registrar ocorrência
              </button>
            )}
            {permissoes.podeRegistrarFeedback && (
              <button
                className={estilos.botao}
                type="button"
                onClick={() => {
                  setAba("feedbacks");
                  setFormFeedbackAberto(true);
                }}
              >
                + Registrar feedback
              </button>
            )}
          </div>
        </div>

        {ficha.feedback_vencido &&
          ficha.status === "ativo" &&
          (permissoes.podeRegistrarFeedback || permissoes.podeEditar) && (
            <div className={estilos.banner90}>
              {ficha.ultimo_feedback_em
                ? `Feedback formal vencido: último em ${formatarData(ficha.ultimo_feedback_em)}, há ${ficha.dias_desde_feedback} dias (cadência padrão: 90 dias).`
                : "Nenhum feedback formal registrado — cadência de 90 dias vencida desde a admissão."}
            </div>
          )}

        <div className={estilos.abas}>
          {(
            [
              ["dados", "Dados"],
              ["linha", "Linha do tempo"],
              ["ocorrencias", "Ocorrências"],
              ["feedbacks", "Feedbacks/Ações"],
            ] as [Aba, string][]
          )
            .concat(mostrarAdmin ? [["admin", "Administração"] as [Aba, string]] : [])
            .map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                className={`${estilos.aba} ${aba === id ? estilos.abaAtiva : ""}`}
                onClick={() => {
                  setErroAba(null);
                  setAba(id);
                }}
              >
                {rotulo}
              </button>
            ))}
        </div>

        {erroAba && <p className={estilos.erro}>{erroAba}</p>}

        {aba === "dados" && (
          <>
            <div className={estilos.gradeDados}>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Matrícula própria</div>
                <div className={estilos.val}>{ficha.matricula}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Matrícula eSocial</div>
                <div className={estilos.val}>{ficha.matricula_esocial}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>CPF</div>
                <div className={estilos.val}>{formatarCpf(ficha.cpf)}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>E-mail</div>
                <div className={estilos.val}>{ficha.email}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Tipo de vínculo</div>
                <div className={estilos.val}>{ROTULOS_VINCULO[ficha.tipo_vinculo]}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Data de admissão</div>
                <div className={estilos.val}>{formatarData(ficha.data_admissao)}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Data de nascimento</div>
                <div className={estilos.val}>
                  {ficha.data_nascimento
                    ? formatarData(ficha.data_nascimento)
                    : "não cadastrada"}
                </div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Status</div>
                <div className={estilos.val}>
                  {ROTULOS_STATUS[ficha.status]}
                  {ficha.data_desligamento
                    ? ` em ${formatarData(ficha.data_desligamento)}`
                    : ""}
                </div>
              </div>
              {/* Contrato encerrado não tem nada "vigente" — tem o que valia no
                  último dia. O rótulo diz qual dos dois está na tela para o DP
                  não ler o passado como se fosse hoje. */}
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>
                  Registro (empresa do grupo){sufixoEncerrado}
                </div>
                <div className={estilos.val}>{ficha.empresa_nome ?? "—"}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>
                  Lotação (local de trabalho){sufixoEncerrado}
                </div>
                <div className={estilos.val}>{ficha.unidade ?? "—"}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Centro de custo{sufixoEncerrado}</div>
                <div className={estilos.val}>
                  {ficha.centro_custo
                    ? `${ficha.centro_custo}${ficha.centro_custo_nome && ficha.centro_custo_nome !== ficha.centro_custo ? ` — ${ficha.centro_custo_nome}` : ""}`
                    : "—"}
                </div>
                {permissoes.podeAdminLotacao && (
                  <div className={estilos.notaRestrito}>
                    o histórico dos três, com a vigência de cada troca, está na
                    aba Administração → Alocação
                  </div>
                )}
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>
                  {vinculoEncerrado ? "Cargo (última posição)" : "Cargo (posição vigente)"}
                </div>
                <div className={estilos.val}>{ficha.cargo_nome ?? "—"}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Gestor atual (relação vigente)</div>
                <div className={estilos.val}>{ficha.gestor_nome ?? "—"}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Último feedback formal (derivado)</div>
                <div className={estilos.val}>
                  {ficha.ultimo_feedback_em
                    ? `${formatarData(ficha.ultimo_feedback_em)} — há ${ficha.dias_desde_feedback} dias`
                    : "nenhum"}
                </div>
              </div>
              {permissoes.podeVerSalario && (
                <div className={`${estilos.campoDado} ${estilos.campoRestrito}`}>
                  <div className={estilos.rot}>Salário — chave rh.posicao.ver</div>
                  <div className={estilos.val}>
                    {posicaoVigente ? formatarSalario(posicaoVigente.salario) : "—"}
                  </div>
                  <div className={estilos.notaRestrito}>
                    dado sensível · leitura gravada na trilha
                  </div>
                </div>
              )}
            </div>

            {/* VÍNCULOS DA PESSOA NO GRUPO. Só aparece quando há mais de um —
                quem tem um contrato só vê a ficha exatamente como antes. É a
                resposta visível ao "ele demite e recontrata na outra empresa,
                mas não queria perder os dados e histórico": os dois contratos,
                com a empresa e o período de cada um, numa pessoa só. */}
            {temMaisDeUmVinculo && (
              <div className={estilos.cartao} style={{ marginTop: 16 }}>
                <h2>Vínculos desta pessoa no grupo</h2>
                <p className={estilos.notaRestrito}>
                  Mesmo CPF, mesma conta de acesso e uma linha do tempo só —
                  cada contrato guarda o que aconteceu nele.
                </p>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Empresa (registro)</th>
                      <th>Matrícula</th>
                      <th>Vínculo</th>
                      <th>Período</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.vinculos.map((vinculo) => (
                      <tr
                        key={vinculo.id}
                        className={vinculo.id === ficha.id ? estilos.linhaAtual : undefined}
                      >
                        <td>{vinculo.empresa_nome ?? "—"}</td>
                        <td>
                          {vinculo.id === ficha.id ? (
                            <b>{vinculo.matricula}</b>
                          ) : (
                            <Link href={`/colaboradores/${vinculo.id}`}>
                              {vinculo.matricula}
                            </Link>
                          )}
                        </td>
                        <td>{ROTULOS_VINCULO[vinculo.tipo_vinculo]}</td>
                        <td>
                          {formatarData(vinculo.data_admissao)}
                          {" → "}
                          {vinculo.data_desligamento
                            ? formatarData(vinculo.data_desligamento)
                            : "hoje"}
                        </td>
                        <td>
                          {ROTULOS_STATUS[vinculo.status]}
                          {vinculo.sucedido_por_vinculo_id !== null
                            ? " · transferido para outra empresa do grupo"
                            : ""}
                          {vinculo.sucede_vinculo_id !== null
                            ? " · veio por transferência interna"
                            : ""}
                          {vinculo.id === ficha.id ? " · ficha aberta" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <BlocoPontoFicha colaboradorId={colaboradorId} />

            {/* Posse de patrimônio (0081): dp+rh. Self-fetch + 403 esconde o
                cartão; erro transitório mostra "tentar novamente". */}
            {permissoes.podeVerPosse && (
              <BlocoPosseFicha
                colaboradorId={colaboradorId}
                podeRegistrar={permissoes.podeRegistrarPosse}
                ehPropriaFicha={permissoes.ehPropriaFicha}
              />
            )}

            {/* RCF do cargo — pedido explícito da analista de RH. Vem da versão
                VIGENTE do cargo da posição atual; documento de gestão (não é
                dado sensível), visível a quem já vê a ficha. */}
            <div className={estilos.cartao} style={{ marginTop: 16 }}>
              <div className={estilos.rcfTopo}>
                <h2>
                  RCF do cargo
                  {ficha.rcf ? ` — ${ficha.rcf.nome}` : ""}
                </h2>
                {ficha.rcf && (
                  <Link
                    className={estilos.botaoLinha}
                    href={`/cargos/${ficha.rcf.cargo_id}/rcf`}
                  >
                    Abrir versão imprimível
                  </Link>
                )}
              </div>
              {!ficha.rcf ? (
                <p className={estilos.vazio}>
                  Sem RCF: esta pessoa não tem posição vigente ou o cargo não tem
                  versão ativa.
                </p>
              ) : (
                <>
                  <p className={estilos.rcfMeta}>
                    Responsabilidade Chave da Função · vigente desde{" "}
                    {formatarData(ficha.rcf.inicio_vigencia)}
                    {ficha.rcf.setor ? ` · setor ${ficha.rcf.setor}` : ""}
                    {ficha.rcf.cargo_lider_nome
                      ? ` · líder direto: ${ficha.rcf.cargo_lider_nome}`
                      : ""}
                    {ficha.rcf.tipo_contrato_previsto
                      ? ` · contrato previsto: ${ROTULOS_VINCULO[ficha.rcf.tipo_contrato_previsto]}`
                      : ""}
                  </p>
                  <h3 className={estilos.rcfTitulo}>Missão do cargo</h3>
                  {ficha.rcf.missao ? (
                    <p className={estilos.rcfTexto}>{ficha.rcf.missao}</p>
                  ) : (
                    <p className={estilos.vazio}>
                      Missão ainda não preenchida pelo gestor.
                    </p>
                  )}
                  {ficha.rcf.atividades.length > 0 && (
                    <>
                      <h3 className={estilos.rcfTitulo}>Atividades</h3>
                      <ol className={estilos.rcfLista}>
                        {ficha.rcf.atividades.map((atividade, indice) => (
                          <li key={`${indice}-${atividade}`}>{atividade}</li>
                        ))}
                      </ol>
                    </>
                  )}
                  <h3 className={estilos.rcfTitulo}>CHA</h3>
                  <div className={estilos.rcfCha}>
                    {(
                      [
                        ["Conhecimentos", ficha.rcf.cha.conhecimentos ?? []],
                        ["Habilidades", ficha.rcf.cha.habilidades ?? []],
                        ["Atitudes", ficha.rcf.cha.atitudes ?? []],
                      ] as [string, string[]][]
                    ).map(([titulo, itens]) => (
                      <div key={titulo} className={estilos.rcfChaColuna}>
                        <div className={estilos.rot}>{titulo}</div>
                        {itens.length > 0 ? (
                          <ul className={estilos.rcfLista}>
                            {itens.map((item, indice) => (
                              <li key={`${indice}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className={estilos.vazio}>—</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {ficha.rcf.observacoes && (
                    <>
                      <h3 className={estilos.rcfTitulo}>
                        Observações importantes
                      </h3>
                      <p className={estilos.rcfTexto}>{ficha.rcf.observacoes}</p>
                    </>
                  )}
                </>
              )}
            </div>

            {permissoes.podeEditar && (
              <div className={estilos.cartao} style={{ marginTop: 16 }}>
                <h2>Editar ficha</h2>
                {!formEdicaoAberto ? (
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    onClick={() => setFormEdicaoAberto(true)}
                  >
                    Editar dados cadastrais
                  </button>
                ) : (
                  <form className={estilos.formulario} onSubmit={enviarEdicao}>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edNome">
                        Nome completo
                      </label>
                      <input
                        className={estilos.campo}
                        id="edNome"
                        type="text"
                        required
                        maxLength={200}
                        value={edicao.nome_completo}
                        onChange={(e) =>
                          setEdicao((atual) => ({ ...atual, nome_completo: e.target.value }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edVinculo">
                        Tipo de vínculo
                      </label>
                      <select
                        className={estilos.campo}
                        id="edVinculo"
                        value={edicao.tipo_vinculo}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            tipo_vinculo: e.target.value as TipoVinculo,
                          }))
                        }
                      >
                        {TIPOS_VINCULO.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_VINCULO[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edStatus">
                        Status
                      </label>
                      <select
                        className={estilos.campo}
                        id="edStatus"
                        value={edicao.status}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            status: e.target.value as StatusColaborador,
                          }))
                        }
                      >
                        {STATUS_COLABORADOR.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_STATUS[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {edicao.status === "desligado" && (
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="edDesligamento">
                          Data de desligamento
                        </label>
                        <input
                          className={estilos.campo}
                          id="edDesligamento"
                          type="date"
                          required
                          value={edicao.data_desligamento}
                          onChange={(e) =>
                            setEdicao((atual) => ({
                              ...atual,
                              data_desligamento: e.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edNascimento">
                        Data de nascimento
                      </label>
                      <input
                        className={estilos.campo}
                        id="edNascimento"
                        type="date"
                        value={edicao.data_nascimento}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            data_nascimento: e.target.value,
                          }))
                        }
                      />
                    </div>
                    {/* Campo de ESCRITA: o valor guardado não é exibido em
                        lugar nenhum da ficha (gênero autodeclarado só aparece
                        em agregado, no relatório de diversidade). */}
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edGenero">
                        Gênero (autodeclarado)
                      </label>
                      <select
                        className={estilos.campo}
                        id="edGenero"
                        value={edicao.genero}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            genero: e.target.value as Genero | "",
                          }))
                        }
                      >
                        <option value="">Não alterar</option>
                        {GENEROS.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_GENERO[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupoLargo}>
                      <label className={estilos.rotulo} htmlFor="edRetrato">
                        Retrato atual
                      </label>
                      <textarea
                        className={estilos.campo}
                        id="edRetrato"
                        rows={2}
                        maxLength={2000}
                        value={edicao.retrato}
                        onChange={(e) =>
                          setEdicao((atual) => ({ ...atual, retrato: e.target.value }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupoLargo}>
                      <label className={estilos.rotulo} htmlFor="edContexto">
                        Contexto histórico
                      </label>
                      <textarea
                        className={estilos.campo}
                        id="edContexto"
                        rows={2}
                        maxLength={4000}
                        value={edicao.contexto}
                        onChange={(e) =>
                          setEdicao((atual) => ({ ...atual, contexto: e.target.value }))
                        }
                      />
                    </div>
                    <button className={estilos.botao} type="submit" disabled={salvando}>
                      {salvando ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      onClick={() => setFormEdicaoAberto(false)}
                    >
                      Cancelar
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {aba === "linha" &&
          (linhaDoTempo.length === 0 ? (
            <p className={estilos.vazio}>Nenhum evento visível para o seu papel.</p>
          ) : (
            <div className={estilos.linhaTempo}>
              {linhaDoTempo.map((evento) => {
                const tipo = TIPOS_EVENTO[evento.tipo] ?? EVENTO_PADRAO;
                return (
                  <div key={evento.id} className={estilos.evento}>
                    <div
                      className={estilos.eventoPonto}
                      style={{ background: tipo.cor }}
                    >
                      {tipo.simbolo}
                    </div>
                    <div className={estilos.eventoCartao}>
                      <div className={estilos.eventoMeta}>
                        <span className={estilos.eventoTipo} style={{ color: tipo.cor }}>
                          {tipo.rotulo}
                        </span>
                        <span>{formatarDataEvento(evento.ocorrido_em)}</span>
                        {/* Só aparece quando a pessoa tem mais de um contrato
                            no grupo: aí saber em QUAL o fato caiu deixa de ser
                            ruído e passa a ser a informação. */}
                        {temMaisDeUmVinculo && (
                          <span>matrícula {evento.vinculo_matricula}</span>
                        )}
                      </div>
                      <div className={estilos.eventoResumo}>{evento.resumo}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {aba === "ocorrencias" && (
          <>
            {permissoes.podeRegistrarOcorrencia && formOcorrenciaAberto && (
              <div className={estilos.cartao}>
                <h2>Registrar ocorrência</h2>
                <form className={estilos.formulario} onSubmit={enviarOcorrencia}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocData">
                      Data do fato
                    </label>
                    <input
                      className={estilos.campo}
                      id="ocData"
                      type="date"
                      required
                      value={novaOcorrencia.ocorrida_em}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          ocorrida_em: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocTipo">
                      Classificação
                    </label>
                    <select
                      className={estilos.campo}
                      id="ocTipo"
                      required
                      value={novaOcorrencia.tipo}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          tipo: e.target.value as TipoOcorrencia | "",
                        }))
                      }
                    >
                      <option value="">selecione…</option>
                      {TIPOS_OCORRENCIA.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {ROTULOS_OCORRENCIA[opcao]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupoLargo}>
                    <label className={estilos.rotulo} htmlFor="ocDescricao">
                      Descrição (fato, causa provável)
                    </label>
                    <textarea
                      className={estilos.campo}
                      id="ocDescricao"
                      rows={3}
                      required
                      maxLength={4000}
                      value={novaOcorrencia.descricao}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          descricao: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocImpacto">
                      Impacto (opcional)
                    </label>
                    <input
                      className={estilos.campo}
                      id="ocImpacto"
                      type="text"
                      maxLength={2000}
                      value={novaOcorrencia.impacto}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          impacto: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocAcao">
                      Ação combinada (opcional)
                    </label>
                    <input
                      className={estilos.campo}
                      id="ocAcao"
                      type="text"
                      maxLength={2000}
                      value={novaOcorrencia.acao_combinada}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          acao_combinada: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {permissoes.podeVerRestrita && (
                    <label className={estilos.linhaCheck}>
                      <input
                        type="checkbox"
                        checked={novaOcorrencia.restrita}
                        onChange={(e) =>
                          setNovaOcorrencia((atual) => ({
                            ...atual,
                            restrita: e.target.checked,
                          }))
                        }
                      />
                      Disciplinar / restrita (só quem tem a chave vê; leitura logada)
                    </label>
                  )}
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Registrando…" : "Registrar"}
                  </button>
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    onClick={() => setFormOcorrenciaAberto(false)}
                  >
                    Cancelar
                  </button>
                </form>
              </div>
            )}
            {permissoes.podeRegistrarOcorrencia && !formOcorrenciaAberto && (
              <p style={{ marginBottom: 14 }}>
                <button
                  className={estilos.botao}
                  type="button"
                  onClick={() => setFormOcorrenciaAberto(true)}
                >
                  + Registrar ocorrência
                </button>
              </p>
            )}
            {ocorrencias === null ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : ocorrencias.length === 0 ? (
              <p className={estilos.vazio}>Nenhuma ocorrência visível para o seu papel.</p>
            ) : (
              ocorrencias.map((ocorrencia) => (
                <div key={ocorrencia.id} className={estilos.itemRegistro}>
                  <div className={estilos.itemTopo}>
                    <span className={`${estilos.clf} ${ESTILO_CLF[ocorrencia.tipo]}`}>
                      {ROTULOS_OCORRENCIA[ocorrencia.tipo]}
                    </span>
                    <span>{formatarData(ocorrencia.ocorrida_em)}</span>
                    <span>registrado por {ocorrencia.registrado_por_nome}</span>
                    {ocorrencia.restrita && (
                      <span className={estilos.tagRestrito}>RESTRITA · leitura logada</span>
                    )}
                  </div>
                  <div className={estilos.itemTexto}>{ocorrencia.descricao}</div>
                  {ocorrencia.impacto && (
                    <div className={estilos.itemExtra}>Impacto: {ocorrencia.impacto}</div>
                  )}
                  {ocorrencia.acao_combinada && (
                    <div className={estilos.itemExtra}>
                      Ação combinada: {ocorrencia.acao_combinada}
                    </div>
                  )}
                </div>
              ))
            )}
            {/* Disciplinar: cartão à parte, restrito à chave rh.disciplinar.ver
                (o gestor não vê). Self-fetch + 403 esconde o cartão. */}
            {permissoes.podeVerDisciplinar && (
              <BlocoDisciplinarFicha
                colaboradorId={colaboradorId}
                podeRegistrar={permissoes.podeRegistrarDisciplinar}
              />
            )}
          </>
        )}

        {aba === "feedbacks" && (
          <>
            {cadencia && (
              <div
                className={`${estilos.aviso} ${
                  cadencia.vencido ? estilos.avisoVencido : estilos.avisoOk
                }`}
              >
                {cadencia.vencido
                  ? `Cadência vencida: último feedback formal há ${cadencia.dias_desde ?? "—"} dias (parâmetro: ${cadencia.parametro_dias} dias).`
                  : `Cadência em dia: último feedback formal há ${cadencia.dias_desde} dias (parâmetro: ${cadencia.parametro_dias} dias).`}
              </div>
            )}

            {permissoes.podeRegistrarFeedback && formFeedbackAberto && (
              <div className={estilos.cartao}>
                <h2>Registrar feedback formal</h2>
                <form className={estilos.formulario} onSubmit={enviarFeedback}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="fbData">
                      Data
                    </label>
                    <input
                      className={estilos.campo}
                      id="fbData"
                      type="date"
                      required
                      value={novoFeedback.realizado_em}
                      onChange={(e) =>
                        setNovoFeedback((atual) => ({
                          ...atual,
                          realizado_em: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupoLargo}>
                    <label className={estilos.rotulo} htmlFor="fbResumo">
                      Resumo da conversa / acordos
                    </label>
                    <textarea
                      className={estilos.campo}
                      id="fbResumo"
                      rows={3}
                      required
                      maxLength={4000}
                      value={novoFeedback.resumo}
                      onChange={(e) =>
                        setNovoFeedback((atual) => ({ ...atual, resumo: e.target.value }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Registrando…" : "Registrar"}
                  </button>
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    onClick={() => setFormFeedbackAberto(false)}
                  >
                    Cancelar
                  </button>
                </form>
              </div>
            )}
            {permissoes.podeRegistrarFeedback && !formFeedbackAberto && (
              <p style={{ marginBottom: 14 }}>
                <button
                  className={estilos.botao}
                  type="button"
                  onClick={() => setFormFeedbackAberto(true)}
                >
                  + Registrar feedback
                </button>
              </p>
            )}

            {feedbacks === null ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : feedbacks.length === 0 ? (
              <p className={estilos.vazio}>Nenhum feedback formal registrado.</p>
            ) : (
              feedbacks.map((feedback) => (
                <div key={feedback.id} className={estilos.itemRegistro}>
                  <div className={estilos.itemTopo}>
                    <span className={`${estilos.clf} ${estilos.clfNeutro}`}>
                      feedback formal
                    </span>
                    <span>{formatarData(feedback.realizado_em)}</span>
                    <span>registrado por {feedback.registrado_por_nome}</span>
                  </div>
                  <div className={estilos.itemTexto}>{feedback.resumo}</div>
                </div>
              ))
            )}

            <div className={estilos.cartao} style={{ marginTop: 16 }}>
              <h2>Ações abertas</h2>
              {permissoes.podeRegistrarFeedback && (
                <form
                  className={estilos.formulario}
                  onSubmit={enviarAcao}
                  style={{ marginBottom: 14 }}
                >
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="acDescricao">
                      Nova ação
                    </label>
                    <input
                      className={estilos.campo}
                      id="acDescricao"
                      type="text"
                      required
                      maxLength={2000}
                      placeholder="ex.: revisar meta em 30 dias"
                      value={novaAcao.descricao}
                      onChange={(e) =>
                        setNovaAcao((atual) => ({ ...atual, descricao: e.target.value }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="acPrazo">
                      Prazo
                    </label>
                    <input
                      className={estilos.campo}
                      id="acPrazo"
                      type="date"
                      required
                      value={novaAcao.prazo}
                      onChange={(e) =>
                        setNovaAcao((atual) => ({ ...atual, prazo: e.target.value }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Criando…" : "Criar ação"}
                  </button>
                </form>
              )}
              {acoes === null ? (
                <p className={estilos.vazio}>Carregando…</p>
              ) : acoes.length === 0 ? (
                <p className={estilos.vazio}>Nenhuma ação registrada.</p>
              ) : (
                acoes.map((acao) => (
                  <div key={acao.id} className={estilos.itemRegistro}>
                    <div className={estilos.itemTopo}>
                      <span className={ESTILO_ACAO[acao.status]}>
                        {ROTULOS_STATUS_ACAO[acao.status]}
                      </span>
                      {acao.vencida && (
                        <span className={estilos.etiquetaVencida}>vencida</span>
                      )}
                      <span>prazo {formatarData(acao.prazo)}</span>
                      <span>responsável: {acao.responsavel_nome}</span>
                      {permissoes.podeRegistrarFeedback && acao.status === "aberta" && (
                        <>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => mudarStatusAcao(acao.id, "concluida")}
                          >
                            Concluir
                          </button>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => mudarStatusAcao(acao.id, "cancelada")}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                    <div className={estilos.itemTexto}>{acao.descricao}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {aba === "admin" && mostrarAdmin && (
          <>
            {permissoes.podeVerSalario && (
              <div className={estilos.cartao}>
                <h2>Posição e salário (histórico por vigência)</h2>
                <p className={estilos.aviso}>
                  Dado sensível: cada leitura desta seção fica registrada na trilha.
                  Mudança encerra a vigência atual e cria uma nova — nunca edita o
                  passado.
                </p>
                {posicoes === null ? (
                  <p className={estilos.vazio}>Carregando…</p>
                ) : posicoes.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma posição registrada.</p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Cargo</th>
                          <th>Salário</th>
                          <th>Início</th>
                          <th>Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posicoes.map((posicao) => (
                          <tr key={posicao.id}>
                            <td>{posicao.cargo_nome}</td>
                            <td>{formatarSalario(posicao.salario)}</td>
                            <td>{formatarData(posicao.inicio_vigencia)}</td>
                            <td>
                              {posicao.fim_vigencia
                                ? formatarData(posicao.fim_vigencia)
                                : "vigente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {permissoes.podeEditarPosicao && (
                  <form
                    className={estilos.formulario}
                    onSubmit={enviarPosicao}
                    style={{ marginTop: 14 }}
                  >
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poCargo">
                        Cargo
                      </label>
                      <select
                        className={estilos.campo}
                        id="poCargo"
                        required
                        value={novaPosicao.cargo_id}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({ ...atual, cargo_id: e.target.value }))
                        }
                      >
                        <option value="">Selecione…</option>
                        {(cargos ?? [])
                          .filter((cargo) => cargo.nome)
                          .map((cargo) => (
                            <option key={cargo.id} value={cargo.id}>
                              {cargo.nome}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poSalario">
                        Salário (R$)
                      </label>
                      <input
                        className={estilos.campo}
                        id="poSalario"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={novaPosicao.salario}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({ ...atual, salario: e.target.value }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poInicio">
                        Início da vigência
                      </label>
                      <input
                        className={estilos.campo}
                        id="poInicio"
                        type="date"
                        max={HOJE_NA_OPERACAO}
                        required
                        value={novaPosicao.inicio_vigencia}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({
                            ...atual,
                            inicio_vigencia: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poMotivo">
                        Motivo
                      </label>
                      <select
                        className={estilos.campo}
                        id="poMotivo"
                        required
                        value={novaPosicao.motivo}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({
                            ...atual,
                            motivo: e.target.value as MotivoPosicao | "",
                          }))
                        }
                      >
                        <option value="">selecione…</option>
                        {MOTIVOS_POSICAO.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_MOTIVO_POSICAO[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className={estilos.botao} type="submit" disabled={salvando}>
                      {salvando ? "Registrando…" : "Registrar nova posição"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {permissoes.podeAdminGestor && (
              <div className={estilos.cartao}>
                <h2>Gestor (relação com vigência)</h2>
                {relacoesGestor === null ? (
                  <p className={estilos.vazio}>Carregando…</p>
                ) : relacoesGestor.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma relação de gestor registrada.</p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Gestor</th>
                          <th>Início</th>
                          <th>Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relacoesGestor.map((relacao) => (
                          <tr key={relacao.id}>
                            <td>{relacao.gestor_nome}</td>
                            <td>{formatarData(relacao.inicio_vigencia)}</td>
                            <td>
                              {relacao.fim_vigencia
                                ? formatarData(relacao.fim_vigencia)
                                : "vigente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <form
                  className={estilos.formulario}
                  onSubmit={enviarGestor}
                  style={{ marginTop: 14 }}
                >
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="geGestor">
                      Novo gestor
                    </label>
                    <select
                      className={estilos.campo}
                      id="geGestor"
                      required
                      value={novoGestor.gestor_colaborador_id}
                      onChange={(e) =>
                        setNovoGestor((atual) => ({
                          ...atual,
                          gestor_colaborador_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {(colaboradoresOpcoes ?? [])
                        .filter((opcao) => opcao.id !== colaboradorId)
                        .map((opcao) => (
                          <option key={opcao.id} value={opcao.id}>
                            {opcao.nome_completo} ({opcao.matricula})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="geInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="geInicio"
                      type="date"
                      max={HOJE_NA_OPERACAO}
                      required
                      value={novoGestor.inicio_vigencia}
                      onChange={(e) =>
                        setNovoGestor((atual) => ({
                          ...atual,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Salvando…" : "Definir gestor"}
                  </button>
                  {ficha.gestor_id !== null && (
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      disabled={salvando || !novoGestor.inicio_vigencia}
                      title="Usa a data de início informada como data do encerramento"
                      onClick={() => definirGestor(null, novoGestor.inicio_vigencia)}
                    >
                      Encerrar relação vigente
                    </button>
                  )}
                </form>
              </div>
            )}

            {permissoes.podeAdminLotacao && (
              <div className={estilos.cartao}>
                <h2>Alocação (registro × lotação × centro de custo)</h2>
                <p className={estilos.ajuda}>
                  Os três são independentes: a pessoa pode estar registrada numa
                  empresa do grupo, trabalhar no prédio de outra e ter o custo
                  caindo num terceiro lugar. Mudar qualquer um deles abre uma
                  vigência nova — o que já passou continua apontando para o que
                  valia na época.
                </p>
                {lotacoes === null ? (
                  <p className={estilos.vazio}>Carregando…</p>
                ) : lotacoes.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma lotação registrada.</p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Registro</th>
                          <th>Lotação</th>
                          <th>Centro de custo</th>
                          <th>Início</th>
                          <th>Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotacoes.map((lotacao) => (
                          <tr key={lotacao.id}>
                            <td>{lotacao.empresa_nome ?? "—"}</td>
                            <td>{lotacao.unidade ?? "—"}</td>
                            <td>
                              {lotacao.centro_custo}
                              {lotacao.centro_custo_nome &&
                              lotacao.centro_custo_nome !== lotacao.centro_custo
                                ? ` — ${lotacao.centro_custo_nome}`
                                : ""}
                            </td>
                            <td>{formatarData(lotacao.inicio_vigencia)}</td>
                            <td>
                              {lotacao.fim_vigencia
                                ? formatarData(lotacao.fim_vigencia)
                                : "vigente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <form
                  className={estilos.formulario}
                  onSubmit={enviarLotacao}
                  style={{ marginTop: 14 }}
                >
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loEmpresa">
                      Registro (empresa do grupo)
                    </label>
                    <select
                      className={estilos.campo}
                      id="loEmpresa"
                      required
                      value={novaLotacao.empresa_id}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          empresa_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {(empresasOpcoes ?? []).map((opcao) => (
                        <option key={opcao.id} value={opcao.id}>
                          {opcao.nome}
                          {opcao.cnpj ? ` (${opcao.cnpj})` : " (sem CNPJ)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loEstab">
                      Lotação (local de trabalho)
                    </label>
                    <select
                      className={estilos.campo}
                      id="loEstab"
                      required
                      value={novaLotacao.estabelecimento_id}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          estabelecimento_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {(estabelecimentos ?? [])
                        .filter((opcao) => opcao.inativado_em === null)
                        .map((opcao) => (
                          <option key={opcao.id} value={opcao.id}>
                            {opcao.unidade ?? `local ${opcao.id}`}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loCc">
                      Centro de custo
                    </label>
                    <select
                      className={estilos.campo}
                      id="loCc"
                      required
                      value={novaLotacao.centro_custo_id}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          centro_custo_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {(centrosCustoOpcoes ?? []).map((opcao) => (
                        <option key={opcao.id} value={opcao.id}>
                          {opcao.codigo} — {opcao.nome}
                          {opcao.empresa_nome ? ` (${opcao.empresa_nome})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="loInicio"
                      type="date"
                      max={HOJE_NA_OPERACAO}
                      required
                      value={novaLotacao.inicio_vigencia}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Salvando…" : "Definir lotação"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
