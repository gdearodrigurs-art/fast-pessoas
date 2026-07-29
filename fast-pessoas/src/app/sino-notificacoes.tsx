"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NotificacaoExibida,
  RespostaNotificacoes,
  tempoRelativo,
} from "./notificacoes/formato";
import estilos from "./sino-notificacoes.module.css";

const INTERVALO_ATUALIZACAO_MS = 60_000;

/**
 * Sino do cabeçalho: badge com a contagem de não lidas (atualizada a cada
 * 60 s), dropdown com as mais recentes e atalho para /notificacoes.
 * Componente client autocontido — o integrador pluga no Cabecalho.
 */
export function SinoNotificacoes() {
  const [aberto, setAberto] = useState(false);
  const [visao, setVisao] = useState<RespostaNotificacoes | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/notificacoes");
      if (!resposta.ok) return; // silencioso: o sino nunca quebra a página
      setVisao((await resposta.json()) as RespostaNotificacoes);
    } catch {
      // falha de rede transitória: mantém o estado atual
    }
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
    const temporizador = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(temporizador);
  }, [carregar]);

  // Fecha ao clicar fora ou teclar Escape.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function abrirFechar() {
    if (!aberto) carregar();
    setAberto(!aberto);
  }

  function marcarLocalmente(ids: Set<number>) {
    setVisao((atual) =>
      atual
        ? {
            ...atual,
            nao_lidas: Math.max(
              0,
              atual.nao_lidas -
                atual.notificacoes.filter((n) => !n.lida && ids.has(n.id))
                  .length
            ),
            notificacoes: atual.notificacoes.map((n) =>
              ids.has(n.id) ? { ...n, lida: true } : n
            ),
          }
        : atual
    );
  }

  async function aoClicarNotificacao(notificacao: NotificacaoExibida) {
    setAberto(false);
    if (!notificacao.lida) {
      marcarLocalmente(new Set([notificacao.id]));
      try {
        await fetch("/api/notificacoes/ler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notificacao.id] }),
          keepalive: true,
        });
      } catch {
        // melhor navegar do que travar o clique; o histórico corrige depois
      }
    }
    if (notificacao.link && notificacao.link.startsWith("/")) {
      router.push(notificacao.link);
    }
  }

  async function marcarTodas() {
    setVisao((atual) =>
      atual
        ? {
            ...atual,
            nao_lidas: 0,
            notificacoes: atual.notificacoes.map((n) => ({ ...n, lida: true })),
          }
        : atual
    );
    try {
      await fetch("/api/notificacoes/ler-todas", { method: "POST" });
    } catch {
      // próxima atualização periódica reconcilia
    }
  }

  const naoLidas = visao?.nao_lidas ?? 0;
  const notificacoes = visao?.notificacoes ?? [];

  return (
    <div className={estilos.sino} ref={raiz}>
      <button
        type="button"
        className={estilos.botaoSino}
        onClick={abrirFechar}
        aria-expanded={aberto}
        aria-label={
          naoLidas > 0
            ? `Notificações — ${naoLidas} não ${naoLidas === 1 ? "lida" : "lidas"}`
            : "Notificações"
        }
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {naoLidas > 0 && (
          <span className={estilos.contador}>
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className={estilos.painel}>
          <div className={estilos.topo}>
            <span className={estilos.tituloPainel}>Notificações</span>
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
          {notificacoes.length === 0 ? (
            <p className={estilos.vazio}>Nenhuma notificação por aqui.</p>
          ) : (
            <ul className={estilos.lista}>
              {notificacoes.map((notificacao) => (
                <li key={notificacao.id}>
                  <button
                    type="button"
                    className={
                      notificacao.lida
                        ? estilos.item
                        : `${estilos.item} ${estilos.itemNaoLida}`
                    }
                    onClick={() => aoClicarNotificacao(notificacao)}
                  >
                    <span className={estilos.tituloItem}>
                      {notificacao.titulo}
                    </span>
                    {notificacao.corpo && (
                      <span className={estilos.corpoItem}>
                        {notificacao.corpo}
                      </span>
                    )}
                    <span className={estilos.tempoItem}>
                      {tempoRelativo(notificacao.criada_em)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            className={estilos.verTodas}
            href="/notificacoes"
            onClick={() => setAberto(false)}
          >
            Ver histórico completo
          </Link>
        </div>
      )}
    </div>
  );
}
