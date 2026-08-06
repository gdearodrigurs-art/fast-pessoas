"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { rotuloTransicao } from "@/dominios/demandas/esquemas";
import { rotuloPapel } from "@/dominios/usuarios/esquemas";
import { AcoesDemanda } from "../acoes-demanda";
import { AcoesEtapa } from "../acoes-etapa";
import { CartaoDemanda } from "../cartao-demanda";
import { CartaoMovimentacao } from "../cartao-movimentacao";
import comum from "../comum.module.css";
import { formatarDataHora } from "../formato";
import { Comentario, Detalhe } from "../tipos";
import estilos from "./page.module.css";

export function DetalheDemanda({ id }: { id: number }) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [comentario, setComentario] = useState("");
  const [comentando, setComentando] = useState(false);
  const [erroComentario, setErroComentario] = useState<string | null>(null);

  // Incrementar "versao" força uma nova busca (após uma ação na demanda).
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/demandas/${id}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setDetalhe(dados as Detalhe);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar a demanda.");
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
    setVersao((atual) => atual + 1);
  }

  async function comentar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!comentario.trim()) return;
    setComentando(true);
    setErroComentario(null);
    try {
      const resposta = await fetch(`/api/demandas/${id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: comentario.trim() }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setComentario("");
        setDetalhe((atual) =>
          atual
            ? { ...atual, comentarios: dados.comentarios as Comentario[] }
            : atual
        );
      } else {
        setErroComentario(dados.erro ?? "Não foi possível comentar.");
      }
    } catch {
      setErroComentario("Falha de conexão. Tente novamente.");
    } finally {
      setComentando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/demandas">
          ← Demandas
        </Link>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !detalhe && <p className={estilos.vazio}>Carregando…</p>}

        {detalhe && (
          <>
            <CartaoDemanda demanda={detalhe.demanda}>
              <AcoesDemanda
                demandaId={detalhe.demanda.id}
                numero={detalhe.demanda.numero}
                habilitadas={detalhe.acoes}
                aoAtualizar={recarregar}
              />
            </CartaoDemanda>

            {detalhe.movimentacao && (
              <section className={estilos.bloco}>
                <h2>Pedido de movimentação</h2>
                <p className={estilos.notaFuso}>
                  Cadeia de aprovação <b>líder → diretoria</b>: os dois níveis
                  abaixo mostram quem decidiu o quê e quando.
                </p>
                <CartaoMovimentacao
                  dados={{
                    demanda: detalhe.demanda,
                    movimentacao: detalhe.movimentacao,
                    etapas: detalhe.etapas,
                  }}
                >
                  {detalhe.acoes.decidir_etapa && (
                    <AcoesEtapa
                      demandaId={detalhe.demanda.id}
                      numero={detalhe.demanda.numero}
                      nivel={detalhe.acoes.decidir_etapa}
                      aoAtualizar={recarregar}
                    />
                  )}
                </CartaoMovimentacao>
              </section>
            )}

            <section className={estilos.bloco}>
              <h2>Histórico de transições</h2>
              <p className={estilos.notaFuso}>
                Horários no fuso America/Sao_Paulo.
              </p>
              {detalhe.transicoes.map((transicao) => (
                <div key={transicao.id} className={estilos.itemHistorico}>
                  <span className={estilos.quandoHistorico}>
                    {formatarDataHora(transicao.em)}
                  </span>{" "}
                  —{" "}
                  {rotuloTransicao(
                    transicao.de_status,
                    transicao.para_status,
                    transicao.por_nome
                  )}
                  {transicao.motivo
                    ? ` — ${
                        transicao.para_status === "concluida"
                          ? "resposta"
                          : "motivo"
                      }: ${transicao.motivo}`
                    : ""}
                </div>
              ))}
            </section>

            <section className={estilos.bloco}>
              <h2>Comentários</h2>
              {detalhe.comentarios.length === 0 ? (
                <p className={estilos.vazio}>Nenhum comentário ainda.</p>
              ) : (
                detalhe.comentarios.map((item) => (
                  <div key={item.id} className={estilos.comentario}>
                    <span className={estilos.autorComentario}>
                      {item.autor_nome}
                    </span>{" "}
                    <span className={estilos.quandoComentario}>
                      ({rotuloPapel(item.autor_papel)} ·{" "}
                      {formatarDataHora(item.em)})
                    </span>
                    <p className={estilos.textoComentario}>{item.texto}</p>
                  </div>
                ))
              )}
              {detalhe.acoes.comentar && (
                <form className={estilos.formComentario} onSubmit={comentar}>
                  <input
                    className={estilos.campoComentario}
                    type="text"
                    maxLength={4000}
                    placeholder="Escreva um comentário…"
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                  />
                  <button
                    className={comum.botaoPrimario}
                    type="submit"
                    disabled={comentando || !comentario.trim()}
                  >
                    {comentando ? "Enviando…" : "Comentar"}
                  </button>
                </form>
              )}
              {erroComentario && (
                <p className={comum.erroAcao}>{erroComentario}</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
