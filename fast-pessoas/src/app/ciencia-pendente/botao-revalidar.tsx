"use client";

import { useCallback, useEffect, useState } from "react";
import estilos from "./page.module.css";

/**
 * Reconfere o bloqueio pela ROTA de regularização: GET
 * /api/documentos/pendencias/minhas reemite a sessão sem o claim
 * `ciencia_pendente` quando o banco já não acusa bloqueio (ciência dada ou
 * liberação de terceiro). Com o cookie novo, a volta ao início passa pelo
 * proxy. `automatico` dispara a verificação já na montagem — é o caso da
 * página que detectou claim obsoleto no servidor.
 */
export function BotaoRevalidarAcesso({
  automatico = false,
}: {
  automatico?: boolean;
}) {
  const [verificando, setVerificando] = useState(automatico);
  const [mensagem, setMensagem] = useState<string | null>(null);

  // Sem setState síncrono: quem chama decide o que fazer com o desfecho.
  // Devolve a mensagem de erro, ou null quando navegou para fora da página.
  const consultarBloqueio = useCallback(async (): Promise<string | null> => {
    try {
      const resposta = await fetch("/api/documentos/pendencias/minhas");
      if (resposta.status === 401) {
        window.location.assign("/entrar");
        return null;
      }
      const dados: { bloqueada?: boolean } = await resposta
        .json()
        .catch(() => ({}));
      if (resposta.ok && dados.bloqueada === false) {
        // O cookie já veio reemitido sem o claim — a home passa pelo proxy.
        window.location.assign("/");
        return null;
      }
      return "A pendência ainda está aberta — registre a ciência em Documentos.";
    } catch {
      return "Falha de conexão. Tente novamente.";
    }
  }, []);

  async function verificarPeloBotao() {
    setVerificando(true);
    setMensagem(null);
    const desfecho = await consultarBloqueio();
    setMensagem(desfecho);
    setVerificando(false);
  }

  useEffect(() => {
    if (!automatico) return;
    let ativo = true;
    void consultarBloqueio().then((desfecho) => {
      if (!ativo) return;
      setMensagem(desfecho);
      setVerificando(false);
    });
    return () => {
      ativo = false;
    };
  }, [automatico, consultarBloqueio]);

  return (
    <>
      <button
        className={estilos.botaoSecundario}
        type="button"
        onClick={() => void verificarPeloBotao()}
        disabled={verificando}
      >
        {verificando ? "Verificando…" : "Já regularizei — verificar de novo"}
      </button>
      {mensagem && <p className={estilos.aviso}>{mensagem}</p>}
    </>
  );
}
