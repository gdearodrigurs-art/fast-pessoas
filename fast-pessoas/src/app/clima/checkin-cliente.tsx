"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import {
  AVISO_TRANSPARENCIA,
  EMOJIS_NOTA,
  NOTAS,
  Nota,
  ROTULOS_NOTA,
} from "@/dominios/clima/esquemas";
import estilos from "./page.module.css";

interface RespostaDada {
  nota: number;
  comentario: string | null;
}

interface PerguntaDoDia {
  id: number;
  texto: string;
  resposta: RespostaDada | null;
}

interface CheckinDoDia {
  data_referencia: string;
  colaborador_vinculado: boolean;
  perguntas: PerguntaDoDia[];
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function CartaoPergunta({
  pergunta,
  aoResponder,
}: {
  pergunta: PerguntaDoDia;
  aoResponder: (perguntaId: number, resposta: RespostaDada) => void;
}) {
  const [nota, setNota] = useState<Nota | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (pergunta.resposta) {
    const notaDada = pergunta.resposta.nota as Nota;
    return (
      <section className={estilos.cartao}>
        <h2>{pergunta.texto}</h2>
        <div className={estilos.confirmacao}>
          <span className={estilos.emojiConfirmacao} aria-hidden="true">
            {EMOJIS_NOTA[notaDada] ?? ""}
          </span>
          <div>
            <p className={estilos.confirmacaoTitulo}>
              Resposta registrada: {ROTULOS_NOTA[notaDada] ?? notaDada}
            </p>
            {pergunta.resposta.comentario && (
              <p className={estilos.confirmacaoComentario}>
                &ldquo;{pergunta.resposta.comentario}&rdquo;
              </p>
            )}
            <p className={estilos.confirmacaoObrigado}>
              Obrigado por compartilhar como você está.
            </p>
          </div>
        </div>
      </section>
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (nota === null) {
      setErro("Escolha um dos emojis para responder.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const corpo: Record<string, unknown> = {
        pergunta_versao_id: pergunta.id,
        nota,
      };
      const comentarioLimpo = comentario.trim();
      if (comentarioLimpo) {
        corpo.comentario = comentarioLimpo;
      }
      const resposta = await fetch("/api/clima/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok || resposta.status === 409) {
        aoResponder(pergunta.id, {
          nota,
          comentario: comentarioLimpo || null,
        });
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a resposta.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>{pergunta.texto}</h2>
      <form onSubmit={enviar}>
        <div
          className={estilos.emojiLinha}
          role="radiogroup"
          aria-label={pergunta.texto}
        >
          {NOTAS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={nota === opcao}
              className={
                nota === opcao
                  ? `${estilos.emojiBotao} ${estilos.emojiSelecionado}`
                  : estilos.emojiBotao
              }
              title={ROTULOS_NOTA[opcao]}
              onClick={() => setNota(opcao)}
            >
              <span aria-hidden="true">{EMOJIS_NOTA[opcao]}</span>
              <span className={estilos.emojiRotulo}>{ROTULOS_NOTA[opcao]}</span>
            </button>
          ))}
        </div>
        <div className={estilos.campoGrupo}>
          <label className={estilos.rotulo} htmlFor={`comentario-${pergunta.id}`}>
            Quer comentar algo? (opcional)
          </label>
          <textarea
            className={estilos.campoTexto}
            id={`comentario-${pergunta.id}`}
            maxLength={2000}
            rows={2}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>
        <button className={estilos.botao} type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar resposta"}
        </button>
        {erro && <p className={estilos.erro}>{erro}</p>}
      </form>
    </section>
  );
}

export function CheckinCliente({
  vePainel,
  veIndividual,
}: {
  vePainel: boolean;
  veIndividual: boolean;
}) {
  const [checkin, setCheckin] = useState<CheckinDoDia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/clima/checkin");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setCheckin(dados as CheckinDoDia);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o check-in.");
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

  function registrarResposta(perguntaId: number, resposta: RespostaDada) {
    setCheckin((atual) =>
      atual
        ? {
            ...atual,
            perguntas: atual.perguntas.map((pergunta) =>
              pergunta.id === perguntaId ? { ...pergunta, resposta } : pergunta
            ),
          }
        : atual
    );
  }

  const tudoRespondido =
    checkin !== null &&
    checkin.perguntas.length > 0 &&
    checkin.perguntas.every((pergunta) => pergunta.resposta !== null);

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        {vePainel && (
          <Link className={acaoCabecalho} href="/clima/painel">
            Painel do clima
          </Link>
        )}
        {veIndividual && (
          <Link className={acaoCabecalho} href="/clima/individual">
            Respostas individuais
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Check-in diário</h1>
        <p className={estilos.subtitulo}>
          {checkin
            ? `Como foi o seu dia ${formatarData(checkin.data_referencia)}? Responder leva menos de 10 segundos.`
            : "Responder leva menos de 10 segundos."}
        </p>

        <aside className={estilos.avisoTransparencia}>
          <strong>Quem vê o quê:</strong> {AVISO_TRANSPARENCIA}
        </aside>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

        {checkin && !checkin.colaborador_vinculado && (
          <section className={estilos.cartao}>
            <p className={estilos.avisoSemVinculo}>
              Sua conta ainda não está vinculada a um colaborador, então o
              check-in não pode ser registrado. Procure o RH para ajustar o seu
              cadastro.
            </p>
          </section>
        )}

        {checkin &&
          checkin.colaborador_vinculado &&
          checkin.perguntas.map((pergunta) => (
            <CartaoPergunta
              key={pergunta.id}
              pergunta={pergunta}
              aoResponder={registrarResposta}
            />
          ))}

        {checkin && checkin.colaborador_vinculado && tudoRespondido && (
          <section className={estilos.cartaoConcluido}>
            <p>
              <strong>Check-in de hoje concluído.</strong> Até amanhã!
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
