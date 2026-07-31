"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  competenciaCorrente,
  EstadoCompetencia,
  formatarCompetencia,
  MESES_ROTULO,
  ROTULOS_ESTADO_COMPETENCIA,
} from "@/dominios/folha/esquemas";
import estilos from "./folha.module.css";

interface Competencia {
  id: number;
  ano: number;
  mes: number;
  tipo: string;
  estado: EstadoCompetencia;
  aberta_em: string;
  fechada_em: string | null;
  total_calculadas: number;
}

interface Visao {
  pode: {
    ver: boolean;
    operar: boolean;
    aprovar: boolean;
    parametros: boolean;
  };
  competencias: Competencia[];
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function classeEtiquetaEstado(estado: EstadoCompetencia): string {
  const porEstado: Record<EstadoCompetencia, string> = {
    aberta: estilos.etiquetaAberta,
    calculo: estilos.etiquetaCalculo,
    conferencia: estilos.etiquetaConferencia,
    aprovada: estilos.etiquetaAprovada,
    fechada: estilos.etiquetaFechada,
  };
  return `${estilos.etiqueta} ${porEstado[estado]}`;
}

export function PainelCompetencias() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  // Trava retroativa (G3): o formulário só oferece do mês corrente para
  // frente. O servidor recusa igual com 409 — a tela só evita o erro óbvio.
  const atual = competenciaCorrente();
  const [ano, setAno] = useState(String(atual.ano));
  const [mes, setMes] = useState(String(atual.mes));
  const [abrindo, setAbrindo] = useState(false);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/folha");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar a folha.");
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
  }, [versao]);

  async function abrir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroAbrir(null);
    setAbrindo(true);
    try {
      const resposta = await fetch("/api/folha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano: Number(ano), mes: Number(mes) }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setVersao((atual) => atual + 1);
      } else {
        setErroAbrir(dados.erro ?? "Não foi possível abrir a competência.");
      }
    } catch {
      setErroAbrir("Falha de conexão. Tente novamente.");
    } finally {
      setAbrindo(false);
    }
  }

  // Do ano corrente para frente — nunca o ano passado.
  const anosOpcoes = [atual.ano, atual.ano + 1];
  // No ano corrente, só do mês corrente em diante; nos anos seguintes, todos.
  const primeiroMes = Number(ano) === atual.ano ? atual.mes : 1;

  function trocarAno(novoAno: string) {
    setAno(novoAno);
    if (Number(novoAno) === atual.ano && Number(mes) < atual.mes) {
      setMes(String(atual.mes));
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        {visao?.pode.parametros && (
          <Link className={acaoCabecalho} href="/folha/parametros">
            Parâmetros
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Folha de pagamento</h1>
        <p className={estilos.subtitulo}>
          Competências da folha mensal — abrir, lançar variáveis, calcular,
          conferir, aprovar e fechar. Fechada não reabre.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

        {!carregando && visao?.pode.operar && (
          <section className={estilos.cartao}>
            <h2>Abrir competência</h2>
            <p className={estilos.notaRodape}>
              Só do mês corrente ({formatarCompetencia(atual.ano, atual.mes)})
              para frente — abrir dezembro em julho pode; voltar para um mês já
              passado, não. Correção de competência encerrada é folha
              complementar.
            </p>
            <form className={estilos.formulario} onSubmit={abrir}>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="mes">
                  Mês
                </label>
                <select
                  className={estilos.campo}
                  id="mes"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                >
                  {MESES_ROTULO.map((nome, indice) => indice + 1)
                    .filter((numero) => numero >= primeiroMes)
                    .map((numero) => (
                      <option key={numero} value={numero}>
                        {MESES_ROTULO[numero - 1]}
                      </option>
                    ))}
                </select>
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="ano">
                  Ano
                </label>
                <select
                  className={estilos.campo}
                  id="ano"
                  value={ano}
                  onChange={(e) => trocarAno(e.target.value)}
                >
                  {anosOpcoes.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={abrindo}
              >
                {abrindo ? "Abrindo…" : "Abrir competência"}
              </button>
            </form>
            {erroAbrir && <p className={estilos.erro}>{erroAbrir}</p>}
          </section>
        )}

        {!carregando && visao && (
          <section className={estilos.cartao}>
            <h2>Competências</h2>
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Competência</th>
                    <th>Tipo</th>
                    <th>Situação</th>
                    <th className={estilos.numero}>Folhas calculadas</th>
                    <th>Aberta em</th>
                    <th>Fechada em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visao.competencias.map((competencia) => (
                    <tr key={competencia.id}>
                      <td>
                        <strong>
                          {formatarCompetencia(competencia.ano, competencia.mes)}
                        </strong>
                      </td>
                      <td>{competencia.tipo}</td>
                      <td>
                        <span className={classeEtiquetaEstado(competencia.estado)}>
                          {ROTULOS_ESTADO_COMPETENCIA[competencia.estado]}
                        </span>
                      </td>
                      <td className={estilos.numero}>
                        {competencia.total_calculadas}
                      </td>
                      <td>{formatarDataHora(competencia.aberta_em)}</td>
                      <td>
                        {competencia.fechada_em
                          ? formatarDataHora(competencia.fechada_em)
                          : "—"}
                      </td>
                      <td>
                        <Link
                          className={estilos.ligacao}
                          href={`/folha/${competencia.id}`}
                        >
                          Abrir painel
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {visao.competencias.length === 0 && (
                    <tr>
                      <td colSpan={7}>Nenhuma competência aberta ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p className={estilos.notaRodape}>
          Datas no horário de Brasília (America/Sao_Paulo). A lista não mostra
          valores — o painel da competência mostra, com trilha de leitura.
        </p>
      </main>
    </div>
  );
}
