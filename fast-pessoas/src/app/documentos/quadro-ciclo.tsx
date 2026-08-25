"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  EstadoPendencia,
  ROTULOS_ESTADO_PENDENCIA,
} from "@/dominios/documentos/esquemas";
import estilos from "./page.module.css";

// ===========================================================================
// QUADRO DO CICLO DE CIÊNCIA de um documento (admin — rh.conduta.gerir):
// quem assinou / recusou / pendente / liberado, prazos, atos com testemunhas,
// lembrete manual, abertura de ato (B2) e liberação (B6, rh.conduta.liberar).
// Tudo que decide mora no servidor; esta tela só pede e mostra.
// ===========================================================================

interface PessoaDoCiclo {
  usuario_id: number;
  nome: string;
  papel: string;
  ciencia_em: string | null;
  recusada_em: string | null;
  recusa_motivo: string | null;
  liberado_em: string | null;
  liberacao_justificativa: string | null;
  liberado_por_nome: string | null;
  ato_id: number | null;
  data_limite: string | null;
  vencida: boolean;
  estado: EstadoPendencia;
  bloqueia: boolean;
}

interface AtoDoCiclo {
  id: number;
  usuario_id: number;
  usuario_nome: string;
  origem: "recusa" | "prazo_vencido";
  descricao: string;
  aberto_em: string;
  aberto_por_nome: string;
  desfecho: string | null;
  desfecho_em: string | null;
  desfecho_por_nome: string | null;
  testemunhas: {
    usuario_id: number;
    nome: string;
    confirmado_em: string | null;
  }[];
}

interface VisaoCiclo {
  documento: {
    id: number;
    titulo: string;
    categoria: string;
    exige_ciencia: boolean;
    bloqueante: boolean;
    prazo_ciencia_dias: number | null;
    substituido_por_id: number | null;
  };
  pessoas: PessoaDoCiclo[];
  atos: AtoDoCiclo[];
}

const ROTULOS_ORIGEM: Record<AtoDoCiclo["origem"], string> = {
  recusa: "Recusa",
  prazo_vencido: "Prazo vencido",
};

const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatarDataHora(iso: string): string {
  return formatadorDataHora.format(new Date(iso));
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeDoEstado(estado: EstadoPendencia): string {
  switch (estado) {
    case "assinado":
      return estilos.etiquetaCiente;
    case "recusado":
      return estilos.etiquetaRecusado;
    case "vencido":
      return estilos.etiquetaVencido;
    case "liberado":
      return estilos.etiquetaLiberado;
    default:
      return estilos.etiquetaPendente;
  }
}

export function QuadroCiclo({
  documentoId,
  usuarioId,
  podeLiberar,
  aoFechar,
}: {
  documentoId: number;
  /** Usuário da sessão — sai das opções de testemunha (quem abre não testemunha). */
  usuarioId: number;
  podeLiberar: boolean;
  aoFechar: () => void;
}) {
  const [ciclo, setCiclo] = useState<VisaoCiclo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Formulário de abertura de ato (B2) — por pessoa.
  const [atoPara, setAtoPara] = useState<PessoaDoCiclo | null>(null);
  const [origemAto, setOrigemAto] = useState<"recusa" | "prazo_vencido">(
    "recusa"
  );
  const [descricaoAto, setDescricaoAto] = useState("");
  const [testemunha1, setTestemunha1] = useState("");
  const [testemunha2, setTestemunha2] = useState("");

  const [desfechoPorAto, setDesfechoPorAto] = useState<Record<number, string>>(
    {}
  );

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch(`/api/documentos/${documentoId}/ciclo`);
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setCiclo(dados.ciclo ?? null);
        setErro(null);
      } else {
        setErro(dados.erro ?? "Não foi possível carregar o ciclo.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    }
  }, [documentoId]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  async function chamar(
    caminho: string,
    metodo: "POST" | "PATCH",
    corpo: unknown,
    sucesso: string
  ): Promise<boolean> {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resposta = await fetch(caminho, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setAviso(sucesso);
        await carregar();
        return true;
      }
      setErro(dados.erro ?? "A operação falhou.");
      return false;
    } catch {
      setErro("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function enviarLembrete() {
    await chamar(
      `/api/documentos/${documentoId}/lembrete`,
      "POST",
      undefined,
      "Lembrete enviado aos pendentes."
    );
  }

  function abrirFormularioAto(pessoa: PessoaDoCiclo) {
    setAtoPara(pessoa);
    setOrigemAto(pessoa.recusada_em ? "recusa" : "prazo_vencido");
    setDescricaoAto("");
    setTestemunha1("");
    setTestemunha2("");
  }

  async function submeterAto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!atoPara) return;
    const feito = await chamar(
      `/api/documentos/${documentoId}/ato-testemunhas`,
      "POST",
      {
        usuario_id: atoPara.usuario_id,
        origem: origemAto,
        descricao: descricaoAto,
        testemunhas: [Number(testemunha1), Number(testemunha2)],
      },
      "Ato aberto — as testemunhas foram avisadas para confirmar."
    );
    if (feito) setAtoPara(null);
  }

  async function liberar(pessoa: PessoaDoCiclo) {
    const justificativa = window.prompt(
      `Liberar o acesso de ${pessoa.nome}?\n\nA liberação é auditada e fica visível no ciclo. Justificativa:`
    );
    if (justificativa === null) return;
    if (justificativa.trim().length < 5) {
      setErro("Justifique a liberação (mínimo 5 caracteres).");
      return;
    }
    await chamar(
      `/api/documentos/${documentoId}/liberar`,
      "POST",
      { usuario_id: pessoa.usuario_id, justificativa: justificativa.trim() },
      `Acesso de ${pessoa.nome} liberado.`
    );
  }

  async function registrarDesfecho(ato: AtoDoCiclo) {
    const desfecho = (desfechoPorAto[ato.id] ?? "").trim();
    if (desfecho.length < 5) {
      setErro("Descreva o desfecho (mínimo 5 caracteres).");
      return;
    }
    const feito = await chamar(
      `/api/documentos/${documentoId}/ato-testemunhas`,
      "PATCH",
      { acao: "desfecho", ato_id: ato.id, desfecho },
      "Desfecho registrado."
    );
    if (feito) {
      setDesfechoPorAto((atual) => ({ ...atual, [ato.id]: "" }));
    }
  }

  const opcoesTestemunha = (alvo: PessoaDoCiclo) =>
    (ciclo?.pessoas ?? []).filter(
      (pessoa) =>
        pessoa.usuario_id !== alvo.usuario_id &&
        pessoa.usuario_id !== usuarioId
    );

  return (
    <div
      className={estilos.fundoDialogo}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        className={estilos.dialogoCiclo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ciclo"
      >
        <div className={estilos.cabecalhoDialogo}>
          <div>
            <h3 id="titulo-ciclo">
              Ciclo de ciência
              {ciclo?.documento.bloqueante && (
                <span className={estilos.etiquetaBloqueante}>Bloqueante</span>
              )}
            </h3>
            <p className={estilos.subDialogo}>
              {ciclo
                ? `${ciclo.documento.titulo}${
                    ciclo.documento.prazo_ciencia_dias
                      ? ` · prazo de ${ciclo.documento.prazo_ciencia_dias} dia(s)`
                      : ""
                  }`
                : "Carregando…"}
            </p>
          </div>
          <div className={estilos.acoesLinha}>
            <button
              className={estilos.botaoLinha}
              type="button"
              disabled={ocupado || !ciclo}
              onClick={enviarLembrete}
            >
              Enviar lembrete aos pendentes
            </button>
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={aoFechar}
              aria-label="Fechar quadro do ciclo"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className={estilos.secaoCiclo}>
          {erro && <p className={estilos.erro}>{erro}</p>}
          {aviso && <p className={estilos.sucesso}>{aviso}</p>}

          {ciclo && (
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Estado</th>
                    <th>Prazo</th>
                    <th>Acesso</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ciclo.pessoas.map((pessoa) => (
                    <tr key={pessoa.usuario_id}>
                      <td>
                        {pessoa.nome}
                        <span className={estilos.detalheArquivo}>
                          {pessoa.papel}
                        </span>
                      </td>
                      <td>
                        <span className={classeDoEstado(pessoa.estado)}>
                          {ROTULOS_ESTADO_PENDENCIA[pessoa.estado]}
                        </span>
                        <span className={estilos.detalheArquivo}>
                          {pessoa.ciencia_em &&
                            `em ${formatarDataHora(pessoa.ciencia_em)}`}
                          {pessoa.recusada_em &&
                            !pessoa.ciencia_em &&
                            `em ${formatarDataHora(pessoa.recusada_em)}${
                              pessoa.recusa_motivo
                                ? ` — ${pessoa.recusa_motivo}`
                                : ""
                            }`}
                          {pessoa.liberado_em &&
                            !pessoa.ciencia_em &&
                            !pessoa.recusada_em &&
                            `em ${formatarDataHora(pessoa.liberado_em)} por ${
                              pessoa.liberado_por_nome ?? "—"
                            }`}
                        </span>
                      </td>
                      <td>
                        {pessoa.data_limite
                          ? `${formatarData(pessoa.data_limite)}${
                              pessoa.vencida && !pessoa.ciencia_em
                                ? " (vencido)"
                                : ""
                            }`
                          : "—"}
                      </td>
                      <td>
                        {pessoa.bloqueia ? (
                          <span className={estilos.etiquetaRecusado}>
                            Bloqueado
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className={estilos.acoesLinha}>
                          {!pessoa.ciencia_em && pessoa.ato_id === null && (
                            <button
                              className={estilos.botaoLinha}
                              type="button"
                              disabled={ocupado}
                              onClick={() => abrirFormularioAto(pessoa)}
                            >
                              Abrir ato
                            </button>
                          )}
                          {podeLiberar && pessoa.bloqueia && (
                            <button
                              className={estilos.botaoLinha}
                              type="button"
                              disabled={ocupado}
                              onClick={() => liberar(pessoa)}
                            >
                              Liberar acesso
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {atoPara && ciclo && (
            <form className={estilos.formAto} onSubmit={submeterAto}>
              <h4>
                Abrir ato com testemunhas — {atoPara.nome} (
                {ROTULOS_ORIGEM[origemAto]})
              </h4>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="origem-ato">
                  Origem do ato
                </label>
                <select
                  className={estilos.campo}
                  id="origem-ato"
                  value={origemAto}
                  onChange={(e) =>
                    setOrigemAto(e.target.value as "recusa" | "prazo_vencido")
                  }
                >
                  <option value="recusa">
                    Recusa (registrada no sistema ou verbal)
                  </option>
                  <option value="prazo_vencido">Prazo vencido</option>
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="descricao-ato">
                  Descrição do ato
                </label>
                <textarea
                  className={estilos.campo}
                  id="descricao-ato"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  value={descricaoAto}
                  onChange={(e) => setDescricaoAto(e.target.value)}
                  placeholder="O que aconteceu: apresentação do documento, recusa/perda de prazo, quem estava presente…"
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="testemunha-1">
                  Testemunha 1 (usuária do sistema)
                </label>
                <select
                  className={estilos.campo}
                  id="testemunha-1"
                  required
                  value={testemunha1}
                  onChange={(e) => setTestemunha1(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {opcoesTestemunha(atoPara).map((pessoa) => (
                    <option key={pessoa.usuario_id} value={pessoa.usuario_id}>
                      {pessoa.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="testemunha-2">
                  Testemunha 2 (usuária do sistema)
                </label>
                <select
                  className={estilos.campo}
                  id="testemunha-2"
                  required
                  value={testemunha2}
                  onChange={(e) => setTestemunha2(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {opcoesTestemunha(atoPara)
                    .filter(
                      (pessoa) => String(pessoa.usuario_id) !== testemunha1
                    )
                    .map((pessoa) => (
                      <option key={pessoa.usuario_id} value={pessoa.usuario_id}>
                        {pessoa.nome}
                      </option>
                    ))}
                </select>
              </div>
              <div className={estilos.acoesLinha}>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={ocupado || !testemunha1 || !testemunha2}
                >
                  {ocupado ? "Abrindo…" : "Abrir ato"}
                </button>
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => setAtoPara(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {ciclo && ciclo.atos.length > 0 && (
            <>
              <h4>Atos registrados</h4>
              {ciclo.atos.map((ato) => (
                <div key={ato.id} className={estilos.cartaoAto}>
                  <p>
                    <strong>{ato.usuario_nome}</strong> ·{" "}
                    {ROTULOS_ORIGEM[ato.origem]} · aberto por{" "}
                    {ato.aberto_por_nome} em {formatarDataHora(ato.aberto_em)}
                  </p>
                  <p>{ato.descricao}</p>
                  <p className={estilos.detalheAto}>
                    Testemunhas:{" "}
                    {ato.testemunhas
                      .map(
                        (testemunha) =>
                          `${testemunha.nome} (${
                            testemunha.confirmado_em
                              ? `confirmou em ${formatarDataHora(
                                  testemunha.confirmado_em
                                )}`
                              : "aguardando confirmação"
                          })`
                      )
                      .join(" · ")}
                  </p>
                  {ato.desfecho ? (
                    <p className={estilos.detalheAto}>
                      Desfecho: {ato.desfecho}
                      {ato.desfecho_em &&
                        ` — ${ato.desfecho_por_nome ?? "—"} em ${formatarDataHora(
                          ato.desfecho_em
                        )}`}
                    </p>
                  ) : (
                    <div className={estilos.linhaTestemunho}>
                      <input
                        className={estilos.campo}
                        type="text"
                        maxLength={2000}
                        placeholder="Desfecho do ato (ex.: advertência aplicada; ciência regularizada)…"
                        value={desfechoPorAto[ato.id] ?? ""}
                        onChange={(e) =>
                          setDesfechoPorAto((atual) => ({
                            ...atual,
                            [ato.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        className={estilos.botaoLinha}
                        type="button"
                        disabled={ocupado}
                        onClick={() => registrarDesfecho(ato)}
                      >
                        Registrar desfecho
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
