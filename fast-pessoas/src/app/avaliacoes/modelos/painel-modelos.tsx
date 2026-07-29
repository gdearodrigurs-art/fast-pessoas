"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  EstruturaModeloEntrada,
  RECOMENDACOES,
  ROTULOS_RECOMENDACAO,
  Recomendacao,
  validarAtivacao,
} from "@/dominios/avaliacao/esquemas";
import comum from "../comum.module.css";
import { formatarData } from "../formato";
import { Estrutura, PainelModelos } from "../tipos";
import estilos from "./page.module.css";

interface IndicadorForm {
  nome: string;
  descricao: string;
  peso: string;
}

interface PilarForm {
  nome: string;
  peso: string;
  indicadores: IndicadorForm[];
}

interface FaixaForm {
  minimo: string;
  maximo: string;
  rotulo: string;
  recomendacao: Recomendacao;
}

interface Formulario {
  nome: string;
  pilares: PilarForm[];
  faixas: FaixaForm[];
}

function paraFormulario(estrutura: Estrutura): Formulario {
  return {
    nome: estrutura.nome,
    pilares: estrutura.pilares.map((pilar) => ({
      nome: pilar.nome,
      peso: String(pilar.peso),
      indicadores: pilar.indicadores.map((indicador) => ({
        nome: indicador.nome,
        descricao: indicador.descricao,
        peso: String(indicador.peso),
      })),
    })),
    faixas: estrutura.faixas.map((faixa) => ({
      minimo: String(faixa.minimo),
      maximo: String(faixa.maximo),
      rotulo: faixa.rotulo,
      recomendacao: faixa.recomendacao,
    })),
  };
}

/** Converte o formulário para o payload da API (números; NaN vira 0). */
function paraEntrada(form: Formulario): EstruturaModeloEntrada {
  const numero = (valor: string) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    nome: form.nome,
    pilares: form.pilares.map((pilar) => ({
      nome: pilar.nome,
      peso: numero(pilar.peso),
      indicadores: pilar.indicadores.map((indicador) => ({
        nome: indicador.nome,
        descricao: indicador.descricao,
        peso: numero(indicador.peso),
      })),
    })),
    faixas: form.faixas.map((faixa) => ({
      minimo: numero(faixa.minimo),
      maximo: numero(faixa.maximo),
      rotulo: faixa.rotulo,
      recomendacao: faixa.recomendacao,
    })),
  };
}

function EstruturaLeitura({ estrutura }: { estrutura: Estrutura }) {
  return (
    <>
      {estrutura.pilares.map((pilar) => (
        <section className={estilos.cartaoPilar} key={pilar.id}>
          <div className={estilos.cabecalhoPilar}>
            <h3>{pilar.nome}</h3>
            <span className={estilos.peso}>peso {pilar.peso}%</span>
          </div>
          {pilar.indicadores.map((indicador) => (
            <div className={estilos.linhaIndicadorLeitura} key={indicador.id}>
              <div>
                <div>{indicador.nome}</div>
                <div className={estilos.descricao}>{indicador.descricao}</div>
              </div>
              <span className={estilos.peso}>{indicador.peso}</span>
            </div>
          ))}
        </section>
      ))}
      <section className={estilos.cartaoPilar}>
        <div className={estilos.cabecalhoPilar}>
          <h3>Faixas de resultado</h3>
          <span className={estilos.descricao}>
            [mínimo, máximo) — a última faixa inclui 100
          </span>
        </div>
        {estrutura.faixas.map((faixa) => (
          <div className={estilos.linhaFaixaLeitura} key={faixa.id}>
            <span className={estilos.faixaIntervalo}>
              {faixa.minimo}–{faixa.maximo}
            </span>
            <span>{faixa.rotulo}</span>
            <span className={`${comum.badge} ${comum.badgeInfo}`}>
              {ROTULOS_RECOMENDACAO[faixa.recomendacao]}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

export function PainelModelosAvaliacao() {
  const [painel, setPainel] = useState<PainelModelos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [avisoSalvo, setAvisoSalvo] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/avaliacoes/modelos");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          const carregado = dados as PainelModelos;
          setPainel(carregado);
          setErro(null);
          setForm(
            carregado.rascunho ? paraFormulario(carregado.rascunho) : null
          );
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os modelos.");
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

  const entrada = useMemo(() => (form ? paraEntrada(form) : null), [form]);
  const problemas = useMemo(
    () => (entrada ? validarAtivacao(entrada) : []),
    [entrada]
  );

  function editar(mutar: (form: Formulario) => Formulario) {
    setAvisoSalvo(null);
    setForm((atual) => (atual ? mutar(atual) : atual));
  }

  function iniciarNovaVersao() {
    const base: Formulario = painel?.ativa
      ? paraFormulario(painel.ativa)
      : {
          nome: "",
          pilares: [{ nome: "", peso: "100", indicadores: [novoIndicador()] }],
          faixas: [
            {
              minimo: "0",
              maximo: "100",
              rotulo: "",
              recomendacao: "desenvolver",
            },
          ],
        };
    setForm({
      ...base,
      nome: painel?.ativa ? `${painel.ativa.nome}` : base.nome,
    });
    setErroAcao(null);
    setAvisoSalvo(null);
  }

  function novoIndicador(): IndicadorForm {
    return { nome: "", descricao: "", peso: "10" };
  }

  async function salvarRascunho(): Promise<boolean> {
    if (!entrada) return false;
    setSalvando(true);
    setErroAcao(null);
    setAvisoSalvo(null);
    try {
      const existente = painel?.rascunho;
      const resposta = await fetch(
        existente
          ? `/api/avaliacoes/modelos/${existente.modelo_versao_id}`
          : "/api/avaliacoes/modelos",
        {
          method: existente ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entrada),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAcao(dados.erro ?? "Não foi possível salvar o rascunho.");
        return false;
      }
      setAvisoSalvo("Rascunho salvo.");
      if (!existente) {
        setVersao((atual) => atual + 1);
      }
      return true;
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function ativar() {
    if (!painel?.rascunho) {
      // Primeiro salva (cria o rascunho), depois o RH ativa na recarga.
      const ok = await salvarRascunho();
      if (ok) {
        setAvisoSalvo(
          "Rascunho criado — confira e clique em Ativar para publicar."
        );
      }
      return;
    }
    setAtivando(true);
    setErroAcao(null);
    try {
      const salvo = await salvarRascunho();
      if (!salvo) return;
      const resposta = await fetch(
        `/api/avaliacoes/modelos/${painel.rascunho.modelo_versao_id}/ativar`,
        { method: "POST" }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setForm(null);
        setVersao((atual) => atual + 1);
      } else {
        setErroAcao(dados.erro ?? "Não foi possível ativar a versão.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setAtivando(false);
    }
  }

  const somaPilares =
    entrada?.pilares.reduce((s, p) => s + p.peso, 0) ?? 0;

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/avaliacoes">
          Avaliações
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Modelos de avaliação</h1>
          {painel && !form && (
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={iniciarNovaVersao}
            >
              + Nova versão
            </button>
          )}
        </div>
        <p className={estilos.subtitulo}>
          Pilares, indicadores, pesos e faixas são DADO versionado: a versão
          ativa é imutável — corrigir é criar e ativar uma nova versão, que
          vale só para ciclos abertos depois dela. Sem recálculo retroativo.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !painel && <p className={estilos.vazio}>Carregando…</p>}

        {painel && (
          <>
            {/* ---------------- editor (rascunho/nova versão) ---------------- */}
            {form && entrada && (
              <section>
                <h2 className={estilos.tituloArea}>
                  {painel.rascunho
                    ? `Rascunho — v${painel.rascunho.versao}`
                    : "Nova versão (rascunho)"}
                </h2>

                <label className={comum.rotuloCampo} htmlFor="nome-modelo">
                  Nome do modelo
                </label>
                <input
                  className={comum.campo}
                  id="nome-modelo"
                  value={form.nome}
                  onChange={(e) =>
                    editar((f) => ({ ...f, nome: e.target.value }))
                  }
                />

                {form.pilares.map((pilar, iPilar) => {
                  const somaIndicadores = pilar.indicadores.reduce(
                    (s, i) => s + (Number(i.peso) || 0),
                    0
                  );
                  return (
                    <section className={estilos.cartaoPilar} key={iPilar}>
                      <div className={estilos.cabecalhoPilar}>
                        <input
                          className={comum.campo}
                          style={{ flex: 1, minWidth: 180 }}
                          placeholder="Nome do pilar"
                          value={pilar.nome}
                          aria-label={`Nome do pilar ${iPilar + 1}`}
                          onChange={(e) =>
                            editar((f) => ({
                              ...f,
                              pilares: f.pilares.map((p, i) =>
                                i === iPilar ? { ...p, nome: e.target.value } : p
                              ),
                            }))
                          }
                        />
                        <input
                          className={comum.campo}
                          style={{ width: 90 }}
                          type="number"
                          min={1}
                          max={100}
                          value={pilar.peso}
                          aria-label={`Peso do pilar ${iPilar + 1} (%)`}
                          onChange={(e) =>
                            editar((f) => ({
                              ...f,
                              pilares: f.pilares.map((p, i) =>
                                i === iPilar ? { ...p, peso: e.target.value } : p
                              ),
                            }))
                          }
                        />
                        <button
                          className={estilos.botaoRemover}
                          type="button"
                          title="Remover pilar"
                          onClick={() =>
                            editar((f) => ({
                              ...f,
                              pilares: f.pilares.filter((_, i) => i !== iPilar),
                            }))
                          }
                        >
                          ×
                        </button>
                      </div>
                      <p
                        className={
                          somaIndicadores === 100
                            ? estilos.somaOk
                            : estilos.somaErro
                        }
                      >
                        Soma dos indicadores: {somaIndicadores} / 100
                      </p>
                      {pilar.indicadores.map((indicador, iInd) => (
                        <div className={estilos.linhaIndicador} key={iInd}>
                          <div>
                            <input
                              className={comum.campo}
                              placeholder="Nome do indicador"
                              value={indicador.nome}
                              aria-label={`Indicador ${iInd + 1} do pilar ${iPilar + 1}`}
                              onChange={(e) =>
                                editar((f) => ({
                                  ...f,
                                  pilares: f.pilares.map((p, i) =>
                                    i === iPilar
                                      ? {
                                          ...p,
                                          indicadores: p.indicadores.map(
                                            (ind, j) =>
                                              j === iInd
                                                ? { ...ind, nome: e.target.value }
                                                : ind
                                          ),
                                        }
                                      : p
                                  ),
                                }))
                              }
                            />
                            <textarea
                              className={`${comum.campo}`}
                              style={{ marginTop: 6, minHeight: 48 }}
                              placeholder="Descrição (régua do avaliador) — obrigatória"
                              value={indicador.descricao}
                              aria-label={`Descrição do indicador ${iInd + 1}`}
                              onChange={(e) =>
                                editar((f) => ({
                                  ...f,
                                  pilares: f.pilares.map((p, i) =>
                                    i === iPilar
                                      ? {
                                          ...p,
                                          indicadores: p.indicadores.map(
                                            (ind, j) =>
                                              j === iInd
                                                ? {
                                                    ...ind,
                                                    descricao: e.target.value,
                                                  }
                                                : ind
                                          ),
                                        }
                                      : p
                                  ),
                                }))
                              }
                            />
                          </div>
                          <input
                            className={comum.campo}
                            type="number"
                            min={1}
                            max={100}
                            value={indicador.peso}
                            aria-label={`Peso do indicador ${iInd + 1}`}
                            onChange={(e) =>
                              editar((f) => ({
                                ...f,
                                pilares: f.pilares.map((p, i) =>
                                  i === iPilar
                                    ? {
                                        ...p,
                                        indicadores: p.indicadores.map(
                                          (ind, j) =>
                                            j === iInd
                                              ? { ...ind, peso: e.target.value }
                                              : ind
                                        ),
                                      }
                                    : p
                                ),
                              }))
                            }
                          />
                          <button
                            className={estilos.botaoRemover}
                            type="button"
                            title="Remover indicador"
                            onClick={() =>
                              editar((f) => ({
                                ...f,
                                pilares: f.pilares.map((p, i) =>
                                  i === iPilar
                                    ? {
                                        ...p,
                                        indicadores: p.indicadores.filter(
                                          (_, j) => j !== iInd
                                        ),
                                      }
                                    : p
                                ),
                              }))
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        className={comum.ligacaoLeve}
                        type="button"
                        onClick={() =>
                          editar((f) => ({
                            ...f,
                            pilares: f.pilares.map((p, i) =>
                              i === iPilar
                                ? {
                                    ...p,
                                    indicadores: [
                                      ...p.indicadores,
                                      novoIndicador(),
                                    ],
                                  }
                                : p
                            ),
                          }))
                        }
                      >
                        + indicador
                      </button>
                    </section>
                  );
                })}

                <p
                  className={
                    somaPilares === 100 ? estilos.somaOk : estilos.somaErro
                  }
                >
                  Soma dos pesos dos pilares: {somaPilares} / 100
                </p>
                <button
                  className={comum.ligacaoLeve}
                  type="button"
                  onClick={() =>
                    editar((f) => ({
                      ...f,
                      pilares: [
                        ...f.pilares,
                        { nome: "", peso: "10", indicadores: [novoIndicador()] },
                      ],
                    }))
                  }
                >
                  + pilar
                </button>

                <section className={estilos.cartaoPilar}>
                  <div className={estilos.cabecalhoPilar}>
                    <h3>Faixas de resultado</h3>
                    <span className={estilos.descricao}>
                      contíguas, cobrindo 0–100; [mínimo, máximo), última
                      inclui 100
                    </span>
                  </div>
                  {form.faixas.map((faixa, iFaixa) => (
                    <div className={estilos.linhaFaixa} key={iFaixa}>
                      <input
                        className={comum.campo}
                        type="number"
                        min={0}
                        max={100}
                        value={faixa.minimo}
                        aria-label={`Mínimo da faixa ${iFaixa + 1}`}
                        onChange={(e) =>
                          editar((f) => ({
                            ...f,
                            faixas: f.faixas.map((fx, i) =>
                              i === iFaixa
                                ? { ...fx, minimo: e.target.value }
                                : fx
                            ),
                          }))
                        }
                      />
                      <input
                        className={comum.campo}
                        type="number"
                        min={0}
                        max={100}
                        value={faixa.maximo}
                        aria-label={`Máximo da faixa ${iFaixa + 1}`}
                        onChange={(e) =>
                          editar((f) => ({
                            ...f,
                            faixas: f.faixas.map((fx, i) =>
                              i === iFaixa
                                ? { ...fx, maximo: e.target.value }
                                : fx
                            ),
                          }))
                        }
                      />
                      <input
                        className={comum.campo}
                        placeholder="Rótulo da faixa"
                        value={faixa.rotulo}
                        aria-label={`Rótulo da faixa ${iFaixa + 1}`}
                        onChange={(e) =>
                          editar((f) => ({
                            ...f,
                            faixas: f.faixas.map((fx, i) =>
                              i === iFaixa
                                ? { ...fx, rotulo: e.target.value }
                                : fx
                            ),
                          }))
                        }
                      />
                      <select
                        className={comum.campo}
                        value={faixa.recomendacao}
                        aria-label={`Recomendação da faixa ${iFaixa + 1}`}
                        onChange={(e) =>
                          editar((f) => ({
                            ...f,
                            faixas: f.faixas.map((fx, i) =>
                              i === iFaixa
                                ? {
                                    ...fx,
                                    recomendacao: e.target
                                      .value as Recomendacao,
                                  }
                                : fx
                            ),
                          }))
                        }
                      >
                        {RECOMENDACOES.map((rec) => (
                          <option key={rec} value={rec}>
                            {ROTULOS_RECOMENDACAO[rec]}
                          </option>
                        ))}
                      </select>
                      <button
                        className={estilos.botaoRemover}
                        type="button"
                        title="Remover faixa"
                        onClick={() =>
                          editar((f) => ({
                            ...f,
                            faixas: f.faixas.filter((_, i) => i !== iFaixa),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className={comum.ligacaoLeve}
                    type="button"
                    onClick={() =>
                      editar((f) => ({
                        ...f,
                        faixas: [
                          ...f.faixas,
                          {
                            minimo: "0",
                            maximo: "100",
                            rotulo: "",
                            recomendacao: "desenvolver",
                          },
                        ],
                      }))
                    }
                  >
                    + faixa
                  </button>
                </section>

                {problemas.length > 0 ? (
                  <div className={estilos.problemas}>
                    <b>Para ativar, corrija:</b>
                    <ul>
                      {problemas.map((problema, i) => (
                        <li key={i}>{problema.mensagem}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className={estilos.pronto}>
                    Somas conferem (pilares = 100; indicadores = 100 por
                    pilar; faixas contíguas 0–100) — pronto para ativar.
                  </div>
                )}

                {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
                {avisoSalvo && <p className={estilos.pronto}>{avisoSalvo}</p>}

                <div className={estilos.barraAcoes}>
                  <button
                    className={comum.botaoSecundario}
                    type="button"
                    onClick={() => {
                      setForm(
                        painel.rascunho
                          ? paraFormulario(painel.rascunho)
                          : null
                      );
                      setErroAcao(null);
                      setAvisoSalvo(null);
                    }}
                  >
                    Descartar alterações
                  </button>
                  <button
                    className={comum.botaoSecundario}
                    type="button"
                    onClick={salvarRascunho}
                    disabled={salvando}
                  >
                    {salvando ? "Salvando…" : "Salvar rascunho"}
                  </button>
                  <button
                    className={comum.botaoPrimario}
                    type="button"
                    onClick={ativar}
                    disabled={ativando || salvando || problemas.length > 0}
                    title={
                      problemas.length > 0
                        ? "Corrija os problemas listados para ativar"
                        : undefined
                    }
                  >
                    {ativando
                      ? "Ativando…"
                      : painel.rascunho
                        ? "Ativar esta versão"
                        : "Criar rascunho"}
                  </button>
                </div>
              </section>
            )}

            {/* ---------------- versão vigente (read-only) ---------------- */}
            <h2 className={estilos.tituloArea}>
              {painel.ativa
                ? `Versão vigente — v${painel.ativa.versao} · ${painel.ativa.nome}`
                : "Nenhuma versão ativa"}
            </h2>
            {painel.ativa ? (
              <>
                <div className={comum.avisoInfo}>
                  Versão ativa é <b>somente leitura</b> — mudanças viram uma
                  nova versão e valem apenas para ciclos abertos depois dela.
                </div>
                <EstruturaLeitura estrutura={painel.ativa} />
              </>
            ) : (
              <p className={estilos.vazio}>
                Sem modelo ativo, nenhum ciclo pode ser aberto. Crie e ative
                uma versão.
              </p>
            )}

            {/* ---------------- histórico ---------------- */}
            {painel.modelos.length > 0 && (
              <>
                <h2 className={estilos.tituloArea}>Histórico de versões</h2>
                <ul className={estilos.listaVersoes}>
                  {painel.modelos.map((modelo) => (
                    <li key={modelo.id}>
                      v{modelo.versao} · {modelo.nome} —{" "}
                      {modelo.status === "ativa"
                        ? `ativa desde ${formatarData(modelo.inicio_vigencia)}`
                        : modelo.status === "rascunho"
                          ? "rascunho"
                          : `encerrada em ${modelo.fim_vigencia ? formatarData(modelo.fim_vigencia) : "—"}`}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
