"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  MINIMO_AMOSTRA,
  ROTULOS_STATUS_PESQUISA,
  ROTULOS_TIPO_PERGUNTA,
  ROTULOS_TIPO_PESQUISA,
  StatusPesquisa,
  TIPOS_PERGUNTA,
  TIPOS_PESQUISA,
  TipoPergunta,
  TipoPesquisa,
} from "@/dominios/pesquisas/esquemas";
import estilos from "./pesquisas.module.css";

// ------------------------------------------------------------------ tipos da resposta da API

interface PesquisaItem {
  id: number;
  titulo: string;
  tipo: TipoPesquisa;
  tipo_rotulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  status: StatusPesquisa;
  anonima: boolean;
  perguntas: number;
  participacoes: number;
  adesao: number | null;
}

interface AbertaItem {
  id: number;
  titulo: string;
  tipo_rotulo: string;
  descricao: string | null;
  fim: string;
  anonima: boolean;
  respondida: boolean;
}

interface Visao {
  pesquisas: PesquisaItem[];
  minhas_abertas: AbertaItem[];
  colaborador_vinculado: boolean;
  pode: {
    administrar: boolean;
    responder: boolean;
    ver_resultado: boolean;
    gerir_plano: boolean;
  };
}

interface PerguntaRascunho {
  enunciado: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  /** Opções de escolha única separadas por ";" — vira array no envio. */
  opcoes: string;
}

// ------------------------------------------------------------------ apoio

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeIso(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function daquiADias(dias: number): string {
  const base = new Date(`${hojeIso()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

const CLASSE_ETIQUETA: Record<StatusPesquisa, string> = {
  rascunho: estilos.etiquetaRascunho,
  aberta: estilos.etiquetaAberta,
  encerrada: estilos.etiquetaEncerrada,
};

const PERGUNTA_VAZIA: PerguntaRascunho = {
  enunciado: "",
  tipo: "escala_1_5",
  obrigatoria: true,
  opcoes: "",
};

// ------------------------------------------------------------------ componente

export function PainelPesquisas({
  podeAdministrar,
  podeVerResultado,
}: {
  podeAdministrar: boolean;
  podeVerResultado: boolean;
}) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  // formulário de criação
  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoPesquisa>("anual");
  const [descricao, setDescricao] = useState("");
  const [inicio, setInicio] = useState(hojeIso());
  const [fim, setFim] = useState(daquiADias(14));
  const [anonima, setAnonima] = useState(true);
  const [perguntas, setPerguntas] = useState<PerguntaRascunho[]>([
    { ...PERGUNTA_VAZIA, tipo: "nps_0_10", enunciado: "" },
  ]);
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/pesquisas");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar as pesquisas.");
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

  function alterarPergunta(indice: number, mudanca: Partial<PerguntaRascunho>) {
    setPerguntas((atual) =>
      atual.map((pergunta, i) =>
        i === indice ? { ...pergunta, ...mudanca } : pergunta
      )
    );
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setMensagem(null);
    try {
      const corpo = {
        titulo,
        tipo,
        descricao: descricao.trim() ? descricao.trim() : undefined,
        inicio,
        fim,
        anonima,
        perguntas: perguntas.map((pergunta) => ({
          enunciado: pergunta.enunciado,
          tipo: pergunta.tipo,
          obrigatoria: pergunta.obrigatoria,
          opcoes:
            pergunta.tipo === "escolha_unica"
              ? pergunta.opcoes
                  .split(";")
                  .map((opcao) => opcao.trim())
                  .filter((opcao) => opcao.length > 0)
              : undefined,
        })),
      };
      const resposta = await fetch("/api/pesquisas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível criar a pesquisa.");
        return;
      }
      setMensagem(
        "Pesquisa criada em rascunho. Revise o questionário e abra quando estiver pronta."
      );
      setMostrarForm(false);
      setTitulo("");
      setDescricao("");
      setPerguntas([{ ...PERGUNTA_VAZIA, tipo: "nps_0_10" }]);
      recarregar();
    } catch {
      setErro("Falha de conexão ao criar a pesquisa.");
    } finally {
      setEnviando(false);
    }
  }

  async function alterarCiclo(id: number, acao: "abrir" | "encerrar") {
    setErro(null);
    setMensagem(null);
    try {
      const resposta = await fetch(`/api/pesquisas/${id}/ciclo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível mudar o estado da pesquisa.");
        return;
      }
      setMensagem(
        acao === "abrir"
          ? "Pesquisa aberta — o questionário está congelado a partir de agora."
          : "Pesquisa encerrada. O resultado agora é definitivo."
      );
      recarregar();
    } catch {
      setErro("Falha de conexão.");
    }
  }

  const abertas = visao?.minhas_abertas ?? [];
  const lista = visao?.pesquisas ?? [];

  return (
    <div className={estilos.pagina}>
      <Cabecalho />
      <main className={estilos.conteudo}>
        <h1>Pesquisa de clima</h1>
        <p className={estilos.subtitulo}>
          Pesquisa anual, pulse survey e eNPS com plano de ação. Módulo separado
          do check-in diário: aqui a resposta é anônima e só aparece em recortes
          com {MINIMO_AMOSTRA} respostas ou mais.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {mensagem && <p className={estilos.sucesso}>{mensagem}</p>}
        {carregando && <p className={estilos.vazio}>Carregando…</p>}

        {/* ------------------------------------------------ para responder */}
        {visao?.pode.responder && (
          <section className={estilos.cartao}>
            <h2>Pesquisas abertas para mim</h2>
            {!visao.colaborador_vinculado && (
              <p className={estilos.aviso}>
                Sua conta não está vinculada a um colaborador — procure o RH para
                poder responder.
              </p>
            )}
            {abertas.length === 0 ? (
              <p className={estilos.vazio}>
                Nenhuma pesquisa aberta no momento.
              </p>
            ) : (
              <ul className={estilos.listaPerguntas}>
                {abertas.map((aberta) => (
                  <li key={aberta.id} className={estilos.itemPergunta}>
                    <span className={estilos.enunciado}>
                      {aberta.titulo}{" "}
                      <span className={estilos.etiqueta}>
                        {aberta.tipo_rotulo}
                      </span>
                    </span>
                    {aberta.descricao && (
                      <span className={estilos.ajuda}>{aberta.descricao}</span>
                    )}
                    <span className={estilos.ajuda}>
                      Responda até {formatarData(aberta.fim)}
                      {aberta.anonima ? " · resposta anônima" : ""}
                    </span>
                    <span className={estilos.acoesLinha}>
                      {aberta.respondida ? (
                        <span className={estilos.etiquetaAberta + " " + estilos.etiqueta}>
                          Respondida
                        </span>
                      ) : (
                        <Link
                          className={estilos.botaoDiscreto}
                          href={`/pesquisas/${aberta.id}/responder`}
                        >
                          Responder
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ------------------------------------------------ criação */}
        {podeAdministrar && (
          <section className={estilos.cartao}>
            <h2>Nova pesquisa</h2>
            {!mostrarForm ? (
              <button
                type="button"
                className={estilos.botao}
                onClick={() => setMostrarForm(true)}
              >
                Criar pesquisa
              </button>
            ) : (
              <form className={estilos.formulario} onSubmit={criar}>
                <div className={estilos.campoGrupoLargo}>
                  <label className={estilos.rotulo} htmlFor="titulo">
                    Título
                  </label>
                  <input
                    id="titulo"
                    className={estilos.campo}
                    value={titulo}
                    maxLength={200}
                    required
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="tipo">
                    Tipo
                  </label>
                  <select
                    id="tipo"
                    className={estilos.campo}
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoPesquisa)}
                  >
                    {TIPOS_PESQUISA.map((valor) => (
                      <option key={valor} value={valor}>
                        {ROTULOS_TIPO_PESQUISA[valor]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="inicio">
                    Início
                  </label>
                  <input
                    id="inicio"
                    type="date"
                    className={estilos.campo}
                    value={inicio}
                    required
                    onChange={(e) => setInicio(e.target.value)}
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="fim">
                    Fim
                  </label>
                  <input
                    id="fim"
                    type="date"
                    className={estilos.campo}
                    value={fim}
                    required
                    onChange={(e) => setFim(e.target.value)}
                  />
                </div>
                <div className={estilos.campoGrupoLargo}>
                  <label className={estilos.rotulo} htmlFor="descricao">
                    Descrição (opcional)
                  </label>
                  <textarea
                    id="descricao"
                    className={estilos.campo}
                    rows={2}
                    maxLength={2000}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </div>
                <label className={estilos.caixaSelecao}>
                  <input
                    type="checkbox"
                    checked={anonima}
                    onChange={(e) => setAnonima(e.target.checked)}
                  />
                  Respostas anônimas (recomendado)
                </label>

                <div className={estilos.campoGrupoLargo}>
                  <h3>Perguntas</h3>
                  {perguntas.map((pergunta, indice) => (
                    <div key={indice} className={estilos.perguntaRascunho}>
                      <div className={estilos.campoGrupoLargo}>
                        <label className={estilos.rotulo}>
                          {indice + 1}. Enunciado
                        </label>
                        <input
                          className={estilos.campo}
                          value={pergunta.enunciado}
                          maxLength={500}
                          required
                          onChange={(e) =>
                            alterarPergunta(indice, { enunciado: e.target.value })
                          }
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo}>Tipo</label>
                        <select
                          className={estilos.campo}
                          value={pergunta.tipo}
                          onChange={(e) =>
                            alterarPergunta(indice, {
                              tipo: e.target.value as TipoPergunta,
                            })
                          }
                        >
                          {TIPOS_PERGUNTA.map((valor) => (
                            <option key={valor} value={valor}>
                              {ROTULOS_TIPO_PERGUNTA[valor]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {pergunta.tipo === "escolha_unica" && (
                        <div className={estilos.campoGrupo}>
                          <label className={estilos.rotulo}>
                            Opções (separe com ;)
                          </label>
                          <input
                            className={estilos.campo}
                            value={pergunta.opcoes}
                            required
                            onChange={(e) =>
                              alterarPergunta(indice, { opcoes: e.target.value })
                            }
                          />
                        </div>
                      )}
                      <label className={estilos.caixaSelecao}>
                        <input
                          type="checkbox"
                          checked={pergunta.obrigatoria}
                          onChange={(e) =>
                            alterarPergunta(indice, {
                              obrigatoria: e.target.checked,
                            })
                          }
                        />
                        Obrigatória
                      </label>
                      {perguntas.length > 1 && (
                        <button
                          type="button"
                          className={estilos.botaoDiscreto}
                          onClick={() =>
                            setPerguntas((atual) =>
                              atual.filter((_, i) => i !== indice)
                            )
                          }
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))}
                  <div className={estilos.acoesLinha}>
                    <button
                      type="button"
                      className={estilos.botaoDiscreto}
                      onClick={() =>
                        setPerguntas((atual) => [...atual, { ...PERGUNTA_VAZIA }])
                      }
                    >
                      Adicionar pergunta
                    </button>
                  </div>
                  <p className={estilos.ajuda}>
                    Pesquisa de eNPS precisa de ao menos uma pergunta de nota 0 a
                    10. O questionário congela quando a pesquisa é aberta.
                  </p>
                </div>

                <div className={estilos.acoesLinha}>
                  <button
                    type="submit"
                    className={estilos.botao}
                    disabled={enviando}
                  >
                    {enviando ? "Criando…" : "Criar em rascunho"}
                  </button>
                  <button
                    type="button"
                    className={estilos.botaoDiscreto}
                    onClick={() => setMostrarForm(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* ------------------------------------------------ lista administrativa */}
        {(podeAdministrar || podeVerResultado) && (
          <section className={estilos.cartao}>
            <h2>Pesquisas</h2>
            {lista.length === 0 ? (
              <p className={estilos.vazio}>Nenhuma pesquisa cadastrada.</p>
            ) : (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Pesquisa</th>
                      <th>Tipo</th>
                      <th>Período</th>
                      <th>Status</th>
                      <th className={estilos.numero}>Perguntas</th>
                      <th className={estilos.numero}>Participação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((pesquisa) => (
                      <tr key={pesquisa.id}>
                        <td>
                          {pesquisa.titulo}
                          {!pesquisa.anonima && (
                            <>
                              {" "}
                              <span className={estilos.etiqueta}>
                                não anônima
                              </span>
                            </>
                          )}
                        </td>
                        <td>{pesquisa.tipo_rotulo}</td>
                        <td>
                          {formatarData(pesquisa.inicio)} a{" "}
                          {formatarData(pesquisa.fim)}
                        </td>
                        <td>
                          <span
                            className={`${estilos.etiqueta} ${
                              CLASSE_ETIQUETA[pesquisa.status]
                            }`}
                          >
                            {ROTULOS_STATUS_PESQUISA[pesquisa.status]}
                          </span>
                        </td>
                        <td className={estilos.numero}>{pesquisa.perguntas}</td>
                        <td className={estilos.numero}>
                          {pesquisa.participacoes}
                          {pesquisa.adesao === null
                            ? ""
                            : ` (${pesquisa.adesao}%)`}
                        </td>
                        <td>
                          <span className={estilos.acoesLinha}>
                            {podeAdministrar &&
                              pesquisa.status === "rascunho" && (
                                <button
                                  type="button"
                                  className={estilos.botaoDiscreto}
                                  onClick={() =>
                                    alterarCiclo(pesquisa.id, "abrir")
                                  }
                                >
                                  Abrir
                                </button>
                              )}
                            {podeAdministrar && pesquisa.status === "aberta" && (
                              <button
                                type="button"
                                className={estilos.botaoDiscreto}
                                onClick={() =>
                                  alterarCiclo(pesquisa.id, "encerrar")
                                }
                              >
                                Encerrar
                              </button>
                            )}
                            {podeVerResultado &&
                              pesquisa.status !== "rascunho" && (
                                <Link
                                  className={estilos.ligacao}
                                  href={`/pesquisas/${pesquisa.id}/resultado`}
                                >
                                  Ver resultado
                                </Link>
                              )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={estilos.notaRodape}>
              Participação mede quem respondeu, nunca o que respondeu — as duas
              coisas ficam em tabelas separadas e sem ligação.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
