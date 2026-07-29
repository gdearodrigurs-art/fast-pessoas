"use client";

import { useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { ESTADOS_TERMINAIS } from "@/dominios/desligamento/esquemas";
import { CartaoProcesso } from "./cartao-processo";
import comum from "./comum.module.css";
import estilos from "./page.module.css";
import { Processo, Visao } from "./tipos";
import { WizardDesligamento } from "./wizard-desligamento";

type Aba = "andamento" | "encerrados";

export function PainelDesligamentos() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("andamento");
  const [wizardAberto, setWizardAberto] = useState(false);

  // Incrementar "versao" força uma nova busca (após iniciar um processo).
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/desligamentos");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os processos.");
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

  function recarregar() {
    setVersao((atual) => atual + 1);
  }

  function ehAtivo(processo: Processo): boolean {
    return !ESTADOS_TERMINAIS.includes(processo.estado);
  }

  const ativos = visao?.processos.filter(ehAtivo) ?? [];
  const encerrados = visao?.processos.filter((p) => !ehAtivo(p)) ?? [];
  const estourados = ativos.filter((p) => p.dias_ate_477 < 0).length;
  const vencendo = ativos.filter(
    (p) => p.dias_ate_477 >= 0 && p.dias_ate_477 <= 3
  ).length;

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Desligamentos</h1>
          {visao?.pode.iniciar && (
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={() => setWizardAberto(true)}
              disabled={!visao.tipos || !visao.colaboradores}
            >
              + Iniciar desligamento
            </button>
          )}
        </div>
        <p className={estilos.subtitulo}>
          Processo auditado ponta a ponta: estabilidades no gate, prazo do art.
          477 monitorado, devoluções e entrevista com desfecho obrigatório.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !visao && <p className={estilos.vazio}>Carregando…</p>}

        {visao && (
          <>
            <div className={estilos.indicadores}>
              <div className={estilos.cardIndicador}>
                <div className={estilos.numeroIndicador}>{ativos.length}</div>
                <div className={estilos.rotuloIndicador}>em andamento</div>
              </div>
              <div
                className={`${estilos.cardIndicador} ${
                  vencendo > 0 ? estilos.indicadorAtencao : ""
                }`}
              >
                <div className={estilos.numeroIndicador}>{vencendo}</div>
                <div className={estilos.rotuloIndicador}>
                  477 em até 3 dias
                </div>
              </div>
              <div
                className={`${estilos.cardIndicador} ${
                  estourados > 0 ? estilos.indicadorAlerta : ""
                }`}
              >
                <div className={estilos.numeroIndicador}>{estourados}</div>
                <div className={estilos.rotuloIndicador}>477 estourado</div>
              </div>
              <div className={estilos.cardIndicador}>
                <div className={estilos.numeroIndicador}>
                  {visao.indicador.percentual === null
                    ? "—"
                    : `${visao.indicador.percentual.toLocaleString("pt-BR")}%`}
                </div>
                <div className={estilos.rotuloIndicador}>
                  entrevistas realizadas ({visao.indicador.realizadas}/
                  {visao.indicador.elegiveis})
                </div>
              </div>
            </div>
            <p className={estilos.notaIndicador}>
              Indicador oficial do setor: % de entrevistas de desligamento
              realizadas nos processos encerrados dos últimos 12 meses — usa
              apenas o status, nunca o conteúdo das respostas.
            </p>

            <div className={estilos.abasPrincipais}>
              {(
                [
                  ["andamento", `Em andamento (${ativos.length})`],
                  ["encerrados", `Encerrados e cancelados (${encerrados.length})`],
                ] as [Aba, string][]
              ).map(([chave, rotulo]) => (
                <button
                  key={chave}
                  className={`${estilos.aba} ${aba === chave ? estilos.abaAtiva : ""}`}
                  type="button"
                  onClick={() => setAba(chave)}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <section className={estilos.area}>
              {(aba === "andamento" ? ativos : encerrados).length === 0 ? (
                <p className={estilos.vazio}>
                  {aba === "andamento"
                    ? "Nenhum processo em andamento."
                    : "Nenhum processo encerrado ou cancelado."}
                </p>
              ) : (
                (aba === "andamento" ? ativos : encerrados).map((processo) => (
                  <CartaoProcesso
                    key={processo.id}
                    processo={processo}
                    comLinkDetalhe
                  />
                ))
              )}
            </section>
          </>
        )}
      </main>

      {wizardAberto && visao?.tipos && visao?.colaboradores && (
        <WizardDesligamento
          tipos={visao.tipos}
          colaboradores={visao.colaboradores}
          aoCriar={() => {
            setWizardAberto(false);
            recarregar();
          }}
          aoFechar={() => setWizardAberto(false)}
        />
      )}
    </div>
  );
}
