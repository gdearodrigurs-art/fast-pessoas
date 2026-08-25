"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  AbaDocumento,
  ABAS_DOCUMENTO,
  abaDaCategoria,
  CATEGORIAS_DOCUMENTO,
  CategoriaDocumento,
  EstadoPendencia,
  formatarTamanho,
  ROTULOS_ABA,
  ROTULOS_CATEGORIA,
  ROTULOS_ESTADO_PENDENCIA,
} from "@/dominios/documentos/esquemas";
import estilos from "./page.module.css";
import { QuadroCiclo } from "./quadro-ciclo";
import {
  caminhoConteudoDocumento,
  DocumentoParaVer,
  ModoCiencia,
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
  exige_ciencia: boolean;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  substitui_documento_id: number | null;
  substituido_por_id: number | null;
  minha_recusa_em: string | null;
}

interface ColaboradorOpcao {
  id: number;
  matricula: string;
  nome_completo: string;
}

interface PendenciaMinha {
  documento_id: number;
  titulo: string;
  categoria: string;
  bloqueante: boolean;
  data_limite: string | null;
  vencida: boolean;
  estado: EstadoPendencia;
  bloqueia: boolean;
  recusada_em: string | null;
}

interface TestemunhoPendente {
  ato_id: number;
  documento_id: number;
  documento_titulo: string;
  pessoa_nome: string;
  origem: "recusa" | "prazo_vencido";
  aberto_em: string;
}

interface MinhasPendencias {
  bloqueada: boolean;
  bloqueio: PendenciaMinha | null;
  pendencias: PendenciaMinha[];
  testemunhos: TestemunhoPendente[];
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

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PainelDocumentos({
  podeEnviar,
  podeVerSensivel,
  podeGerirCiclo,
  podeLiberar,
  usuarioId,
}: {
  podeEnviar: boolean;
  podeVerSensivel: boolean;
  podeGerirCiclo: boolean;
  podeLiberar: boolean;
  usuarioId: number;
}) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSensiveis, setMostrarSensiveis] = useState(false);
  const [versaoLista, setVersaoLista] = useState(0);

  const [minhas, setMinhas] = useState<MinhasPendencias | null>(null);
  const [confirmandoTestemunho, setConfirmandoTestemunho] = useState<
    number | null
  >(null);

  const [colaboradores, setColaboradores] = useState<ColaboradorOpcao[]>([]);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<CategoriaDocumento>("comunicado");
  const [colaboradorId, setColaboradorId] = useState("");
  const [sensivel, setSensivel] = useState(false);
  const [exigeCiencia, setExigeCiencia] = useState(false);
  const [bloqueante, setBloqueante] = useState(false);
  const [prazoDias, setPrazoDias] = useState("");
  const [substituiId, setSubstituiId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const [dandoCiencia, setDandoCiencia] = useState<number | null>(null);
  const [aba, setAba] = useState<AbaDocumento>(ABAS_DOCUMENTO[0]);
  const [documentoAberto, setDocumentoAberto] =
    useState<DocumentoParaVer | null>(null);
  const [cienciaDoAberto, setCienciaDoAberto] = useState<ModoCiencia | null>(
    null
  );
  const [cicloAberto, setCicloAberto] = useState<number | null>(null);

  const fecharVisualizador = useCallback(() => {
    setDocumentoAberto(null);
    setCienciaDoAberto(null);
  }, []);

  const carregarMinhas = useCallback(async () => {
    try {
      const resposta = await fetch("/api/documentos/pendencias/minhas");
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setMinhas(dados as MinhasPendencias);
      }
    } catch {
      // O cartão de pendências é informativo — a lista principal segue.
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await carregarMinhas();
    })();
  }, [carregarMinhas, versaoLista]);

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
      } else {
        formulario.append("exige_ciencia", String(exigeCiencia));
        formulario.append("bloqueante", String(exigeCiencia && bloqueante));
        if (exigeCiencia && !bloqueante && prazoDias) {
          formulario.append("prazo_ciencia_dias", prazoDias);
        }
        if (substituiId) {
          formulario.append("substitui_documento_id", substituiId);
        }
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
        setExigeCiencia(false);
        setBloqueante(false);
        setPrazoDias("");
        setSubstituiId("");
        if (campoArquivo.current) {
          campoArquivo.current.value = "";
        }
        const documento = dados.documento as Documento;
        setAvisoEnvio(
          documento.sensivel
            ? "Documento sensível enviado. Ele só aparece na lista de quem tem permissão para dados sensíveis, com o filtro ativado."
            : documento.exige_ciencia
              ? documento.substitui_documento_id !== null
                ? "Versão nova publicada — o ciclo de ciência reabriu para todos os ativos."
                : "Documento publicado no ciclo de ciência — todo o quadro foi avisado."
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

  /** Ciência RÁPIDA — só para documento FORA do ciclo (sem exigência de
   *  leitura até o fim). Documento com exige_ciencia passa pelo visualizador,
   *  que rastreia a rolagem (B5). */
  async function darCienciaRapida(documento: Documento) {
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

  /** Abre o visualizador em MODO CIÊNCIA (B5): rolagem rastreada, botão só
   *  habilita no fim; recusa disponível no mesmo lugar. */
  function abrirParaCiencia(documento: Documento) {
    setDocumentoAberto({
      id: documento.id,
      titulo: documento.titulo,
      nome_arquivo: documento.nome_arquivo,
      mime: documento.mime,
      sensivel: documento.sensivel,
    });
    setCienciaDoAberto({
      jaRecusou: documento.minha_recusa_em !== null,
      aoRegistrar: (dadaEm) => {
        setDocumentos((lista) =>
          lista.map((item) =>
            item.id === documento.id
              ? { ...item, minha_ciencia_em: dadaEm }
              : item
          )
        );
        fecharVisualizador();
        carregarMinhas();
      },
      aoRecusar: (recusadaEm) => {
        setDocumentos((lista) =>
          lista.map((item) =>
            item.id === documento.id
              ? { ...item, minha_recusa_em: recusadaEm }
              : item
          )
        );
        fecharVisualizador();
        carregarMinhas();
      },
    });
  }

  function abrirParaLeitura(documento: Documento) {
    setCienciaDoAberto(null);
    setDocumentoAberto({
      id: documento.id,
      titulo: documento.titulo,
      nome_arquivo: documento.nome_arquivo,
      mime: documento.mime,
      sensivel: documento.sensivel,
    });
  }

  async function confirmarTestemunho(testemunho: TestemunhoPendente) {
    setErro(null);
    setConfirmandoTestemunho(testemunho.ato_id);
    try {
      const resposta = await fetch(
        `/api/documentos/${testemunho.documento_id}/ato-testemunhas`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "confirmar",
            ato_id: testemunho.ato_id,
          }),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        await carregarMinhas();
      } else {
        setErro(dados.erro ?? "Não foi possível confirmar o testemunho.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setConfirmandoTestemunho(null);
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

  // Candidatos a "versão nova de…": documento geral, ponta da cadeia.
  const substituiveis = documentos.filter(
    (documento) =>
      documento.colaborador_id === null &&
      documento.substituido_por_id === null
  );

  const pendenciaDoDocumento = (id: number) =>
    minhas?.pendencias.find((pendencia) => pendencia.documento_id === id);

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Documentos</h1>
        <p className={estilos.subtitulo}>
          Documentos gerais e do colaborador, com registro de ciência.
        </p>

        {minhas && minhas.pendencias.length > 0 && (
          <section
            className={`${estilos.cartaoAviso} ${
              minhas.bloqueada ? estilos.cartaoBloqueio : ""
            }`}
          >
            <h2>
              {minhas.bloqueada
                ? "Pendência que bloqueia o seu acesso"
                : "Documentos aguardando a sua ciência"}
            </h2>
            {minhas.pendencias.map((pendencia) => (
              <p key={pendencia.documento_id}>
                <strong>{pendencia.titulo}</strong>
                {" — "}
                {ROTULOS_ESTADO_PENDENCIA[pendencia.estado]}
                {pendencia.data_limite &&
                  ` · prazo até ${formatarData(pendencia.data_limite)}`}
                {pendencia.bloqueia &&
                  " · o acesso ao sistema fica travado até a regularização"}
              </p>
            ))}
            <p>
              Abra o documento na lista abaixo, leia até o fim e registre a
              ciência.
            </p>
          </section>
        )}

        {minhas && minhas.testemunhos.length > 0 && (
          <section className={estilos.cartaoAviso}>
            <h2>Testemunhos aguardando sua confirmação</h2>
            {minhas.testemunhos.map((testemunho) => (
              <div key={testemunho.ato_id} className={estilos.linhaTestemunho}>
                <p>
                  Ato sobre <strong>{testemunho.pessoa_nome}</strong> —{" "}
                  {testemunho.documento_titulo} (
                  {testemunho.origem === "recusa" ? "recusa" : "prazo vencido"}
                  ), aberto em {formatarDataHora(testemunho.aberto_em)}. A
                  confirmação registra data e a versão exata do documento, com
                  a sua sessão.
                </p>
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  disabled={confirmandoTestemunho === testemunho.ato_id}
                  onClick={() => confirmarTestemunho(testemunho)}
                >
                  {confirmandoTestemunho === testemunho.ato_id
                    ? "Confirmando…"
                    : "Confirmar testemunho"}
                </button>
              </div>
            ))}
          </section>
        )}

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

              {colaboradorId === "" && (
                <fieldset className={estilos.grupoCiclo}>
                  <legend>Ciclo de ciência (documento geral)</legend>
                  <label className={estilos.campoMarcado}>
                    <input
                      type="checkbox"
                      checked={exigeCiencia}
                      onChange={(e) => setExigeCiencia(e.target.checked)}
                    />
                    Exige ciência de todo o quadro (pendência para cada usuário
                    ativo; admitidos futuros herdam)
                  </label>
                  {exigeCiencia && (
                    <>
                      <label className={estilos.campoMarcado}>
                        <input
                          type="checkbox"
                          checked={bloqueante}
                          onChange={(e) => setBloqueante(e.target.checked)}
                        />
                        Bloqueante (Código de Conduta): trava o acesso de todos
                        — inclusive DP, admin e diretoria — até a ciência
                      </label>
                      {!bloqueante && (
                        <div className={estilos.campoGrupo}>
                          <label className={estilos.rotulo} htmlFor="prazo">
                            Prazo para ciência (dias corridos, opcional)
                          </label>
                          <input
                            className={estilos.campo}
                            id="prazo"
                            type="number"
                            min={1}
                            max={365}
                            value={prazoDias}
                            onChange={(e) => setPrazoDias(e.target.value)}
                            placeholder="ex.: 15"
                          />
                        </div>
                      )}
                      <p>
                        Documento no ciclo precisa ser exibível no navegador
                        (PDF, texto ou imagem): a ciência só habilita ao ler
                        até o fim.
                      </p>
                    </>
                  )}
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="substitui">
                      Publicar como versão nova de… (opcional)
                    </label>
                    <select
                      className={estilos.campo}
                      id="substitui"
                      value={substituiId}
                      onChange={(e) => setSubstituiId(e.target.value)}
                    >
                      <option value="">Não substitui nenhum documento</option>
                      {substituiveis.map((documento) => (
                        <option key={documento.id} value={documento.id}>
                          {documento.titulo} (#{documento.id})
                        </option>
                      ))}
                    </select>
                    {substituiId && (
                      <p>
                        A versão anterior fica imutável no acervo; se exigir
                        ciência, a pendência reabre para TODOS os ativos — as
                        ciências antigas ficam intactas.
                      </p>
                    )}
                  </div>
                </fieldset>
              )}

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
                        {documento.exige_ciencia &&
                          (documento.bloqueante ? (
                            <span className={estilos.etiquetaBloqueante}>
                              Bloqueante
                            </span>
                          ) : (
                            <span className={estilos.etiquetaCiclo}>
                              Exige ciência
                            </span>
                          ))}
                        {documento.substituido_por_id !== null && (
                          <span className={estilos.etiquetaSubstituido}>
                            Substituído
                          </span>
                        )}
                        <span className={estilos.detalheArquivo}>
                          {documento.nome_arquivo} ·{" "}
                          {formatarTamanho(documento.tamanho_bytes)}
                          {documento.substitui_documento_id !== null &&
                            ` · versão nova de #${documento.substitui_documento_id}`}
                          {documento.exige_ciencia &&
                            documento.prazo_ciencia_dias !== null &&
                            ` · prazo de ${documento.prazo_ciencia_dias} dia(s)`}
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
                        ) : documento.substituido_por_id !== null ? (
                          <span className={estilos.etiquetaSubstituido}>
                            Versão substituída
                          </span>
                        ) : documento.exige_ciencia ? (
                          <>
                            {documento.minha_recusa_em && (
                              <span className={estilos.etiquetaRecusado}>
                                Recusado em{" "}
                                {formatarDataHora(documento.minha_recusa_em)}
                              </span>
                            )}
                            {pendenciaDoDocumento(documento.id)?.vencida &&
                              !documento.minha_recusa_em && (
                                <span className={estilos.etiquetaVencido}>
                                  Prazo vencido
                                </span>
                              )}
                            <button
                              className={estilos.botaoLinha}
                              type="button"
                              onClick={() => abrirParaCiencia(documento)}
                            >
                              Ler e dar ciência
                            </button>
                          </>
                        ) : (
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={dandoCiencia === documento.id}
                            onClick={() => darCienciaRapida(documento)}
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
                            onClick={() => abrirParaLeitura(documento)}
                          >
                            Visualizar
                          </button>
                          <a
                            className={estilos.botaoLinhaLink}
                            href={caminhoConteudoDocumento(documento.id)}
                          >
                            Baixar
                          </a>
                          {podeGerirCiclo &&
                            documento.exige_ciencia &&
                            documento.colaborador_id === null && (
                              <button
                                className={estilos.botaoLinha}
                                type="button"
                                onClick={() => setCicloAberto(documento.id)}
                              >
                                Ciclo
                              </button>
                            )}
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
          ciencia={cienciaDoAberto ?? undefined}
        />
      )}

      {cicloAberto !== null && (
        <QuadroCiclo
          key={cicloAberto}
          documentoId={cicloAberto}
          usuarioId={usuarioId}
          podeLiberar={podeLiberar}
          aoFechar={() => {
            setCicloAberto(null);
            setVersaoLista((versao) => versao + 1);
          }}
        />
      )}
    </div>
  );
}
