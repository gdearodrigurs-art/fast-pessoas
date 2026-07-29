"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  DIAS_ALERTA_PRAZO,
  ROTULOS_STATUS_CICLO,
  ROTULOS_TIPO_CICLO,
  StatusCiclo,
  TIPOS_CICLO,
  TipoCiclo,
} from "@/dominios/avaliacao/esquemas";
import comum from "./comum.module.css";
import { formatarData, rotuloPrazo } from "./formato";
import estilos from "./page.module.css";
import { CicloResumo, Painel, ResultadoLote } from "./tipos";

const STATUS_VIVOS: StatusCiclo[] = ["aberto", "em_avaliacao"];

function badgeStatus(ciclo: CicloResumo): string {
  if (ciclo.status === "cancelado") return comum.badgeNeutro;
  if (ciclo.status === "decidido") return comum.badgeSuccess;
  if (ciclo.status === "consolidado") return comum.badgeInfo;
  if (ciclo.dias_para_prazo < 0) return comum.badgeDanger;
  if (ciclo.dias_para_prazo <= DIAS_ALERTA_PRAZO) return comum.badgeWarning;
  return comum.badgeNeutro;
}

function CartaoCiclo({
  ciclo,
  mostrarAvaliador,
}: {
  ciclo: CicloResumo;
  mostrarAvaliador: boolean;
}) {
  const vivo = STATUS_VIVOS.includes(ciclo.status);
  return (
    <Link
      href={`/avaliacoes/${ciclo.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div className={comum.cartao}>
        <div className={comum.topo}>
          <span className={comum.nome}>{ciclo.colaborador_nome}</span>
          <span className={comum.matricula}>mat. {ciclo.matricula}</span>
          <span className={`${comum.badge} ${comum.badgeNeutro}`}>
            {ROTULOS_TIPO_CICLO[ciclo.tipo]}
          </span>
          <span className={`${comum.badge} ${badgeStatus(ciclo)}`}>
            {ROTULOS_STATUS_CICLO[ciclo.status]}
          </span>
          {vivo && ciclo.dias_para_prazo < 0 && (
            <span className={`${comum.badge} ${comum.badgeDanger}`}>
              prazo vencido
            </span>
          )}
        </div>
        <div className={comum.meta}>
          Prazo {formatarData(ciclo.prazo)}
          {vivo ? ` · ${rotuloPrazo(ciclo.dias_para_prazo)}` : ""} · modelo v
          {ciclo.modelo_versao}
          {mostrarAvaliador ? ` · avaliador: ${ciclo.avaliador_nome}` : ""}
        </div>
      </div>
    </Link>
  );
}

export function PainelAvaliacoes() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoCiclo>("todos");
  const [filtroStatus, setFiltroStatus] = useState<
    "vivos" | "todos" | StatusCiclo
  >("vivos");
  const [busca, setBusca] = useState("");

  const [dialogoLote, setDialogoLote] = useState(false);
  const [prazoLote, setPrazoLote] = useState("");
  const [abrindoLote, setAbrindoLote] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [resultadoLote, setResultadoLote] = useState<ResultadoLote | null>(
    null
  );

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/avaliacoes");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setPainel(dados as Painel);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar as avaliações.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [versao]);

  async function abrirLote(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAbrindoLote(true);
    setErroLote(null);
    try {
      const resposta = await fetch("/api/avaliacoes/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prazo: prazoLote }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setResultadoLote(dados as ResultadoLote);
        setVersao((atual) => atual + 1);
      } else {
        setErroLote(dados.erro ?? "Não foi possível abrir o lote.");
      }
    } catch {
      setErroLote("Falha de conexão. Tente novamente.");
    } finally {
      setAbrindoLote(false);
    }
  }

  const minhasPendentes =
    painel?.minhas?.filter((c) => STATUS_VIVOS.includes(c.status)) ?? [];
  const minhasEncerradas =
    painel?.minhas?.filter((c) => !STATUS_VIVOS.includes(c.status)) ?? [];

  const ciclosFiltrados = useMemo(() => {
    if (!painel?.ciclos) return [];
    const termo = busca.trim().toLowerCase();
    return painel.ciclos.filter((ciclo) => {
      if (filtroTipo !== "todos" && ciclo.tipo !== filtroTipo) return false;
      if (filtroStatus === "vivos" && !STATUS_VIVOS.includes(ciclo.status)) {
        return false;
      }
      if (
        filtroStatus !== "vivos" &&
        filtroStatus !== "todos" &&
        ciclo.status !== filtroStatus
      ) {
        return false;
      }
      if (
        termo &&
        !ciclo.colaborador_nome.toLowerCase().includes(termo) &&
        !ciclo.matricula.toLowerCase().includes(termo) &&
        !ciclo.avaliador_nome.toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [painel, filtroTipo, filtroStatus, busca]);

  const ciclos = painel?.ciclos ?? [];
  const abertas = ciclos.filter((c) => STATUS_VIVOS.includes(c.status));
  const vencidas = abertas.filter((c) => c.dias_para_prazo < 0);
  const aguardandoDecisao = ciclos.filter((c) => c.status === "consolidado");

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        {painel?.pode.configurar && (
          <Link className={acaoCabecalho} href="/avaliacoes/modelos">
            Modelos
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Avaliações</h1>
          {painel?.pode.configurar && (
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={() => {
                setPrazoLote("");
                setErroLote(null);
                setResultadoLote(null);
                setDialogoLote(true);
              }}
              disabled={!painel.modelo_ativo}
            >
              + Abrir ciclo de desempenho (lote)
            </button>
          )}
        </div>
        <p className={estilos.subtitulo}>
          Avaliação líder→liderado: experiência (dias 45 e 90 do contrato) e
          desempenho. A flag da faixa é recomendação — a decisão é sempre
          humana e registrada.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !painel && <p className={estilos.vazio}>Carregando…</p>}

        {painel && (
          <>
            {painel.pode.configurar && !painel.modelo_ativo && (
              <div className={comum.avisoAtencao}>
                Nenhum modelo de avaliação ativo — ciclos não podem ser
                abertos. Ative uma versão em{" "}
                <Link href="/avaliacoes/modelos">Modelos</Link>.
              </div>
            )}

            {painel.pendencias_sem_gestor &&
              painel.pendencias_sem_gestor.length > 0 && (
                <div className={comum.avisoAtencao}>
                  <b>
                    {painel.pendencias_sem_gestor.length} marco(s) de
                    experiência sem gestor vigente
                  </b>{" "}
                  — o ciclo só nasce com avaliador definido. Regularize a
                  relação gestor→liderado na ficha do colaborador:
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    {painel.pendencias_sem_gestor.map((p) => (
                      <li key={`${p.matricula}-${p.marco}`}>
                        {p.colaborador_nome} (mat. {p.matricula}) —{" "}
                        {ROTULOS_TIPO_CICLO[p.marco]} · prazo{" "}
                        {formatarData(p.prazo)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {painel.ciclos_gerados_agora > 0 && (
              <div className={comum.avisoInfo}>
                {painel.ciclos_gerados_agora} ciclo(s) de experiência
                aberto(s) automaticamente a partir dos marcos 45/90 da
                admissão.
              </div>
            )}

            {painel.pode.responder && painel.minhas && (
              <section className={estilos.area}>
                <h2 className={estilos.tituloArea}>
                  Minhas avaliações pendentes ({minhasPendentes.length})
                </h2>
                {minhasPendentes.length === 0 ? (
                  <p className={estilos.vazio}>
                    Nenhuma avaliação pendente com você.
                  </p>
                ) : (
                  minhasPendentes.map((ciclo) => (
                    <CartaoCiclo
                      key={ciclo.id}
                      ciclo={ciclo}
                      mostrarAvaliador={false}
                    />
                  ))
                )}
                {minhasEncerradas.length > 0 && (
                  <>
                    <h2 className={estilos.tituloArea}>
                      Minhas avaliações enviadas ({minhasEncerradas.length})
                    </h2>
                    {minhasEncerradas.map((ciclo) => (
                      <CartaoCiclo
                        key={ciclo.id}
                        ciclo={ciclo}
                        mostrarAvaliador={false}
                      />
                    ))}
                  </>
                )}
              </section>
            )}

            {painel.ciclos && (
              <section className={estilos.area}>
                <h2 className={estilos.tituloArea}>Painel de ciclos</h2>

                <div className={estilos.indicadores}>
                  <div className={estilos.cardIndicador}>
                    <div className={estilos.numeroIndicador}>
                      {abertas.length}
                    </div>
                    <div className={estilos.rotuloIndicador}>
                      em andamento
                    </div>
                  </div>
                  <div
                    className={`${estilos.cardIndicador} ${
                      vencidas.length > 0 ? estilos.indicadorAlerta : ""
                    }`}
                  >
                    <div className={estilos.numeroIndicador}>
                      {vencidas.length}
                    </div>
                    <div className={estilos.rotuloIndicador}>
                      com prazo vencido
                    </div>
                  </div>
                  <div className={estilos.cardIndicador}>
                    <div className={estilos.numeroIndicador}>
                      {aguardandoDecisao.length}
                    </div>
                    <div className={estilos.rotuloIndicador}>
                      aguardando decisão
                    </div>
                  </div>
                  <div className={estilos.cardIndicador}>
                    <div className={estilos.numeroIndicador}>
                      {painel.modelo_ativo
                        ? `v${painel.modelo_ativo.versao}`
                        : "—"}
                    </div>
                    <div className={estilos.rotuloIndicador}>
                      modelo vigente
                    </div>
                  </div>
                </div>

                <div className={estilos.filtros}>
                  <label>
                    Tipo{" "}
                    <select
                      value={filtroTipo}
                      onChange={(e) =>
                        setFiltroTipo(e.target.value as "todos" | TipoCiclo)
                      }
                    >
                      <option value="todos">Todos</option>
                      {TIPOS_CICLO.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {ROTULOS_TIPO_CICLO[tipo]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status{" "}
                    <select
                      value={filtroStatus}
                      onChange={(e) =>
                        setFiltroStatus(
                          e.target.value as "vivos" | "todos" | StatusCiclo
                        )
                      }
                    >
                      <option value="vivos">Em andamento</option>
                      <option value="consolidado">Aguardando decisão</option>
                      <option value="decidido">Decididas</option>
                      <option value="cancelado">Canceladas</option>
                      <option value="todos">Todos</option>
                    </select>
                  </label>
                  <input
                    type="search"
                    placeholder="Buscar por nome, matrícula ou avaliador"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    style={{ flex: 1, minWidth: 220 }}
                  />
                </div>

                {ciclosFiltrados.length === 0 ? (
                  <p className={estilos.vazio}>
                    Nenhum ciclo com os filtros atuais.
                  </p>
                ) : (
                  ciclosFiltrados.map((ciclo) => (
                    <CartaoCiclo
                      key={ciclo.id}
                      ciclo={ciclo}
                      mostrarAvaliador
                    />
                  ))
                )}
              </section>
            )}
          </>
        )}
      </main>

      {dialogoLote && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Abrir ciclo de desempenho em lote</h3>
            <p className={comum.subDialogo}>
              Abre um ciclo para TODO colaborador ativo com gestor vigente que
              ainda não tenha ciclo de desempenho em andamento. O modelo
              vigente (v{painel?.modelo_ativo?.versao}) é congelado em cada
              ciclo.
            </p>
            {resultadoLote ? (
              <>
                <p>
                  <b>{resultadoLote.abertos}</b> ciclo(s) aberto(s).
                </p>
                {resultadoLote.sem_gestor.length > 0 && (
                  <div className={comum.avisoAtencao}>
                    Ficaram fora por não terem gestor vigente:
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {resultadoLote.sem_gestor.map((c) => (
                        <li key={c.matricula}>
                          {c.colaborador_nome} (mat. {c.matricula})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className={comum.acoesDialogo}>
                  <button
                    className={comum.botaoPrimario}
                    type="button"
                    onClick={() => setDialogoLote(false)}
                  >
                    Fechar
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={abrirLote}>
                <label className={comum.rotuloCampo} htmlFor="prazo-lote">
                  Prazo para os avaliadores responderem
                </label>
                <input
                  className={comum.campo}
                  id="prazo-lote"
                  type="date"
                  required
                  value={prazoLote}
                  onChange={(e) => setPrazoLote(e.target.value)}
                />
                {erroLote && <p className={comum.erroAcao}>{erroLote}</p>}
                <div className={comum.acoesDialogo}>
                  <button
                    className={comum.botaoSecundario}
                    type="button"
                    onClick={() => setDialogoLote(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    className={comum.botaoPrimario}
                    type="submit"
                    disabled={abrindoLote || !prazoLote}
                  >
                    {abrindoLote ? "Abrindo…" : "Abrir lote"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
