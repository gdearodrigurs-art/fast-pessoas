"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  modoDeVisualizacao,
  rotuloDeMime,
} from "@/dominios/documentos/esquemas";
import {
  alturaEstimadaPdf,
  contarPaginasPdf,
} from "@/dominios/documentos/paginas-pdf";
import { chegouAoFim, conteudoRenderizado } from "./rolagem-ciencia";
import estilos from "./page.module.css";

/**
 * A ÚNICA rota que serve o arquivo — "Baixar" e "Visualizar" passam os dois por
 * aqui, de propósito.
 *
 * É em `baixarDocumento()` (src/dominios/documentos/servico.ts) que mora
 * `exigirVisibilidade()` e, para documento sensível, a gravação em
 * `audit.leitura_sensivel`. Ver sem baixar continua sendo LER: abrir um segundo
 * caminho até o conteúdo — uma rota `/visualizar` que devolvesse os bytes com
 * `Content-Disposition: inline` — seria uma leitura sem rastro.
 *
 * O `Content-Disposition: attachment` da rota não atrapalha: ele só governa
 * navegação do navegador. Aqui o conteúdo chega por `fetch()`, e a tela monta a
 * exibição a partir dos bytes.
 */
export function caminhoConteudoDocumento(id: number): string {
  return `/api/documentos/${id}/download`;
}

export interface DocumentoParaVer {
  id: number;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  sensivel: boolean;
}

/**
 * Modo CIÊNCIA (decisão B5, docs/20): o visualizador rastreia a ROLAGEM e o
 * botão de ciência só habilita ao chegar ao fim do documento. O chamador liga
 * o modo quando o documento exige ciência e o usuário está pendente.
 */
export interface ModoCiencia {
  /** Chamado após a ciência registrada com sucesso (dada_em ISO). */
  aoRegistrar: (dadaEm: string) => void;
  /** Chamado após a recusa registrada com sucesso (recusada_em ISO). */
  aoRecusar: (recusadaEm: string) => void;
  /** O usuário já recusou esta versão (pode, ainda assim, dar ciência). */
  jaRecusou: boolean;
}

type Conteudo =
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | { estado: "texto"; texto: string }
  | { estado: "pdf"; url: string; alturaPx: number }
  | { estado: "imagem"; url: string }
  | { estado: "nao_exibivel" };

export function VisualizadorDocumento({
  documento,
  aoFechar,
  ciencia,
}: {
  documento: DocumentoParaVer;
  aoFechar: () => void;
  ciencia?: ModoCiencia;
}) {
  const { id, mime } = documento;

  // O chamador monta este componente com `key={documento.id}`, então mime é
  // constante durante toda a vida da instância — o estado inicial pode sair
  // dele. Word não precisa de busca nenhuma: já se sabe que não será exibido.
  const [conteudo, setConteudo] = useState<Conteudo>(() =>
    modoDeVisualizacao(mime) === "nao_exibivel"
      ? { estado: "nao_exibivel" }
      : { estado: "carregando" }
  );

  const corpoRef = useRef<HTMLDivElement>(null);
  const [leuAteOFim, setLeuAteOFim] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [erroCiencia, setErroCiencia] = useState<string | null>(null);

  // O rastreio da rolagem (B5): a decisão é pura e mora em rolagem-ciencia.ts.
  // Só se mede conteúdo RENDERIZADO — "carregando" e "erro" não têm overflow, e
  // medi-los marcava "leu até o fim" antes de existir documento na tela.
  const verificarFim = useCallback(() => {
    const corpo = corpoRef.current;
    if (!corpo) return;
    if (!conteudoRenderizado(conteudo.estado)) return;
    if (chegouAoFim(corpo)) {
      setLeuAteOFim(true);
    }
  }, [conteudo.estado]);

  // A marca não sobrevive à troca de ESTADO do conteúdo: o "fim" medido num
  // conteúdo não vale para o que entra no lugar dele (padrão "ajustar estado
  // durante o render", react.dev/you-might-not-need-an-effect). Troca de
  // DOCUMENTO nem precisa disso: o chamador remonta com key={documento.id}.
  const [estadoMedido, setEstadoMedido] = useState(conteudo.estado);
  if (estadoMedido !== conteudo.estado) {
    setEstadoMedido(conteudo.estado);
    setLeuAteOFim(false);
  }

  // Conteúdo que coube inteiro sem rolagem também conta como lido até o fim —
  // senão o botão nunca habilitaria num comunicado de três linhas. O timeout
  // deixa o layout assentar (iframe do PDF com a altura estimada aplicada).
  useEffect(() => {
    if (!ciencia || !conteudoRenderizado(conteudo.estado)) return;
    const temporizador = setTimeout(verificarFim, 150);
    return () => clearTimeout(temporizador);
  }, [ciencia, conteudo, verificarFim]);

  useEffect(() => {
    const modo = modoDeVisualizacao(mime);
    if (modo === "nao_exibivel") {
      // Não busca o arquivo: nada seria exibido, e uma leitura que não
      // aconteceu não deve virar linha em audit.leitura_sensivel.
      return;
    }

    let ativo = true;
    let urlObjeto: string | null = null;

    (async () => {
      try {
        const resposta = await fetch(caminhoConteudoDocumento(id));
        if (!resposta.ok) {
          const dados = await resposta.json().catch(() => ({}));
          if (ativo) {
            setConteudo({
              estado: "erro",
              mensagem: dados.erro ?? "Não foi possível abrir o documento.",
            });
          }
          return;
        }
        if (modo === "texto") {
          const texto = await resposta.text();
          if (ativo) setConteudo({ estado: "texto", texto });
          return;
        }
        const bytes = await resposta.arrayBuffer();
        // O tipo vem do metadado guardado no servidor, nunca de palpite do
        // navegador sobre o conteúdo.
        urlObjeto = URL.createObjectURL(new Blob([bytes], { type: mime }));
        if (!ativo) {
          URL.revokeObjectURL(urlObjeto);
          urlObjeto = null;
          return;
        }
        if (modo === "pdf") {
          // O visualizador nativo de PDF engole a rolagem interna do iframe;
          // para o rastreio (B5) funcionar, o iframe ganha a ALTURA ESTIMADA
          // do documento inteiro e a rolagem volta a ser do contêiner de fora.
          const paginas = contarPaginasPdf(new Uint8Array(bytes));
          const largura = corpoRef.current?.clientWidth ?? 800;
          setConteudo({
            estado: "pdf",
            url: urlObjeto,
            alturaPx: alturaEstimadaPdf(paginas, largura),
          });
          return;
        }
        setConteudo({ estado: "imagem", url: urlObjeto });
      } catch {
        if (ativo) {
          setConteudo({
            estado: "erro",
            mensagem: "Falha de conexão. Tente novamente.",
          });
        }
      }
    })();

    return () => {
      ativo = false;
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
    };
  }, [id, mime]);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  async function confirmarCiencia() {
    if (!ciencia) return;
    setErroCiencia(null);
    setRegistrando(true);
    try {
      const resposta = await fetch(`/api/documentos/${id}/ciencia`, {
        method: "POST",
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        ciencia.aoRegistrar(
          (dados.ciencia?.dada_em as string | undefined) ??
            new Date().toISOString()
        );
      } else {
        setErroCiencia(dados.erro ?? "Não foi possível registrar a ciência.");
      }
    } catch {
      setErroCiencia("Falha de conexão. Tente novamente.");
    } finally {
      setRegistrando(false);
    }
  }

  async function recusar() {
    if (!ciencia) return;
    const motivo = window.prompt(
      "Recusar a ciência deste documento?\n\nA recusa fica registrada com data, hora e a versão exata do arquivo, e NÃO desbloqueia a pendência. Motivo (opcional):"
    );
    if (motivo === null) return; // cancelou
    setErroCiencia(null);
    setRegistrando(true);
    try {
      const resposta = await fetch(`/api/documentos/${id}/recusa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        ciencia.aoRecusar(
          (dados.recusa?.recusada_em as string | undefined) ??
            new Date().toISOString()
        );
      } else {
        setErroCiencia(dados.erro ?? "Não foi possível registrar a recusa.");
      }
    } catch {
      setErroCiencia("Falha de conexão. Tente novamente.");
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div
      className={estilos.fundoDialogo}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        className={estilos.dialogoVisualizador}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-visualizador"
      >
        <div className={estilos.cabecalhoDialogo}>
          <div>
            <h3 id="titulo-visualizador">
              {documento.titulo}
              {documento.sensivel && (
                <span className={estilos.etiquetaSensivel}>Sensível</span>
              )}
            </h3>
            <p className={estilos.subDialogo}>
              {documento.nome_arquivo} · {rotuloDeMime(documento.mime)}
              {documento.sensivel &&
                " · a leitura fica registrada em auditoria"}
            </p>
          </div>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={aoFechar}
            aria-label="Fechar visualização"
          >
            Fechar
          </button>
        </div>

        <div
          className={estilos.corpoVisualizador}
          ref={corpoRef}
          onScroll={ciencia ? verificarFim : undefined}
        >
          {conteudo.estado === "carregando" && (
            <p className={estilos.subtitulo}>Abrindo documento…</p>
          )}

          {conteudo.estado === "erro" && (
            <p className={estilos.erro}>{conteudo.mensagem}</p>
          )}

          {conteudo.estado === "texto" && (
            <pre className={estilos.textoVisualizado}>{conteudo.texto}</pre>
          )}

          {conteudo.estado === "pdf" && (
            <iframe
              className={estilos.quadroPdf}
              // Toolbar fora e ajuste à largura: a rolagem fica no contêiner.
              src={`${conteudo.url}#toolbar=0&navpanes=0&view=FitH`}
              style={ciencia ? { height: `${conteudo.alturaPx}px` } : undefined}
              title={`Documento: ${documento.titulo}`}
            />
          )}

          {conteudo.estado === "imagem" && (
            // Blob local vindo da rota do documento — sem otimização de imagem
            // do Next, que exige URL servida.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={estilos.imagemVisualizada}
              src={conteudo.url}
              alt={`Documento: ${documento.titulo}`}
              onLoad={ciencia ? verificarFim : undefined}
            />
          )}

          {conteudo.estado === "nao_exibivel" && (
            <p className={estilos.avisoFormato}>
              {rotuloDeMime(documento.mime)} não abre no navegador. Baixe o
              arquivo para ler no editor de texto.
            </p>
          )}
        </div>

        {ciencia && conteudo.estado !== "nao_exibivel" && (
          <div className={estilos.rodapeCiencia}>
            {erroCiencia && <p className={estilos.erro}>{erroCiencia}</p>}
            <p className={estilos.avisoRolagem}>
              {leuAteOFim
                ? "Você chegou ao fim do documento."
                : "Role o documento até o fim para habilitar a ciência."}
              {ciencia.jaRecusou &&
                " Você recusou esta versão — dar ciência agora regulariza a pendência."}
            </p>
            <div className={estilos.acoesCiencia}>
              {!ciencia.jaRecusou && (
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  disabled={registrando}
                  onClick={recusar}
                >
                  Recusar
                </button>
              )}
              <button
                className={estilos.botao}
                type="button"
                disabled={!leuAteOFim || registrando}
                onClick={confirmarCiencia}
                title={
                  leuAteOFim
                    ? undefined
                    : "O botão habilita ao chegar ao fim do documento"
                }
              >
                {registrando
                  ? "Registrando…"
                  : "Li até o fim — confirmar ciência"}
              </button>
            </div>
          </div>
        )}

        {ciencia && conteudo.estado === "nao_exibivel" && (
          <div className={estilos.rodapeCiencia}>
            <p className={estilos.avisoRolagem}>
              Este formato não abre no navegador e a ciência exige leitura até
              o fim — peça ao DP a publicação em PDF ou texto.
            </p>
          </div>
        )}

        <div className={estilos.acoesDialogo}>
          <a
            className={estilos.botaoLinhaLink}
            href={caminhoConteudoDocumento(documento.id)}
          >
            Baixar arquivo
          </a>
        </div>
      </div>
    </div>
  );
}
