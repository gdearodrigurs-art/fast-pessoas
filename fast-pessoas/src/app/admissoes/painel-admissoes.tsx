"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  calcularPrazosExperiencia,
  DIAS_ALERTA_EXPERIENCIA,
} from "@/dominios/admissao/esquemas";
import { CartaoProcesso } from "./cartao-processo";
import comum from "./comum.module.css";
import { formatarData } from "./formato";
import estilos from "./page.module.css";
import { Painel, Processo } from "./tipos";

type Aba = "em_preparacao" | "encerrados";

export function PainelAdmissoes() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("em_preparacao");

  const [dialogoNovo, setDialogoNovo] = useState(false);
  const [novoColaborador, setNovoColaborador] = useState("");
  const [novaDataInicio, setNovaDataInicio] = useState("");
  const [novoExperiencia, setNovoExperiencia] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erroCriacao, setErroCriacao] = useState<string | null>(null);

  // Incrementar "versao" força uma nova busca (após abrir um processo).
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/admissoes");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setPainel(dados as Painel);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar as admissões.");
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

  function recarregar() {
    setVersao((atual) => atual + 1);
  }

  function abrirDialogoNovo() {
    const primeiro = painel?.candidatos?.[0];
    setNovoColaborador(primeiro ? String(primeiro.id) : "");
    setNovaDataInicio(primeiro?.data_admissao ?? "");
    setNovoExperiencia(true);
    setErroCriacao(null);
    setDialogoNovo(true);
  }

  function escolherColaborador(id: string) {
    setNovoColaborador(id);
    const candidato = painel?.candidatos?.find((c) => String(c.id) === id);
    if (candidato) setNovaDataInicio(candidato.data_admissao);
  }

  async function criarProcesso(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCriando(true);
    setErroCriacao(null);
    try {
      const resposta = await fetch("/api/admissoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: Number(novoColaborador),
          data_inicio_prevista: novaDataInicio,
          contrato_experiencia: novoExperiencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogoNovo(false);
        setAba("em_preparacao");
        recarregar();
      } else {
        setErroCriacao(dados.erro ?? "Não foi possível abrir o processo.");
      }
    } catch {
      setErroCriacao("Falha de conexão. Tente novamente.");
    } finally {
      setCriando(false);
    }
  }

  const emPreparacao =
    painel?.processos.filter((p) => p.estado === "em_preparacao") ?? [];
  const encerrados =
    painel?.processos.filter((p) => p.estado !== "em_preparacao") ?? [];

  const experienciaVencendo = emPreparacao.filter((p) =>
    prazoEmAlerta(p)
  ).length;

  const candidatoEscolhido = painel?.candidatos?.find(
    (c) => String(c.id) === novoColaborador
  );
  const previaPrazos =
    novoExperiencia && candidatoEscolhido
      ? calcularPrazosExperiencia(candidatoEscolhido.data_admissao)
      : null;

  function listaProcessos(lista: Processo[], vazio: string) {
    return (
      <section className={estilos.area}>
        {lista.length === 0 ? (
          <p className={estilos.vazio}>{vazio}</p>
        ) : (
          lista.map((processo) => (
            <CartaoProcesso
              key={processo.id}
              processo={processo}
              comLinkDetalhe
            />
          ))
        )}
      </section>
    );
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Admissões</h1>
          {painel?.pode.gerir && (
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={abrirDialogoNovo}
              disabled={!painel.candidatos || painel.candidatos.length === 0}
            >
              + Novo processo
            </button>
          )}
        </div>
        <p className={estilos.subtitulo}>
          Preparação da entrada de cada admitido: checklist da admissão e
          prazos do contrato de experiência (45/90 dias).
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !painel && <p className={estilos.vazio}>Carregando…</p>}

        {painel && (
          <>
            {!painel.pode.gerir && (
              <div className={estilos.notaLeitura}>
                Você vê os processos de admissão dos seus liderados —{" "}
                <b>somente leitura</b>; quem trata o checklist é o DP.
              </div>
            )}

            {painel.pode.gerir && (
              <div className={estilos.indicadores}>
                <div className={estilos.cardIndicador}>
                  <div className={estilos.numeroIndicador}>
                    {emPreparacao.length}
                  </div>
                  <div className={estilos.rotuloIndicador}>em preparação</div>
                </div>
                <div
                  className={`${estilos.cardIndicador} ${
                    experienciaVencendo > 0 ? estilos.indicadorAlerta : ""
                  }`}
                >
                  <div className={estilos.numeroIndicador}>
                    {experienciaVencendo}
                  </div>
                  <div className={estilos.rotuloIndicador}>
                    experiência vencendo (≤{DIAS_ALERTA_EXPERIENCIA} dias)
                  </div>
                </div>
                <div className={estilos.cardIndicador}>
                  <div className={estilos.numeroIndicador}>
                    {painel.indicador_no_prazo === null
                      ? "—"
                      : `${painel.indicador_no_prazo}%`}
                  </div>
                  <div className={estilos.rotuloIndicador}>
                    admissões no prazo (12m)
                  </div>
                </div>
              </div>
            )}

            <div className={estilos.abasPrincipais}>
              <button
                className={`${estilos.aba} ${aba === "em_preparacao" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("em_preparacao")}
              >
                Em preparação ({emPreparacao.length})
              </button>
              <button
                className={`${estilos.aba} ${aba === "encerrados" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("encerrados")}
              >
                Concluídos / cancelados ({encerrados.length})
              </button>
            </div>

            {aba === "em_preparacao" &&
              listaProcessos(
                emPreparacao,
                "Nenhum processo de admissão em preparação."
              )}
            {aba === "encerrados" &&
              listaProcessos(encerrados, "Nenhum processo encerrado ainda.")}
          </>
        )}
      </main>

      {dialogoNovo && painel?.candidatos && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Novo processo de admissão</h3>
            <p className={comum.subDialogo}>
              O checklist vigente é congelado no processo; os prazos de
              experiência (dia 45 e dia 90) contam da data de admissão.
            </p>
            <form onSubmit={criarProcesso}>
              <label className={comum.rotuloCampo} htmlFor="colaborador-novo">
                Colaborador (sem processo aberto)
              </label>
              <select
                className={comum.campo}
                id="colaborador-novo"
                value={novoColaborador}
                onChange={(e) => escolherColaborador(e.target.value)}
              >
                {painel.candidatos.map((candidato) => (
                  <option key={candidato.id} value={String(candidato.id)}>
                    {candidato.nome_completo} — mat. {candidato.matricula} —
                    admissão {formatarData(candidato.data_admissao)}
                  </option>
                ))}
              </select>

              <label className={comum.rotuloCampo} htmlFor="inicio-previsto">
                Data de início prevista
              </label>
              <input
                className={comum.campo}
                id="inicio-previsto"
                type="date"
                required
                value={novaDataInicio}
                onChange={(e) => setNovaDataInicio(e.target.value)}
              />

              <label className={comum.linhaMarcacao} htmlFor="experiencia-novo">
                <input
                  id="experiencia-novo"
                  type="checkbox"
                  checked={novoExperiencia}
                  onChange={(e) => setNovoExperiencia(e.target.checked)}
                />
                Contrato de experiência (45 + 45 dias — art. 445 CLT)
              </label>
              {previaPrazos && (
                <p className={comum.dica}>
                  1º período (dia 45) até{" "}
                  {formatarData(previaPrazos.prazo_experiencia_1)} ·
                  prorrogação (dia 90) até{" "}
                  {formatarData(previaPrazos.prazo_experiencia_2)}
                </p>
              )}

              {erroCriacao && <p className={comum.erroAcao}>{erroCriacao}</p>}
              <div className={comum.acoesDialogo}>
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => setDialogoNovo(false)}
                >
                  Cancelar
                </button>
                <button
                  className={comum.botaoPrimario}
                  type="submit"
                  disabled={criando || !novoColaborador}
                >
                  {criando ? "Abrindo…" : "Abrir processo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Processo com prazo de experiência a vencer em ≤ 10 dias (e ainda não vencido). */
function prazoEmAlerta(processo: Processo): boolean {
  for (const dias of [processo.dias_prazo_1, processo.dias_prazo_2]) {
    if (dias !== null && dias >= 0 && dias <= DIAS_ALERTA_EXPERIENCIA) {
      return true;
    }
  }
  return false;
}
