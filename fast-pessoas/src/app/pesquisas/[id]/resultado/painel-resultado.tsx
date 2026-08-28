"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import {
  ROTULOS_STATUS_PLANO,
  STATUS_PLANO,
  StatusPlano,
  TipoPergunta,
} from "@/dominios/pesquisas/esquemas";
import estilos from "../../pesquisas.module.css";

// ------------------------------------------------------------------ tipos da API

interface OpcaoResultado {
  rotulo: string;
  respostas: number;
  percentual: number;
}

interface ResultadoPergunta {
  pergunta_id: number;
  ordem: number;
  enunciado: string;
  tipo: TipoPergunta;
  tipo_rotulo: string;
  amostra_suficiente: boolean;
  respostas: number | null;
  media: number | null;
  enps: number | null;
  promotores: number | null;
  neutros: number | null;
  detratores: number | null;
  distribuicao: OpcaoResultado[] | null;
  comentarios: string[] | null;
  aviso: string | null;
}

interface ResultadoUnidade {
  unidade_id: number | null;
  unidade: string;
  amostra_suficiente: boolean;
  respostas: number | null;
  media: number | null;
  enps: number | null;
  aviso: string | null;
}

interface Plano {
  id: number;
  unidade_id: number | null;
  unidade: string | null;
  titulo: string;
  descricao: string | null;
  responsavel_nome: string;
  prazo: string;
  status: StatusPlano;
}

interface Resultado {
  pesquisa: {
    id: number;
    titulo: string;
    tipo_rotulo: string;
    status: string;
    inicio: string;
    fim: string;
    participacoes: number;
  };
  adesao: {
    participacoes: number | null;
    ativos: number;
    percentual: number | null;
    amostra_suficiente: boolean;
  };
  enps: {
    valor: number | null;
    respostas: number | null;
    promotores: number | null;
    neutros: number | null;
    detratores: number | null;
    amostra_suficiente: boolean;
  } | null;
  perguntas: ResultadoPergunta[];
  por_unidade: ResultadoUnidade[];
  planos: Plano[];
  minimo_amostra: number;
  texto_amostra_insuficiente: string;
}

interface UnidadeOpcao {
  id: number;
  unidade: string;
}

interface UsuarioOpcao {
  id: number;
  nome: string;
  papel: string;
}

interface VisaoPlanos {
  planos: Plano[];
  unidades: UnidadeOpcao[];
  responsaveis: UsuarioOpcao[];
  restrito_a_unidade: number | null;
}

// ------------------------------------------------------------------ apoio

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ componente

export function PainelResultado({
  id,
  podeGerirPlano,
}: {
  id: number;
  podeGerirPlano: boolean;
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [visaoPlanos, setVisaoPlanos] = useState<VisaoPlanos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  /**
   * O PRAZO DO PLANO DE AÇÃO NASCE VAZIO — mesma correção do fim da pesquisa.
   *
   * Nascia `daquiADias(30)`. Campo `required`, corpo do POST lendo o estado
   * direto: título + responsável + Salvar gravava um prazo de trinta dias que
   * ninguém escolheu, e prazo de plano de ação é compromisso de pessoa com
   * data — é o que a tela cobra depois e o que vira atraso.
   *
   * Trinta dias não é parâmetro da empresa nem tem versão vigente de onde
   * semear: é a combinação daquele plano com aquele responsável. Semeadura
   * certa é nenhuma.
   */
  const [prazo, setPrazo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/pesquisas/${id}/resultado`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setResultado(dados as Resultado);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o resultado.");
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

  useEffect(() => {
    if (!podeGerirPlano) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/pesquisas/${id}/planos`);
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) setVisaoPlanos(dados as VisaoPlanos);
      } catch {
        // Sem a visão de planos a tela de resultado segue funcionando.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [id, podeGerirPlano, versao]);

  async function criarPlano(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setMensagem(null);
    try {
      const resposta = await fetch(`/api/pesquisas/${id}/planos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          descricao: descricao.trim() ? descricao.trim() : undefined,
          unidade_id: unidadeId ? Number(unidadeId) : null,
          responsavel_usuario: Number(responsavel),
          prazo,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível criar o plano de ação.");
        return;
      }
      setMensagem("Plano de ação criado.");
      setMostrarForm(false);
      setTitulo("");
      setDescricao("");
      // Prazo volta a vazio: reaproveitar a data do plano anterior é inventar
      // o prazo do próximo por outro caminho.
      setPrazo("");
      recarregar();
    } catch {
      setErro("Falha de conexão ao criar o plano.");
    } finally {
      setEnviando(false);
    }
  }

  async function mudarStatus(planoId: number, status: StatusPlano) {
    setErro(null);
    setMensagem(null);
    try {
      const resposta = await fetch(`/api/pesquisas/${id}/planos/${planoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível atualizar o plano.");
        return;
      }
      setMensagem("Plano atualizado.");
      recarregar();
    } catch {
      setErro("Falha de conexão.");
    }
  }

  const planos = visaoPlanos ? visaoPlanos.planos : (resultado?.planos ?? []);
  const insuficiente = resultado?.texto_amostra_insuficiente ?? "Amostra insuficiente";

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/pesquisas">
          Pesquisas
        </Link>
      </Cabecalho>
      <main className={estilos.conteudo}>
        <h1>{resultado ? resultado.pesquisa.titulo : "Resultado"}</h1>
        {resultado && (
          <p className={estilos.subtitulo}>
            {resultado.pesquisa.tipo_rotulo} ·{" "}
            {formatarData(resultado.pesquisa.inicio)} a{" "}
            {formatarData(resultado.pesquisa.fim)} · recorte só com{" "}
            {resultado.minimo_amostra} respostas ou mais
          </p>
        )}

        {carregando && <p className={estilos.vazio}>Carregando…</p>}
        {erro && <p className={estilos.erro}>{erro}</p>}
        {mensagem && <p className={estilos.sucesso}>{mensagem}</p>}

        {resultado && (
          <>
            {/* ------------------------------------------ resumo */}
            <div className={estilos.grade}>
              <div className={estilos.cartaoResumo}>
                <span className={estilos.resumoValor}>
                  {resultado.adesao.percentual === null
                    ? "—"
                    : `${resultado.adesao.percentual}%`}
                </span>
                <span className={estilos.resumoRotulo}>Adesão</span>
                <span className={estilos.resumoDetalhe}>
                  {resultado.adesao.participacoes === null
                    ? `menos de ${resultado.minimo_amostra} participantes — ocultado para não identificar o público-alvo`
                    : `${resultado.adesao.participacoes} de ${resultado.adesao.ativos} colaboradores`}
                </span>
              </div>

              {resultado.enps && (
                <div className={`${estilos.cartaoResumo} ${estilos.cartaoEnps}`}>
                  {resultado.enps.amostra_suficiente &&
                  resultado.enps.valor !== null ? (
                    <>
                      <span
                        className={`${estilos.enpsValor} ${
                          resultado.enps.valor >= 0
                            ? estilos.enpsPositivo
                            : estilos.enpsNegativo
                        }`}
                      >
                        {resultado.enps.valor > 0 ? "+" : ""}
                        {resultado.enps.valor}
                      </span>
                      <span className={estilos.resumoRotulo}>eNPS</span>
                      <span className={estilos.resumoDetalhe}>
                        {resultado.enps.promotores} promotores ·{" "}
                        {resultado.enps.neutros} neutros ·{" "}
                        {resultado.enps.detratores} detratores em{" "}
                        {resultado.enps.respostas} respostas
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={estilos.suprimido}>{insuficiente}</span>
                      <span className={estilos.resumoRotulo}>eNPS</span>
                      <span className={estilos.resumoDetalhe}>
                        menos de {resultado.minimo_amostra} respostas de nota 0 a
                        10
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ------------------------------------------ por pergunta */}
            <section className={estilos.cartao}>
              <h2>Por pergunta</h2>
              {resultado.perguntas.length === 0 ? (
                <p className={estilos.vazio}>Pesquisa sem perguntas.</p>
              ) : (
                <ul className={estilos.listaPerguntas}>
                  {resultado.perguntas.map((pergunta) => (
                    <li
                      key={pergunta.pergunta_id}
                      className={estilos.itemPergunta}
                    >
                      <span className={estilos.enunciado}>
                        {pergunta.ordem}. {pergunta.enunciado}
                      </span>
                      <span className={estilos.ajuda}>
                        {pergunta.tipo_rotulo}
                        {pergunta.respostas !== null
                          ? ` · ${pergunta.respostas} respostas`
                          : ""}
                      </span>

                      {!pergunta.amostra_suficiente && (
                        <span className={estilos.suprimido}>
                          {insuficiente} — nada é exibido para não permitir
                          dedução de quem respondeu.
                        </span>
                      )}

                      {pergunta.media !== null && (
                        <>
                          <span className={estilos.enunciado}>
                            Média {pergunta.media.toFixed(2)} / 5
                          </span>
                          <span className={estilos.barraFundo}>
                            <span
                              className={estilos.barra}
                              style={{
                                width: `${(pergunta.media / 5) * 100}%`,
                              }}
                            />
                          </span>
                        </>
                      )}

                      {pergunta.enps !== null && (
                        <span className={estilos.enunciado}>
                          eNPS {pergunta.enps > 0 ? "+" : ""}
                          {pergunta.enps} · {pergunta.promotores} promotores,{" "}
                          {pergunta.neutros} neutros, {pergunta.detratores}{" "}
                          detratores
                        </span>
                      )}

                      {pergunta.distribuicao && (
                        <div className={estilos.tabelaEnvolucro}>
                          <table className={estilos.tabela}>
                            <tbody>
                              {pergunta.distribuicao.map((opcao) => (
                                <tr key={opcao.rotulo}>
                                  <td>{opcao.rotulo}</td>
                                  <td className={estilos.numero}>
                                    {opcao.respostas}
                                  </td>
                                  <td className={estilos.numero}>
                                    {opcao.percentual}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {pergunta.comentarios && (
                        <ul className={estilos.listaComentarios}>
                          {pergunta.comentarios.map((comentario, indice) => (
                            <li key={indice} className={estilos.comentario}>
                              {comentario}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className={estilos.notaRodape}>
                Comentários são anônimos e chegam sem unidade, sem data e sem
                ordem de envio — três pistas que, cruzadas, apontariam autoria.
              </p>
            </section>

            {/* ------------------------------------------ por unidade */}
            <section className={estilos.cartao}>
              <h2>Por unidade</h2>
              {resultado.por_unidade.length === 0 ? (
                <p className={estilos.vazio}>Sem respostas numéricas ainda.</p>
              ) : (
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Unidade</th>
                        <th className={estilos.numero}>Respostas</th>
                        <th className={estilos.numero}>Média (1–5)</th>
                        <th className={estilos.numero}>eNPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.por_unidade.map((linha) => (
                        <tr key={linha.unidade}>
                          <td>{linha.unidade}</td>
                          {linha.amostra_suficiente ? (
                            <>
                              <td className={estilos.numero}>
                                {linha.respostas}
                              </td>
                              <td className={estilos.numero}>
                                {linha.media === null
                                  ? insuficiente
                                  : linha.media.toFixed(2)}
                              </td>
                              <td className={estilos.numero}>
                                {linha.enps === null
                                  ? insuficiente
                                  : `${linha.enps > 0 ? "+" : ""}${linha.enps}`}
                              </td>
                            </>
                          ) : (
                            <td colSpan={3} className={estilos.suprimido}>
                              {insuficiente}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className={estilos.notaRodape}>
                Unidade com menos de {resultado.minimo_amostra} respostas sai sem
                valor e sem contagem.
              </p>
            </section>

            {/* ------------------------------------------ planos de ação */}
            <section className={estilos.cartao}>
              <h2>Planos de ação</h2>
              {planos.length === 0 ? (
                <p className={estilos.vazio}>
                  Nenhum plano de ação registrado — diagnóstico sem plano é só
                  relatório.
                </p>
              ) : (
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Plano</th>
                        <th>Unidade</th>
                        <th>Responsável</th>
                        <th>Prazo</th>
                        <th>Status</th>
                        {podeGerirPlano && <th>Mudar para</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {planos.map((plano) => (
                        <tr key={plano.id}>
                          <td>
                            {plano.titulo}
                            {plano.descricao && (
                              <>
                                <br />
                                <span className={estilos.ajuda}>
                                  {plano.descricao}
                                </span>
                              </>
                            )}
                          </td>
                          <td>{plano.unidade ?? "Empresa"}</td>
                          <td>{plano.responsavel_nome}</td>
                          <td>{formatarData(plano.prazo)}</td>
                          <td>
                            <span className={estilos.etiqueta}>
                              {ROTULOS_STATUS_PLANO[plano.status]}
                            </span>
                          </td>
                          {podeGerirPlano && (
                            <td>
                              <select
                                className={estilos.campo}
                                value={plano.status}
                                onChange={(e) =>
                                  mudarStatus(
                                    plano.id,
                                    e.target.value as StatusPlano
                                  )
                                }
                              >
                                {STATUS_PLANO.map((valor) => (
                                  <option key={valor} value={valor}>
                                    {ROTULOS_STATUS_PLANO[valor]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {podeGerirPlano && visaoPlanos && (
                <>
                  <h3>Novo plano</h3>
                  {!mostrarForm ? (
                    <button
                      type="button"
                      className={estilos.botao}
                      onClick={() => setMostrarForm(true)}
                    >
                      Criar plano de ação
                    </button>
                  ) : (
                    <form className={estilos.formulario} onSubmit={criarPlano}>
                      <div className={estilos.campoGrupoLargo}>
                        <label className={estilos.rotulo} htmlFor="plano-titulo">
                          Título
                        </label>
                        <input
                          id="plano-titulo"
                          className={estilos.campo}
                          value={titulo}
                          maxLength={200}
                          required
                          onChange={(e) => setTitulo(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupoLargo}>
                        <label className={estilos.rotulo} htmlFor="plano-desc">
                          Descrição (opcional)
                        </label>
                        <textarea
                          id="plano-desc"
                          className={estilos.campo}
                          rows={2}
                          maxLength={2000}
                          value={descricao}
                          onChange={(e) => setDescricao(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="plano-unidade">
                          Unidade
                        </label>
                        <select
                          id="plano-unidade"
                          className={estilos.campo}
                          value={unidadeId}
                          onChange={(e) => setUnidadeId(e.target.value)}
                        >
                          {visaoPlanos.restrito_a_unidade === null && (
                            <option value="">Empresa (todas)</option>
                          )}
                          {visaoPlanos.unidades.map((unidade) => (
                            <option key={unidade.id} value={String(unidade.id)}>
                              {unidade.unidade}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="plano-resp">
                          Responsável
                        </label>
                        <select
                          id="plano-resp"
                          className={estilos.campo}
                          value={responsavel}
                          required
                          onChange={(e) => setResponsavel(e.target.value)}
                        >
                          <option value="">Selecione…</option>
                          {visaoPlanos.responsaveis.map((usuario) => (
                            <option key={usuario.id} value={String(usuario.id)}>
                              {usuario.nome} ({usuario.papel})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="plano-prazo">
                          Prazo
                        </label>
                        <input
                          id="plano-prazo"
                          type="date"
                          className={estilos.campo}
                          value={prazo}
                          required
                          onChange={(e) => setPrazo(e.target.value)}
                        />
                      </div>
                      <div className={estilos.acoesLinha}>
                        <button
                          type="submit"
                          className={estilos.botao}
                          disabled={enviando}
                        >
                          {enviando ? "Salvando…" : "Salvar plano"}
                        </button>
                        <button
                          type="button"
                          className={estilos.botaoDiscreto}
                          onClick={() => setMostrarForm(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                      {visaoPlanos.restrito_a_unidade !== null && (
                        <p className={estilos.ajuda}>
                          Você cria plano apenas para a sua unidade.
                        </p>
                      )}
                    </form>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
