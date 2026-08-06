"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  AbaDocumento,
  ABAS_DOCUMENTO,
  abaDaCategoria,
  CATEGORIAS_DOCUMENTO,
  CategoriaDocumento,
  formatarTamanho,
  ROTULOS_ABA,
  ROTULOS_CATEGORIA,
} from "@/dominios/documentos/esquemas";
import estilos from "./page.module.css";
import {
  caminhoConteudoDocumento,
  DocumentoParaVer,
  VisualizadorDocumento,
} from "./visualizador-documento";

interface Documento {
  id: number;
  colaborador_id: number | null;
  colaborador_nome: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  enviado_por: string;
  enviado_em: string;
  minha_ciencia_em: string | null;
}

interface ColaboradorOpcao {
  id: number;
  matricula: string;
  nome_completo: string;
}

const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatarDataHora(iso: string): string {
  return formatadorDataHora.format(new Date(iso));
}

export function PainelDocumentos({
  podeEnviar,
  podeVerSensivel,
}: {
  podeEnviar: boolean;
  podeVerSensivel: boolean;
}) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSensiveis, setMostrarSensiveis] = useState(false);
  const [versaoLista, setVersaoLista] = useState(0);

  const [colaboradores, setColaboradores] = useState<ColaboradorOpcao[]>([]);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<CategoriaDocumento>("comunicado");
  const [colaboradorId, setColaboradorId] = useState("");
  const [sensivel, setSensivel] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const [dandoCiencia, setDandoCiencia] = useState<number | null>(null);
  const [aba, setAba] = useState<AbaDocumento>(ABAS_DOCUMENTO[0]);
  const [documentoAberto, setDocumentoAberto] =
    useState<DocumentoParaVer | null>(null);

  const fecharVisualizador = useCallback(() => setDocumentoAberto(null), []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          mostrarSensiveis
            ? "/api/documentos?sensivel=true"
            : "/api/documentos"
        );
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setDocumentos(dados.documentos ?? []);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os documentos.");
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
  }, [mostrarSensiveis, versaoLista]);

  function alternarSensiveis(incluir: boolean) {
    setCarregando(true);
    setMostrarSensiveis(incluir);
  }

  useEffect(() => {
    if (!podeEnviar) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/colaboradores");
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) {
          setColaboradores(dados.colaboradores ?? []);
        }
      } catch {
        // Sem a lista, o envio continua possível como documento geral.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [podeEnviar]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroEnvio(null);
    setAvisoEnvio(null);
    const arquivo = campoArquivo.current?.files?.[0];
    if (!arquivo) {
      setErroEnvio("Selecione o arquivo do documento.");
      return;
    }
    setEnviando(true);
    try {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo);
      formulario.append("titulo", titulo);
      formulario.append("categoria", categoria);
      formulario.append("sensivel", String(sensivel));
      if (colaboradorId) {
        formulario.append("colaborador_id", colaboradorId);
      }
      const resposta = await fetch("/api/documentos", {
        method: "POST",
        body: formulario,
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setTitulo("");
        setCategoria("comunicado");
        setColaboradorId("");
        setSensivel(false);
        if (campoArquivo.current) {
          campoArquivo.current.value = "";
        }
        const documento = dados.documento as Documento;
        setAvisoEnvio(
          documento.sensivel
            ? "Documento sensível enviado. Ele só aparece na lista de quem tem permissão para dados sensíveis, com o filtro ativado."
            : "Documento enviado."
        );
        setVersaoLista((versao) => versao + 1);
      } else {
        setErroEnvio(dados.erro ?? "Não foi possível enviar o documento.");
      }
    } catch {
      setErroEnvio("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function darCiencia(documento: Documento) {
    const confirmado = window.confirm(
      `Confirmar ciência do documento "${documento.titulo}"? A ciência registra data, hora e a versão exata do arquivo, e não pode ser desfeita.`
    );
    if (!confirmado) return;
    setErro(null);
    setDandoCiencia(documento.id);
    try {
      const resposta = await fetch(`/api/documentos/${documento.id}/ciencia`, {
        method: "POST",
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        const dadaEm = dados.ciencia?.dada_em as string | undefined;
        setDocumentos((lista) =>
          lista.map((item) =>
            item.id === documento.id
              ? { ...item, minha_ciencia_em: dadaEm ?? new Date().toISOString() }
              : item
          )
        );
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a ciência.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setDandoCiencia(null);
    }
  }

  // A aba separa CATEGORIA, que é apresentação — não escopo nem autorização.
  // Escopo (documento.ver.todos / vínculos da pessoa) e sensível continuam
  // filtrando no servidor, dentro da consulta de `listarDocumentos`; a aba
  // recorta a lista que já veio filtrada, e por isso não abre nada que a tela
  // não mostrasse antes.
  //
  // E há um motivo forte para NÃO empurrar a aba para o servidor: refazer a
  // busca a cada clique de aba reexecutaria `listarDocumentos(sensivel=true)`,
  // que grava uma linha em `audit.leitura_sensivel` por documento sensível
  // listado. A trilha viraria ruído — uma leitura por clique de aba.
  const documentosDaAba = documentos.filter(
    (documento) => abaDaCategoria(documento.categoria) === aba
  );
  const contagemPorAba = new Map<AbaDocumento, number>(
    ABAS_DOCUMENTO.map((chave) => [chave, 0])
  );
  for (const documento of documentos) {
    const chave = abaDaCategoria(documento.categoria);
    contagemPorAba.set(chave, (contagemPorAba.get(chave) ?? 0) + 1);
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Documentos</h1>
        <p className={estilos.subtitulo}>
          Documentos gerais e do colaborador, com registro de ciência.
        </p>

        {podeEnviar && (
          <section className={estilos.cartao}>
            <h2>Enviar documento</h2>
            <form className={estilos.formulario} onSubmit={enviar}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="arquivo">
                  Arquivo (até 10 MB)
                </label>
                <input
                  className={estilos.campo}
                  id="arquivo"
                  type="file"
                  required
                  ref={campoArquivo}
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="titulo">
                  Título
                </label>
                <input
                  className={estilos.campo}
                  id="titulo"
                  type="text"
                  required
                  minLength={3}
                  maxLength={200}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="categoria">
                  Categoria
                </label>
                <select
                  className={estilos.campo}
                  id="categoria"
                  value={categoria}
                  onChange={(e) =>
                    setCategoria(e.target.value as CategoriaDocumento)
                  }
                >
                  {CATEGORIAS_DOCUMENTO.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {ROTULOS_CATEGORIA[opcao]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="colaborador">
                  Colaborador (opcional)
                </label>
                <select
                  className={estilos.campo}
                  id="colaborador"
                  value={colaboradorId}
                  onChange={(e) => setColaboradorId(e.target.value)}
                >
                  <option value="">Geral (todos)</option>
                  {colaboradores.map((colaborador) => (
                    <option key={colaborador.id} value={colaborador.id}>
                      {colaborador.nome_completo} ({colaborador.matricula})
                    </option>
                  ))}
                </select>
              </div>
              <label className={estilos.campoMarcado}>
                <input
                  type="checkbox"
                  checked={sensivel}
                  onChange={(e) => setSensivel(e.target.checked)}
                />
                Sensível (acesso restrito e leitura auditada)
              </label>
              <button className={estilos.botao} type="submit" disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </form>
            {erroEnvio && <p className={estilos.erro}>{erroEnvio}</p>}
            {avisoEnvio && <p className={estilos.sucesso}>{avisoEnvio}</p>}
          </section>
        )}

        <section className={estilos.cartao}>
          <h2>Acervo</h2>
          {podeVerSensivel && (
            <label className={estilos.campoMarcado}>
              <input
                type="checkbox"
                checked={mostrarSensiveis}
                onChange={(e) => alternarSensiveis(e.target.checked)}
              />
              Incluir documentos sensíveis (a leitura fica registrada em
              auditoria)
            </label>
          )}
          {erro && <p className={estilos.erro}>{erro}</p>}
          <div className={estilos.abasPrincipais} role="tablist">
            {ABAS_DOCUMENTO.map((chave) => (
              <button
                key={chave}
                className={`${estilos.aba} ${aba === chave ? estilos.abaAtiva : ""}`}
                type="button"
                role="tab"
                aria-selected={aba === chave}
                onClick={() => setAba(chave)}
              >
                {ROTULOS_ABA[chave]} ({contagemPorAba.get(chave) ?? 0})
              </button>
            ))}
          </div>
          {carregando ? (
            <p className={estilos.subtitulo}>Carregando…</p>
          ) : (
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Categoria</th>
                    <th>Colaborador</th>
                    <th>Enviado por</th>
                    <th>Enviado em</th>
                    <th>Ciência</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {documentosDaAba.map((documento) => (
                    <tr key={documento.id}>
                      <td>
                        {documento.titulo}
                        {documento.sensivel && (
                          <span className={estilos.etiquetaSensivel}>
                            Sensível
                          </span>
                        )}
                        <span className={estilos.detalheArquivo}>
                          {documento.nome_arquivo} ·{" "}
                          {formatarTamanho(documento.tamanho_bytes)}
                        </span>
                      </td>
                      <td>
                        {ROTULOS_CATEGORIA[
                          documento.categoria as CategoriaDocumento
                        ] ?? documento.categoria}
                      </td>
                      <td>{documento.colaborador_nome ?? "Geral"}</td>
                      <td>{documento.enviado_por}</td>
                      <td>{formatarDataHora(documento.enviado_em)}</td>
                      <td>
                        {documento.minha_ciencia_em ? (
                          <span className={estilos.etiquetaCiente}>
                            Ciência em{" "}
                            {formatarDataHora(documento.minha_ciencia_em)}
                          </span>
                        ) : (
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={dandoCiencia === documento.id}
                            onClick={() => darCiencia(documento)}
                          >
                            {dandoCiencia === documento.id
                              ? "Registrando…"
                              : "Dar ciência"}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className={estilos.acoesLinha}>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            onClick={() =>
                              setDocumentoAberto({
                                id: documento.id,
                                titulo: documento.titulo,
                                nome_arquivo: documento.nome_arquivo,
                                mime: documento.mime,
                                sensivel: documento.sensivel,
                              })
                            }
                          >
                            Visualizar
                          </button>
                          <a
                            className={estilos.botaoLinhaLink}
                            href={caminhoConteudoDocumento(documento.id)}
                          >
                            Baixar
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {documentosDaAba.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        Nenhum documento em {ROTULOS_ABA[aba].toLowerCase()}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className={estilos.notaRodape}>
            Datas exibidas no horário de Brasília (America/Sao_Paulo).
          </p>
        </section>
      </main>

      {documentoAberto && (
        <VisualizadorDocumento
          key={documentoAberto.id}
          documento={documentoAberto}
          aoFechar={fecharVisualizador}
        />
      )}
    </div>
  );
}
