"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import { EMOJIS_NOTA, Nota, ROTULOS_NOTA } from "@/dominios/clima/esquemas";
import estilos from "./page.module.css";

interface RespostaIndividual {
  id: number;
  data_referencia: string;
  nota: number;
  comentario: string | null;
  registrado_em: string;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  pergunta: string;
}

interface ResultadoIndividual {
  periodo: { inicio: string; fim: string };
  respostas: RespostaIndividual[];
}

interface OpcaoColaborador {
  id: number;
  matricula: string;
  nome_completo: string;
}

const FUSO_EXIBICAO = "America/Sao_Paulo";

const formatoRegistro = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_EXIBICAO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

interface FiltroConsulta {
  inicio?: string;
  fim?: string;
  colaborador_id?: string;
}

type RespostaConsulta =
  | { ok: true; dados: ResultadoIndividual }
  | { ok: false; erro: string };

// Função pura (sem estado): quem chama decide como aplicar o resultado.
async function consultarIndividual(
  filtro: FiltroConsulta
): Promise<RespostaConsulta> {
  const parametros = new URLSearchParams();
  if (filtro.inicio) parametros.set("inicio", filtro.inicio);
  if (filtro.fim) parametros.set("fim", filtro.fim);
  if (filtro.colaborador_id) {
    parametros.set("colaborador_id", filtro.colaborador_id);
  }
  const consulta = parametros.toString();
  try {
    const resposta = await fetch(
      `/api/clima/individual${consulta ? `?${consulta}` : ""}`
    );
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok) {
      return { ok: true, dados: dados as ResultadoIndividual };
    }
    return {
      ok: false,
      erro: dados.erro ?? "Não foi possível carregar as respostas.",
    };
  } catch {
    return { ok: false, erro: "Falha de conexão. Tente novamente." };
  }
}

export function IndividualCliente() {
  const [resultado, setResultado] = useState<ResultadoIndividual | null>(null);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");

  useEffect(() => {
    let ativo = true;
    (async () => {
      // Lista de colaboradores só para o filtro; se indisponível, a página
      // continua funcionando sem o seletor.
      try {
        const resposta = await fetch("/api/colaboradores");
        if (!resposta.ok) return;
        const dados = await resposta.json().catch(() => ({}));
        if (ativo) setColaboradores(dados.colaboradores ?? []);
      } catch {
        // filtro por colaborador fica indisponível
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const consulta = await consultarIndividual({});
      if (!ativo) return;
      if (consulta.ok) {
        setResultado(consulta.dados);
      } else {
        setErro(consulta.erro);
      }
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function filtrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);
    const consulta = await consultarIndividual({
      inicio: inicio || undefined,
      fim: fim || undefined,
      colaborador_id: colaboradorId || undefined,
    });
    if (consulta.ok) {
      setResultado(consulta.dados);
    } else {
      setErro(consulta.erro);
    }
    setCarregando(false);
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/clima">
          Check-in
        </Link>
        <Link className={acaoCabecalho} href="/clima/painel">
          Painel do clima
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Respostas individuais do clima</h1>
        <p className={estilos.subtitulo}>
          Acesso exclusivo da Diretoria de Pessoas — respostas com autor e
          comentário.
        </p>

        <aside className={estilos.avisoAuditoria}>
          <strong>Leitura registrada em auditoria:</strong> cada consulta a esta
          página grava na trilha de auditoria quem leu as respostas de quem, e
          quando. Este dado não pode ser usado em decisões de desempenho,
          promoção ou desligamento.
        </aside>

        <section className={estilos.cartao}>
          <h2>Filtro</h2>
          <form className={estilos.formulario} onSubmit={filtrar}>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="inicio">
                Início do período
              </label>
              <input
                className={estilos.campo}
                id="inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="fim">
                Fim do período
              </label>
              <input
                className={estilos.campo}
                id="fim"
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="colaborador">
                Colaborador
              </label>
              <select
                className={estilos.campo}
                id="colaborador"
                value={colaboradorId}
                onChange={(e) => setColaboradorId(e.target.value)}
                disabled={colaboradores.length === 0}
              >
                <option value="">Todos</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome_completo} ({colaborador.matricula})
                  </option>
                ))}
              </select>
            </div>
            <button
              className={estilos.botao}
              type="submit"
              disabled={carregando}
            >
              {carregando ? "Consultando…" : "Consultar"}
            </button>
          </form>
        </section>

        <section className={estilos.cartao}>
          <h2>
            Respostas
            {resultado &&
              ` — ${formatarData(resultado.periodo.inicio)} a ${formatarData(resultado.periodo.fim)}`}
          </h2>
          {erro && <p className={estilos.erro}>{erro}</p>}
          {carregando && !resultado ? (
            <p className={estilos.subtitulo}>Carregando…</p>
          ) : (
            resultado && (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Colaborador</th>
                      <th>Pergunta</th>
                      <th>Resposta</th>
                      <th>Comentário</th>
                      <th>Registrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.respostas.map((resposta) => {
                      const nota = resposta.nota as Nota;
                      return (
                        <tr key={resposta.id}>
                          <td>{formatarData(resposta.data_referencia)}</td>
                          <td>
                            {resposta.colaborador_nome}
                            <span className={estilos.matricula}>
                              {" "}
                              ({resposta.matricula})
                            </span>
                          </td>
                          <td>{resposta.pergunta}</td>
                          <td className={estilos.celulaNota}>
                            <span aria-hidden="true">
                              {EMOJIS_NOTA[nota] ?? ""}
                            </span>{" "}
                            {ROTULOS_NOTA[nota] ?? resposta.nota}
                          </td>
                          <td className={estilos.celulaComentario}>
                            {resposta.comentario ?? "—"}
                          </td>
                          <td className={estilos.celulaRegistro}>
                            {formatoRegistro.format(
                              new Date(resposta.registrado_em)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {resultado.respostas.length === 0 && (
                      <tr>
                        <td colSpan={6}>Nenhuma resposta no período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      </main>
    </div>
  );
}
