"use client";

import { useState } from "react";
import comum from "./comum.module.css";
import { numeroDemanda } from "./cartao-demanda";
import { DialogoMotivo } from "./dialogo-motivo";

type AcaoComTexto = "reprovar" | "concluir" | "recusar";

const DIALOGOS: Record<
  AcaoComTexto,
  { titulo: string; subtitulo: string; rotuloCampo: string; rotuloBotao: string }
> = {
  reprovar: {
    titulo: "Reprovar",
    subtitulo:
      "A justificativa é obrigatória e fica registrada no histórico da demanda.",
    rotuloCampo: "Motivo",
    rotuloBotao: "Reprovar",
  },
  // O ato é o mesmo de sempre (a API continua sendo `concluir`); o rótulo mudou
  // porque o par estava desequilibrado: "Recusar" é o oposto de "Aprovar", não
  // de "Concluir". Não colide com o botão Aprovar da cadeia — aquele só existe
  // em `aguardando_aprovacao` e este só em `em_atendimento`.
  concluir: {
    titulo: "Aprovar",
    subtitulo:
      "Descreva a entrega/resposta ao solicitante — ela entra no histórico e nos comentários.",
    rotuloCampo: "Resposta",
    rotuloBotao: "Aprovar",
  },
  recusar: {
    titulo: "Recusar",
    subtitulo:
      "O motivo é obrigatório e o solicitante o verá no histórico da demanda.",
    rotuloCampo: "Motivo",
    rotuloBotao: "Recusar",
  },
};

export function AcoesDemanda({
  demandaId,
  numero,
  habilitadas,
  aoAtualizar,
}: {
  demandaId: number;
  numero: number;
  habilitadas: {
    aprovar?: boolean;
    reprovar?: boolean;
    assumir?: boolean;
    concluir?: boolean;
    recusar?: boolean;
    /** Movimentação aprovada cuja data pretendida já chegou (efeito por aplicar). */
    aplicar_efeito?: boolean;
  };
  aoAtualizar: () => void;
}) {
  const [dialogo, setDialogo] = useState<AcaoComTexto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(acao: string, corpo?: Record<string, string>) {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/demandas/${demandaId}/${acao}`, {
        method: "POST",
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogo(null);
        aoAtualizar();
      } else {
        setErro(dados.erro ?? "Não foi possível executar a ação.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  function confirmarComTexto(texto: string) {
    if (dialogo === "reprovar") executar("reprovar", { motivo: texto });
    else if (dialogo === "concluir") executar("concluir", { resposta: texto });
    else if (dialogo === "recusar") executar("recusar", { motivo: texto });
  }

  const configuracao = dialogo ? DIALOGOS[dialogo] : null;

  return (
    <>
      {habilitadas.aprovar && (
        <button
          className={comum.botaoPrimario}
          type="button"
          disabled={enviando}
          onClick={() => executar("aprovar")}
        >
          Aprovar
        </button>
      )}
      {habilitadas.reprovar && (
        <button
          className={comum.botaoSecundario}
          type="button"
          disabled={enviando}
          onClick={() => setDialogo("reprovar")}
        >
          Reprovar…
        </button>
      )}
      {habilitadas.assumir && (
        <button
          className={comum.botaoPrimario}
          type="button"
          disabled={enviando}
          onClick={() => executar("assumir")}
        >
          Assumir
        </button>
      )}
      {/* Aplicar o efeito é o ato que a data pretendida destravou: a aprovação
          decidiu, e aqui a movimentação entra de fato no cadastro. */}
      {habilitadas.aplicar_efeito && (
        <button
          className={comum.botaoPrimario}
          type="button"
          disabled={enviando}
          onClick={() => executar("aplicar-efeito")}
        >
          Aplicar efeito no cadastro
        </button>
      )}
      {habilitadas.concluir && (
        <button
          className={comum.botaoPrimario}
          type="button"
          disabled={enviando}
          onClick={() => setDialogo("concluir")}
        >
          Aprovar…
        </button>
      )}
      {habilitadas.recusar && (
        <button
          className={comum.botaoSecundario}
          type="button"
          disabled={enviando}
          onClick={() => setDialogo("recusar")}
        >
          Recusar…
        </button>
      )}
      {erro && !dialogo && <span className={comum.erroAcao}>{erro}</span>}
      <DialogoMotivo
        key={dialogo ?? "fechado"}
        aberto={dialogo !== null}
        titulo={`${configuracao?.titulo ?? ""} ${numeroDemanda(numero)}`}
        subtitulo={configuracao?.subtitulo ?? ""}
        rotuloCampo={configuracao?.rotuloCampo ?? "Motivo"}
        rotuloBotao={configuracao?.rotuloBotao ?? "Confirmar"}
        enviando={enviando}
        erro={dialogo ? erro : null}
        aoCancelar={() => {
          setDialogo(null);
          setErro(null);
        }}
        aoConfirmar={confirmarComTexto}
      />
    </>
  );
}
