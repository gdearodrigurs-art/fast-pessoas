"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import {
  avisoAnonimato,
  ROTULOS_ESCALA_1_5,
  TipoPergunta,
} from "@/dominios/pesquisas/esquemas";
import estilos from "../../pesquisas.module.css";

interface Pergunta {
  id: number;
  ordem: number;
  enunciado: string;
  tipo: TipoPergunta;
  opcoes: string[] | null;
  obrigatoria: boolean;
}

interface Formulario {
  pesquisa: {
    id: number;
    titulo: string;
    tipo_rotulo: string;
    descricao: string | null;
    inicio: string;
    fim: string;
    anonima: boolean;
  };
  perguntas: Pergunta[];
  respondida: boolean;
  colaborador_vinculado: boolean;
  unidade: string | null;
  dentro_do_periodo: boolean;
  /** Piso de anonimato vigente — o aviso promete ESTE número, não um fixo. */
  minimo_amostra: number;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const NOTAS_NPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const NOTAS_ESCALA = [1, 2, 3, 4, 5];

export function FormularioResposta({ id }: { id: number }) {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [numeros, setNumeros] = useState<Record<number, number>>({});
  const [textos, setTextos] = useState<Record<number, string>>({});

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/pesquisas/${id}/responder`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setFormulario(dados as Formulario);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível abrir a pesquisa.");
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
  }, [id]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    setEnviando(true);
    setErro(null);
    try {
      const respostas = formulario.perguntas
        .map((pergunta) => {
          if (pergunta.tipo === "escala_1_5" || pergunta.tipo === "nps_0_10") {
            const valor = numeros[pergunta.id];
            return valor === undefined
              ? null
              : { pergunta_id: pergunta.id, valor_numerico: valor };
          }
          const texto = (textos[pergunta.id] ?? "").trim();
          return texto.length === 0
            ? null
            : { pergunta_id: pergunta.id, valor_texto: texto };
        })
        .filter((item) => item !== null);

      if (respostas.length === 0) {
        setErro("Responda ao menos uma pergunta.");
        return;
      }
      const resposta = await fetch(`/api/pesquisas/${id}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível enviar suas respostas.");
        return;
      }
      setEnviado(true);
    } catch {
      setErro("Falha de conexão ao enviar suas respostas.");
    } finally {
      setEnviando(false);
    }
  }

  const bloqueado =
    !formulario ||
    formulario.respondida ||
    !formulario.colaborador_vinculado ||
    !formulario.dentro_do_periodo;

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/pesquisas">
          Pesquisas
        </Link>
      </Cabecalho>
      <main className={estilos.conteudo}>
        <h1>{formulario ? formulario.pesquisa.titulo : "Pesquisa"}</h1>
        {formulario && (
          <p className={estilos.subtitulo}>
            {formulario.pesquisa.tipo_rotulo} · responda até{" "}
            {formatarData(formulario.pesquisa.fim)}
          </p>
        )}

        {carregando && <p className={estilos.vazio}>Carregando…</p>}
        {erro && <p className={estilos.erro}>{erro}</p>}

        {formulario && (
          <>
            {formulario.pesquisa.anonima ? (
              <p className={estilos.avisoAnonimato}>
                {avisoAnonimato(formulario.minimo_amostra)}
                {formulario.unidade
                  ? ` Unidade registrada com a resposta: ${formulario.unidade}.`
                  : ""}
              </p>
            ) : (
              <p className={estilos.aviso}>
                Esta pesquisa foi marcada como não anônima pelo RH. Nesta versão
                o sistema ainda grava a resposta sem vínculo com você — apenas a
                unidade.
              </p>
            )}

            {formulario.pesquisa.descricao && (
              <section className={estilos.cartao}>
                <p className={estilos.vazio}>{formulario.pesquisa.descricao}</p>
              </section>
            )}

            {formulario.respondida && (
              <p className={estilos.aviso}>
                Você já respondeu esta pesquisa. Obrigado!
              </p>
            )}
            {!formulario.colaborador_vinculado && (
              <p className={estilos.aviso}>
                Sua conta não está vinculada a um colaborador — procure o RH.
              </p>
            )}
            {!formulario.dentro_do_periodo && (
              <p className={estilos.aviso}>
                Fora do período de resposta desta pesquisa.
              </p>
            )}

            {enviado ? (
              <section className={estilos.cartao}>
                <h2>Respostas enviadas</h2>
                <p className={estilos.vazio}>
                  Obrigado por participar. Suas respostas entram no resultado
                  agregado — sem ligação com o seu nome.
                </p>
                <p className={estilos.acoesLinha}>
                  <Link className={estilos.botaoDiscreto} href="/pesquisas">
                    Voltar para as pesquisas
                  </Link>
                </p>
              </section>
            ) : (
              <form className={estilos.cartao} onSubmit={enviar}>
                <h2>Questionário</h2>
                <ul className={estilos.listaPerguntas}>
                  {formulario.perguntas.map((pergunta) => (
                    <li key={pergunta.id} className={estilos.itemPergunta}>
                      <span className={estilos.enunciado}>
                        {pergunta.ordem}. {pergunta.enunciado}
                        {pergunta.obrigatoria && (
                          <span className={estilos.obrigatoria}>*</span>
                        )}
                      </span>

                      {pergunta.tipo === "escala_1_5" && (
                        <div className={estilos.escala}>
                          {NOTAS_ESCALA.map((nota) => (
                            <button
                              key={nota}
                              type="button"
                              disabled={bloqueado}
                              className={`${estilos.opcaoEscala} ${
                                numeros[pergunta.id] === nota
                                  ? estilos.opcaoEscalaAtiva
                                  : ""
                              }`}
                              onClick={() =>
                                setNumeros((atual) => ({
                                  ...atual,
                                  [pergunta.id]: nota,
                                }))
                              }
                            >
                              <span className={estilos.opcaoNota}>{nota}</span>
                              <span className={estilos.opcaoRotulo}>
                                {ROTULOS_ESCALA_1_5[nota]}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {pergunta.tipo === "nps_0_10" && (
                        <>
                          <div className={estilos.escala}>
                            {NOTAS_NPS.map((nota) => (
                              <button
                                key={nota}
                                type="button"
                                disabled={bloqueado}
                                className={`${estilos.opcaoEscala} ${
                                  numeros[pergunta.id] === nota
                                    ? estilos.opcaoEscalaAtiva
                                    : ""
                                }`}
                                onClick={() =>
                                  setNumeros((atual) => ({
                                    ...atual,
                                    [pergunta.id]: nota,
                                  }))
                                }
                              >
                                <span className={estilos.opcaoNota}>{nota}</span>
                              </button>
                            ))}
                          </div>
                          <span className={estilos.ajuda}>
                            0 = de jeito nenhum · 10 = com certeza
                          </span>
                        </>
                      )}

                      {pergunta.tipo === "escolha_unica" && (
                        <div className={estilos.opcoesLista}>
                          {(pergunta.opcoes ?? []).map((opcao) => (
                            <label key={opcao} className={estilos.opcaoRadio}>
                              <input
                                type="radio"
                                name={`pergunta_${pergunta.id}`}
                                disabled={bloqueado}
                                checked={textos[pergunta.id] === opcao}
                                onChange={() =>
                                  setTextos((atual) => ({
                                    ...atual,
                                    [pergunta.id]: opcao,
                                  }))
                                }
                              />
                              {opcao}
                            </label>
                          ))}
                        </div>
                      )}

                      {pergunta.tipo === "texto_livre" && (
                        <textarea
                          className={estilos.campo}
                          rows={3}
                          maxLength={2000}
                          disabled={bloqueado}
                          value={textos[pergunta.id] ?? ""}
                          onChange={(e) =>
                            setTextos((atual) => ({
                              ...atual,
                              [pergunta.id]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
                <p className={estilos.acoesLinha}>
                  <button
                    type="submit"
                    className={estilos.botao}
                    disabled={bloqueado || enviando}
                  >
                    {enviando ? "Enviando…" : "Enviar respostas"}
                  </button>
                </p>
                <p className={estilos.notaRodape}>
                  O envio é único: depois de enviar não é possível alterar (é o
                  que garante uma resposta por pessoa sem identificar ninguém).
                </p>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
