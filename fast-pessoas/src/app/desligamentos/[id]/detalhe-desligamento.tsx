"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  PROXIMO_ESTADO,
  ROTULOS_ESTADO,
  ROTULOS_RESULTADO_ESTABILIDADE,
  ROTULOS_STATUS_ENTREVISTA,
  ROTULOS_STATUS_ITEM,
  ROTULOS_TIPO_ESTABILIDADE,
  STATUS_ITEM,
  StatusItem,
} from "@/dominios/desligamento/esquemas";
import { CartaoProcesso } from "../cartao-processo";
import comum from "../comum.module.css";
import { formatarData, formatarDataHora } from "../formato";
import { Detalhe, Item, RespostasEntrevista } from "../tipos";
import estilos from "./page.module.css";

type Dialogo =
  | null
  | "encerrar"
  | "cancelar"
  | "agendar"
  | "realizar"
  | "nao_realizada";

const CLASSE_RESULTADO: Record<string, string> = {
  livre: comum.badgeSuccess,
  condicionado: comum.badgeWarning,
  bloqueado: comum.badgeDanger,
};

export function DetalheDesligamento({ id }: { id: number }) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  const [dataEncerramento, setDataEncerramento] = useState("");
  const [motivoAcao, setMotivoAcao] = useState("");
  const [dataAgendada, setDataAgendada] = useState("");
  const [respostasForm, setRespostasForm] = useState<Record<string, string>>(
    {}
  );
  const [consentimento, setConsentimento] = useState(false);

  // Nasce vazio: a categoria vem do catálogo do servidor e quem escolhe é o
  // usuário — campo que nasce escolhido manda ao POST um valor que ninguém olhou.
  const [novaCategoria, setNovaCategoria] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [erroItem, setErroItem] = useState<string | null>(null);
  const [salvandoItem, setSalvandoItem] = useState(false);

  const [respostas, setRespostas] = useState<RespostasEntrevista | null>(null);
  const [erroRespostas, setErroRespostas] = useState<string | null>(null);

  // Incrementar "versao" força uma nova busca (após uma ação no processo).
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/desligamentos/${id}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setDetalhe(dados as Detalhe);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o processo.");
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
  }, [id, versao]);

  function recarregar() {
    setRespostas(null);
    setVersao((atual) => atual + 1);
  }

  function abrirDialogo(qual: Dialogo) {
    setErroAcao(null);
    setMotivoAcao("");
    setDataEncerramento(detalhe?.processo.data_projetada_termino ?? "");
    setDataAgendada("");
    setRespostasForm({});
    setConsentimento(false);
    setDialogo(qual);
  }

  async function executar(caminho: string, corpo?: unknown) {
    setExecutando(true);
    setErroAcao(null);
    try {
      const resposta = await fetch(`/api/desligamentos/${id}${caminho}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogo(null);
        recarregar();
      } else {
        setErroAcao(dados.erro ?? "Não foi possível concluir a ação.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setExecutando(false);
    }
  }

  async function adicionarItem(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!novaDescricao.trim() || !novaCategoria) return;
    setSalvandoItem(true);
    setErroItem(null);
    try {
      const resposta = await fetch(`/api/desligamentos/${id}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria: novaCategoria,
          descricao: novaDescricao.trim(),
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setNovaDescricao("");
        setDetalhe((atual) =>
          atual ? { ...atual, itens: dados.itens as Item[] } : atual
        );
      } else {
        setErroItem(dados.erro ?? "Não foi possível adicionar o item.");
      }
    } catch {
      setErroItem("Falha de conexão. Tente novamente.");
    } finally {
      setSalvandoItem(false);
    }
  }

  async function mudarStatusItem(itemId: number, status: StatusItem) {
    setErroItem(null);
    try {
      const resposta = await fetch(
        `/api/desligamentos/${id}/itens/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDetalhe((atual) =>
          atual ? { ...atual, itens: dados.itens as Item[] } : atual
        );
      } else {
        setErroItem(dados.erro ?? "Não foi possível atualizar o item.");
      }
    } catch {
      setErroItem("Falha de conexão. Tente novamente.");
    }
  }

  async function verRespostas() {
    setErroRespostas(null);
    try {
      const resposta = await fetch(
        `/api/desligamentos/${id}/entrevista/respostas`
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setRespostas(dados as RespostasEntrevista);
      } else {
        setErroRespostas(
          dados.erro ?? "Não foi possível carregar as respostas."
        );
      }
    } catch {
      setErroRespostas("Falha de conexão. Tente novamente.");
    }
  }

  function registrarRealizada() {
    if (!detalhe?.entrevista) return;
    const corpo: Record<string, string | number | boolean> = {};
    for (const pergunta of detalhe.entrevista.perguntas) {
      const bruto = respostasForm[pergunta.chave] ?? "";
      if (bruto === "") continue;
      if (pergunta.tipo === "escala_1_5") {
        corpo[pergunta.chave] = Number(bruto);
      } else if (pergunta.tipo === "sim_nao") {
        corpo[pergunta.chave] = bruto === "sim";
      } else {
        corpo[pergunta.chave] = bruto;
      }
    }
    void executar("/entrevista/realizar", {
      respostas: corpo,
      consentimento_uso_agregado: consentimento,
    });
  }

  const processo = detalhe?.processo;
  const entrevista = detalhe?.entrevista;
  const proximoEstado = processo ? PROXIMO_ESTADO[processo.estado] : undefined;

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/desligamentos">
          ← Desligamentos
        </Link>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !detalhe && <p className={estilos.vazio}>Carregando…</p>}

        {detalhe && processo && (
          <>
            <CartaoProcesso processo={processo}>
              {detalhe.acoes.avancar && proximoEstado && (
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  disabled={executando}
                  onClick={() => void executar("/avancar")}
                >
                  Avançar para {ROTULOS_ESTADO[proximoEstado]}
                </button>
              )}
              {detalhe.acoes.encerrar && (
                <button
                  className={comum.botaoPrimario}
                  type="button"
                  onClick={() => abrirDialogo("encerrar")}
                >
                  Encerrar processo
                </button>
              )}
              {detalhe.acoes.cancelar && (
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => abrirDialogo("cancelar")}
                >
                  Cancelar processo
                </button>
              )}
            </CartaoProcesso>
            {erroAcao && dialogo === null && (
              <p className={comum.erroAcao}>{erroAcao}</p>
            )}

            {detalhe.acoes.encerrar_bloqueado_por_entrevista && entrevista && (
              <div className={comum.avisoTrava}>
                <b>Encerramento bloqueado pela entrevista.</b> A entrevista de
                desligamento está{" "}
                {ROTULOS_STATUS_ENTREVISTA[entrevista.status].toLowerCase()}: o
                processo só encerra com desfecho registrado — realizada,
                recusada ou não realizada com motivo. A oferta é obrigatória e
                auditada; a participação do colaborador é voluntária.
              </div>
            )}

            <section className={estilos.bloco}>
              <h2>Prazos e dados do processo</h2>
              <div className={estilos.linhaEntrevista}>
                Comunicação em <b>{formatarData(processo.data_comunicacao)}</b>{" "}
                · término projetado{" "}
                <b>{formatarData(processo.data_projetada_termino)}</b>
                {processo.data_termino_efetiva && (
                  <>
                    {" "}
                    · término efetivo{" "}
                    <b>{formatarData(processo.data_termino_efetiva)}</b>
                  </>
                )}
                <br />
                Limite do art. 477 (10 dias corridos do término):{" "}
                <b>{formatarData(processo.data_limite_477)}</b>
                <br />
                Aberto por {processo.aberto_por_nome} em{" "}
                {formatarDataHora(processo.criado_em)}
                {processo.direito_manutencao_plano && (
                  <>
                    <br />
                    Tipo com direito de manutenção do plano de saúde (arts.
                    30/31 da Lei 9.656/98) — gerar o aviso com ciência.
                  </>
                )}
              </div>
            </section>

            {detalhe.motivo !== undefined && (
              <section className={estilos.bloco}>
                <h2>Motivo (restrito)</h2>
                {detalhe.motivo ? (
                  <p className={estilos.motivoTexto}>{detalhe.motivo}</p>
                ) : (
                  <p className={estilos.vazio}>Sem motivo registrado.</p>
                )}
                <p className={estilos.notaRestrito}>
                  Visível só com a chave desligamento.motivo.ver — esta leitura
                  fica registrada na trilha de auditoria.
                </p>
              </section>
            )}

            <section className={estilos.bloco}>
              <h2>Verificação de estabilidades (gate de abertura)</h2>
              {detalhe.verificacoes.length === 0 ? (
                <p className={estilos.vazio}>Nenhuma verificação registrada.</p>
              ) : (
                detalhe.verificacoes.map((verificacao) => (
                  <div key={verificacao.id} className={estilos.itemLista}>
                    <span
                      className={`${comum.badge} ${CLASSE_RESULTADO[verificacao.resultado]}`}
                    >
                      {ROTULOS_RESULTADO_ESTABILIDADE[verificacao.resultado]}
                    </span>
                    <div className={estilos.itemTexto}>
                      {ROTULOS_TIPO_ESTABILIDADE[verificacao.tipo]}{" "}
                      <span className={comum.meta}>
                        (
                        {verificacao.origem === "afastamento"
                          ? "verificação automática"
                          : "declaração humana"}{" "}
                        · {verificacao.decisor_nome} ·{" "}
                        {formatarDataHora(verificacao.em)})
                      </span>
                      {verificacao.justificativa && (
                        <p className={estilos.justificativa}>
                          {verificacao.justificativa}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className={estilos.bloco}>
              <h2>Devoluções (EPIs e ativos)</h2>
              {detalhe.itens.length === 0 ? (
                <p className={estilos.vazio}>
                  Nenhum item de devolução registrado.
                </p>
              ) : (
                detalhe.itens.map((item) => (
                  <div key={item.id} className={estilos.itemLista}>
                    <span className={`${comum.badge} ${comum.badgeNeutro}`}>
                      {item.categoria_nome}
                    </span>
                    <div className={estilos.itemTexto}>{item.descricao}</div>
                    {detalhe.acoes.gerir_itens ? (
                      <select
                        className={estilos.seletorStatus}
                        aria-label={`Status de ${item.descricao}`}
                        value={item.status}
                        onChange={(e) =>
                          void mudarStatusItem(
                            item.id,
                            e.target.value as StatusItem
                          )
                        }
                      >
                        {STATUS_ITEM.map((status) => (
                          <option key={status} value={status}>
                            {ROTULOS_STATUS_ITEM[status]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`${comum.badge} ${
                          item.status === "pendente"
                            ? comum.badgeWarning
                            : item.status === "devolvido"
                              ? comum.badgeSuccess
                              : comum.badgeDanger
                        }`}
                      >
                        {ROTULOS_STATUS_ITEM[item.status]}
                      </span>
                    )}
                  </div>
                ))
              )}
              {detalhe.acoes.gerir_itens && (
                <>
                  <form className={estilos.formLinha} onSubmit={adicionarItem}>
                    {/* As opções vêm do catálogo administrável (só as ativas),
                        nunca de uma lista escrita aqui. */}
                    <select
                      aria-label="Categoria do novo item"
                      value={novaCategoria}
                      onChange={(e) => setNovaCategoria(e.target.value)}
                    >
                      <option value="">Categoria…</option>
                      {detalhe.categorias.map((categoria) => (
                        <option key={categoria.chave} value={categoria.chave}>
                          {categoria.nome}
                        </option>
                      ))}
                    </select>
                    <input
                      className={estilos.campoDescricao}
                      type="text"
                      maxLength={500}
                      placeholder="Descrição do item (ex.: notebook Dell patrimônio 123)"
                      value={novaDescricao}
                      onChange={(e) => setNovaDescricao(e.target.value)}
                    />
                    <button
                      className={comum.botaoSecundario}
                      type="submit"
                      disabled={
                        salvandoItem || !novaDescricao.trim() || !novaCategoria
                      }
                    >
                      {salvandoItem ? "Adicionando…" : "Adicionar item"}
                    </button>
                  </form>
                  <p className={estilos.notaRestrito}>
                    Falta uma categoria (carro, tablet, empilhadeira…)?{" "}
                    <Link href="/desligamentos/categorias">
                      Administre o catálogo
                    </Link>{" "}
                    — não é preciso chamar o time de sistemas.
                  </p>
                </>
              )}
              {erroItem && <p className={comum.erroAcao}>{erroItem}</p>}
            </section>

            <section className={estilos.bloco}>
              <h2>Entrevista de desligamento</h2>
              {!entrevista ? (
                <p className={estilos.vazio}>
                  Tipo de desligamento não elegível — sem entrevista neste
                  processo.
                </p>
              ) : (
                <>
                  <div className={estilos.linhaEntrevista}>
                    <span
                      className={`${comum.badge} ${
                        entrevista.status === "realizada"
                          ? comum.badgeSuccess
                          : entrevista.status === "oferecida" ||
                              entrevista.status === "agendada"
                            ? comum.badgeWarning
                            : comum.badgeNeutro
                      }`}
                    >
                      {ROTULOS_STATUS_ENTREVISTA[entrevista.status]}
                    </span>{" "}
                    · roteiro: {entrevista.roteiro_nome} · oferecida em{" "}
                    {formatarData(entrevista.data_oferta)}
                    {entrevista.data_agendada &&
                      ` · agendada para ${formatarData(entrevista.data_agendada)}`}
                    {entrevista.data_realizacao &&
                      ` · realizada em ${formatarData(entrevista.data_realizacao)}`}
                    {entrevista.entrevistador_nome &&
                      ` por ${entrevista.entrevistador_nome}`}
                    {entrevista.motivo_nao_realizacao &&
                      ` · motivo: ${entrevista.motivo_nao_realizacao}`}
                  </div>
                  <p className={estilos.notaRestrito}>
                    A participação é voluntária (recusa sem prejuízo), mas o
                    processo só encerra com o desfecho registrado. Respostas são
                    restritas — o indicador usa apenas o status.
                  </p>
                  {detalhe.acoes.entrevista_transicionar && (
                    <div className={comum.acoes}>
                      <button
                        className={comum.botaoSecundario}
                        type="button"
                        onClick={() => abrirDialogo("agendar")}
                      >
                        Agendar
                      </button>
                      <button
                        className={comum.botaoPrimario}
                        type="button"
                        onClick={() => abrirDialogo("realizar")}
                      >
                        Registrar realizada
                      </button>
                      <button
                        className={comum.botaoSecundario}
                        type="button"
                        disabled={executando}
                        onClick={() => void executar("/entrevista/recusar")}
                      >
                        Colaborador recusou
                      </button>
                      <button
                        className={comum.botaoSecundario}
                        type="button"
                        onClick={() => abrirDialogo("nao_realizada")}
                      >
                        Não realizada (com motivo)
                      </button>
                    </div>
                  )}
                  {detalhe.acoes.ver_respostas && !respostas && (
                    <div className={comum.acoes}>
                      <button
                        className={comum.ligacaoLeve}
                        type="button"
                        onClick={() => void verRespostas()}
                      >
                        Ver respostas (leitura auditada)
                      </button>
                    </div>
                  )}
                  {erroRespostas && (
                    <p className={comum.erroAcao}>{erroRespostas}</p>
                  )}
                  {respostas && (
                    <div>
                      {respostas.perguntas.map((pergunta) => {
                        const valor = respostas.respostas[pergunta.chave];
                        return (
                          <div key={pergunta.chave} className={estilos.pergunta}>
                            <p className={estilos.textoPergunta}>
                              {pergunta.texto}
                            </p>
                            <p className={estilos.resposta}>
                              {valor === undefined
                                ? "— sem resposta —"
                                : typeof valor === "boolean"
                                  ? valor
                                    ? "Sim"
                                    : "Não"
                                  : String(valor)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>

      {dialogo === "encerrar" && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Encerrar processo</h3>
            <p className={comum.subDialogo}>
              Na mesma transação: colaborador vira desligado com a data
              informada e o usuário do app é desativado.
            </p>
            <label className={comum.rotuloCampo} htmlFor="data-encerramento">
              Data de término efetiva
            </label>
            <input
              className={comum.campo}
              id="data-encerramento"
              type="date"
              value={dataEncerramento}
              onChange={(e) => setDataEncerramento(e.target.value)}
            />
            {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            <div className={comum.acoesDialogo}>
              <button
                className={comum.botaoSecundario}
                type="button"
                onClick={() => setDialogo(null)}
              >
                Voltar
              </button>
              <button
                className={comum.botaoPrimario}
                type="button"
                disabled={executando || !dataEncerramento}
                onClick={() =>
                  void executar("/encerrar", {
                    data_termino_efetiva: dataEncerramento,
                  })
                }
              >
                {executando ? "Encerrando…" : "Encerrar e efetivar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(dialogo === "cancelar" || dialogo === "nao_realizada") && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>
              {dialogo === "cancelar"
                ? "Cancelar processo"
                : "Entrevista não realizada"}
            </h3>
            <p className={comum.subDialogo}>
              {dialogo === "cancelar"
                ? "O cancelamento é terminal e fica auditado com o motivo."
                : "Registre por que a entrevista não aconteceu — é o desfecho que destrava o encerramento."}
            </p>
            <label className={comum.rotuloCampo} htmlFor="motivo-acao">
              Motivo
            </label>
            <textarea
              className={`${comum.campo} ${comum.campoTexto}`}
              id="motivo-acao"
              maxLength={4000}
              value={motivoAcao}
              onChange={(e) => setMotivoAcao(e.target.value)}
            />
            {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            <div className={comum.acoesDialogo}>
              <button
                className={comum.botaoSecundario}
                type="button"
                onClick={() => setDialogo(null)}
              >
                Voltar
              </button>
              <button
                className={comum.botaoPrimario}
                type="button"
                disabled={executando || !motivoAcao.trim()}
                onClick={() =>
                  void executar(
                    dialogo === "cancelar"
                      ? "/cancelar"
                      : "/entrevista/nao-realizada",
                    { motivo: motivoAcao.trim() }
                  )
                }
              >
                {executando ? "Registrando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogo === "agendar" && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Agendar entrevista</h3>
            <label className={comum.rotuloCampo} htmlFor="data-agendada">
              Data agendada
            </label>
            <input
              className={comum.campo}
              id="data-agendada"
              type="date"
              value={dataAgendada}
              onChange={(e) => setDataAgendada(e.target.value)}
            />
            {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            <div className={comum.acoesDialogo}>
              <button
                className={comum.botaoSecundario}
                type="button"
                onClick={() => setDialogo(null)}
              >
                Voltar
              </button>
              <button
                className={comum.botaoPrimario}
                type="button"
                disabled={executando || !dataAgendada}
                onClick={() =>
                  void executar("/entrevista/agendar", {
                    data_agendada: dataAgendada,
                  })
                }
              >
                {executando ? "Agendando…" : "Agendar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogo === "realizar" && entrevista && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Registrar entrevista realizada</h3>
            <p className={comum.subDialogo}>
              Roteiro vigente: {entrevista.roteiro_nome}. As respostas são
              restritas — só quem tem a chave própria as lê depois, com trilha.
            </p>
            {entrevista.perguntas.map((pergunta) => (
              <div key={pergunta.chave}>
                <label
                  className={comum.rotuloCampo}
                  htmlFor={`resposta-${pergunta.chave}`}
                >
                  {pergunta.texto}
                  {pergunta.opcional ? " (opcional)" : ""}
                </label>
                {pergunta.tipo === "texto" ? (
                  <textarea
                    className={`${comum.campo} ${comum.campoTexto}`}
                    id={`resposta-${pergunta.chave}`}
                    maxLength={4000}
                    value={respostasForm[pergunta.chave] ?? ""}
                    onChange={(e) =>
                      setRespostasForm((atuais) => ({
                        ...atuais,
                        [pergunta.chave]: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <select
                    className={comum.campo}
                    id={`resposta-${pergunta.chave}`}
                    value={respostasForm[pergunta.chave] ?? ""}
                    onChange={(e) =>
                      setRespostasForm((atuais) => ({
                        ...atuais,
                        [pergunta.chave]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Selecione…</option>
                    {pergunta.tipo === "escala_1_5" ? (
                      ["1", "2", "3", "4", "5"].map((nota) => (
                        <option key={nota} value={nota}>
                          {nota}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </>
                    )}
                  </select>
                )}
              </div>
            ))}
            <label className={comum.rotuloCampo} htmlFor="consentimento">
              <input
                id="consentimento"
                type="checkbox"
                checked={consentimento}
                onChange={(e) => setConsentimento(e.target.checked)}
              />{" "}
              Colaborador consentiu com o uso agregado das respostas
            </label>
            {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            <div className={comum.acoesDialogo}>
              <button
                className={comum.botaoSecundario}
                type="button"
                onClick={() => setDialogo(null)}
              >
                Voltar
              </button>
              <button
                className={comum.botaoPrimario}
                type="button"
                disabled={executando}
                onClick={registrarRealizada}
              >
                {executando ? "Registrando…" : "Registrar realizada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
