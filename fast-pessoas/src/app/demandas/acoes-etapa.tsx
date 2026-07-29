"use client";

import { useState } from "react";
import { NivelAprovacao } from "@/dominios/demandas/esquemas";
import comum from "./comum.module.css";
import { numeroDemanda } from "./cartao-demanda";
import { DialogoMotivo } from "./dialogo-motivo";

/**
 * Aprovar/reprovar UMA etapa da cadeia. O botão só aparece quando o servidor
 * disse que este usuário decide a etapa pendente (`acoes.decidir_etapa`) — a
 * autorização de verdade é conferida na rota e no serviço.
 */
export function AcoesEtapa({
  demandaId,
  numero,
  nivel,
  aoAtualizar,
}: {
  demandaId: number;
  numero: number;
  nivel: NivelAprovacao;
  aoAtualizar: () => void;
}) {
  const [dialogo, setDialogo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(decisao: "aprovar" | "reprovar", motivo?: string) {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/demandas/${demandaId}/decidir-etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(motivo ? { decisao, motivo } : { decisao }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogo(false);
        aoAtualizar();
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a decisão.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const comoDiretoria = nivel === "diretoria";
  return (
    <>
      <button
        className={comum.botaoPrimario}
        type="button"
        disabled={enviando}
        onClick={() => decidir("aprovar")}
      >
        {comoDiretoria ? "Aprovar (diretoria)" : "Aprovar (líder)"}
      </button>
      <button
        className={comum.botaoSecundario}
        type="button"
        disabled={enviando}
        onClick={() => setDialogo(true)}
      >
        Reprovar…
      </button>
      {erro && !dialogo && <span className={comum.erroAcao}>{erro}</span>}
      <DialogoMotivo
        key={dialogo ? "aberto" : "fechado"}
        aberto={dialogo}
        titulo={`Reprovar ${numeroDemanda(numero)}`}
        subtitulo="O motivo é obrigatório, fica no histórico da cadeia e encerra o pedido."
        rotuloCampo="Motivo"
        rotuloBotao="Reprovar"
        enviando={enviando}
        erro={erro}
        aoCancelar={() => {
          setDialogo(false);
          setErro(null);
        }}
        aoConfirmar={(texto) => decidir("reprovar", texto)}
      />
    </>
  );
}
