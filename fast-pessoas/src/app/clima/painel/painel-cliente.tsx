"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import { EMOJIS_NOTA, Nota, ROTULOS_NOTA } from "@/dominios/clima/esquemas";
import estilos from "./page.module.css";

interface AgregadoDia {
  data: string;
  media: number;
  respostas: number;
}

interface AgregadoPergunta {
  pergunta_versao_id: number;
  texto: string;
  media: number;
  respostas: number;
}

interface AgregadoClima {
  periodo: { inicio: string; fim: string };
  geral: { media: number | null; respostas: number; respondentes: number };
  por_dia: AgregadoDia[];
  por_pergunta: AgregadoPergunta[];
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMedia(media: number): string {
  return media.toFixed(1).replace(".", ",");
}

function emojiDaMedia(media: number): string {
  const nota = Math.min(5, Math.max(1, Math.round(media))) as Nota;
  return EMOJIS_NOTA[nota];
}

function listarDias(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${inicio}T00:00:00Z`);
  const limite = new Date(`${fim}T00:00:00Z`);
  while (cursor <= limite) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

export function PainelCliente({ veIndividual }: { veIndividual: boolean }) {
  const [agregado, setAgregado] = useState<AgregadoClima | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/clima/agregado");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setAgregado(dados as AgregadoClima);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o painel.");
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

  const dias = agregado
    ? listarDias(agregado.periodo.inicio, agregado.periodo.fim)
    : [];
  const porDia = new Map(
    (agregado?.por_dia ?? []).map((item) => [item.data, item])
  );

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/clima">
          Check-in
        </Link>
        {veIndividual && (
          <Link className={acaoCabecalho} href="/clima/individual">
            Respostas individuais
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Painel do clima</h1>
        <p className={estilos.subtitulo}>
          Médias agregadas do check-in diário — sem identificação de quem
          respondeu.
          {agregado &&
            ` Período: ${formatarData(agregado.periodo.inicio)} a ${formatarData(agregado.periodo.fim)}.`}
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

        {agregado && (
          <>
            <section className={estilos.grade}>
              <div className={estilos.cartaoResumo}>
                <span className={estilos.resumoValor}>
                  {agregado.geral.media !== null
                    ? `${emojiDaMedia(agregado.geral.media)} ${formatarMedia(agregado.geral.media)}`
                    : "—"}
                </span>
                <span className={estilos.resumoRotulo}>
                  Média geral (1 a 5)
                </span>
              </div>
              <div className={estilos.cartaoResumo}>
                <span className={estilos.resumoValor}>
                  {agregado.geral.respostas}
                </span>
                <span className={estilos.resumoRotulo}>Respostas</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <span className={estilos.resumoValor}>
                  {agregado.geral.respondentes}
                </span>
                <span className={estilos.resumoRotulo}>
                  Pessoas participantes
                </span>
              </div>
            </section>

            <section className={estilos.cartao}>
              <h2>Tendência dos últimos 30 dias</h2>
              {agregado.por_dia.length === 0 ? (
                <p className={estilos.vazio}>
                  Ainda não há respostas no período.
                </p>
              ) : (
                <>
                  <div className={estilos.grafico}>
                    {dias.map((dia) => {
                      const item = porDia.get(dia);
                      return (
                        <div
                          key={dia}
                          className={estilos.coluna}
                          title={
                            item
                              ? `${formatarData(dia)} — média ${formatarMedia(item.media)} (${item.respostas} resposta${item.respostas === 1 ? "" : "s"})`
                              : `${formatarData(dia)} — sem respostas`
                          }
                        >
                          <div
                            className={
                              item ? estilos.barra : estilos.barraVazia
                            }
                            style={
                              item
                                ? { height: `${(item.media / 5) * 100}%` }
                                : undefined
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className={estilos.graficoLegenda}>
                    <span>{formatarData(agregado.periodo.inicio)}</span>
                    <span>altura = média do dia (1 a 5)</span>
                    <span>{formatarData(agregado.periodo.fim)}</span>
                  </div>
                </>
              )}
            </section>

            <section className={estilos.cartao}>
              <h2>Média por pergunta</h2>
              {agregado.por_pergunta.length === 0 ? (
                <p className={estilos.vazio}>
                  Ainda não há respostas no período.
                </p>
              ) : (
                <ul className={estilos.listaPerguntas}>
                  {agregado.por_pergunta.map((pergunta) => (
                    <li
                      key={pergunta.pergunta_versao_id}
                      className={estilos.itemPergunta}
                    >
                      <div className={estilos.perguntaTexto}>
                        {pergunta.texto}
                      </div>
                      <div className={estilos.perguntaBarraFundo}>
                        <div
                          className={estilos.perguntaBarra}
                          style={{ width: `${(pergunta.media / 5) * 100}%` }}
                        />
                      </div>
                      <div className={estilos.perguntaDetalhe}>
                        {emojiDaMedia(pergunta.media)} média{" "}
                        {formatarMedia(pergunta.media)} · {pergunta.respostas}{" "}
                        resposta{pergunta.respostas === 1 ? "" : "s"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={estilos.cartao}>
              <h2>Escala</h2>
              <div className={estilos.escala}>
                {([1, 2, 3, 4, 5] as Nota[]).map((nota) => (
                  <span key={nota} className={estilos.escalaItem}>
                    <span aria-hidden="true">{EMOJIS_NOTA[nota]}</span>{" "}
                    {nota} — {ROTULOS_NOTA[nota]}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
