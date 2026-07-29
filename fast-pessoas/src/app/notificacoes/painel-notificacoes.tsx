"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  dataHoraSp,
  NotificacaoExibida,
  RespostaNotificacoes,
  tempoRelativo,
} from "./formato";
import estilos from "./page.module.css";

export function PainelNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoExibida[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/notificacoes");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          const visao = dados as RespostaNotificacoes;
          setNotificacoes(visao.notificacoes);
          setNaoLidas(visao.nao_lidas);
          setTemMais(visao.tem_mais);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar as notificações.");
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
  }, []);

  async function carregarMais() {
    const ultima = notificacoes[notificacoes.length - 1];
    if (!ultima || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const resposta = await fetch(`/api/notificacoes?antes_de=${ultima.id}`);
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        const visao = dados as RespostaNotificacoes;
        setNotificacoes((atual) => {
          const vistos = new Set(atual.map((n) => n.id));
          return [
            ...atual,
            ...visao.notificacoes.filter((n) => !vistos.has(n.id)),
          ];
        });
        setTemMais(visao.tem_mais);
        setErro(null);
      } else {
        setErro(dados.erro ?? "Não foi possível carregar mais notificações.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setCarregandoMais(false);
    }
  }

  async function aoClicar(notificacao: NotificacaoExibida) {
    if (!notificacao.lida) {
      setNotificacoes((atual) =>
        atual.map((n) => (n.id === notificacao.id ? { ...n, lida: true } : n))
      );
      setNaoLidas((atual) => Math.max(0, atual - 1));
      try {
        await fetch("/api/notificacoes/ler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notificacao.id] }),
          keepalive: true,
        });
      } catch {
        // navegação segue; recarregar a página reconcilia
      }
    }
    if (notificacao.link && notificacao.link.startsWith("/")) {
      router.push(notificacao.link);
    }
  }

  async function marcarTodas() {
    setNotificacoes((atual) => atual.map((n) => ({ ...n, lida: true })));
    setNaoLidas(0);
    try {
      await fetch("/api/notificacoes/ler-todas", { method: "POST" });
    } catch {
      setErro("Falha de conexão ao marcar todas. Recarregue a página.");
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />
      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Notificações</h1>
          {naoLidas > 0 && (
            <button
              type="button"
              className={estilos.marcarTodas}
              onClick={marcarTodas}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <p className={estilos.subtitulo}>
          {naoLidas > 0
            ? `Você tem ${naoLidas} notificação${naoLidas === 1 ? "" : "s"} não lida${naoLidas === 1 ? "" : "s"}.`
            : "Você está em dia com as suas notificações."}
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}

        {carregando ? (
          <p className={estilos.vazio}>Carregando…</p>
        ) : notificacoes.length === 0 ? (
          <p className={estilos.vazio}>
            Nenhuma notificação por aqui. Quando algo precisar da sua atenção,
            o aviso aparece nesta página e no sino do cabeçalho.
          </p>
        ) : (
          <ul className={estilos.lista}>
            {notificacoes.map((notificacao) => (
              <li key={notificacao.id}>
                <button
                  type="button"
                  className={
                    notificacao.lida
                      ? estilos.cartao
                      : `${estilos.cartao} ${estilos.cartaoNaoLida}`
                  }
                  onClick={() => aoClicar(notificacao)}
                >
                  <span className={estilos.linhaCartao}>
                    <span className={estilos.tituloCartao}>
                      {notificacao.titulo}
                    </span>
                    {!notificacao.lida && (
                      <span className={estilos.seloNaoLida}>Não lida</span>
                    )}
                  </span>
                  {notificacao.corpo && (
                    <span className={estilos.corpoCartao}>
                      {notificacao.corpo}
                    </span>
                  )}
                  <span
                    className={estilos.tempoCartao}
                    title={dataHoraSp(notificacao.criada_em)}
                  >
                    {tempoRelativo(notificacao.criada_em)}
                    {notificacao.link ? " — abrir a tela relacionada" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {temMais && (
          <button
            type="button"
            className={estilos.carregarMais}
            onClick={carregarMais}
            disabled={carregandoMais}
          >
            {carregandoMais ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </main>
    </div>
  );
}
