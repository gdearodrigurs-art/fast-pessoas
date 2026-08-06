"use client";

import { useEffect, useState } from "react";
import {
  modoDeVisualizacao,
  rotuloDeMime,
} from "@/dominios/documentos/esquemas";
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

type Conteudo =
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | { estado: "texto"; texto: string }
  | { estado: "pdf"; url: string }
  | { estado: "imagem"; url: string }
  | { estado: "nao_exibivel" };

export function VisualizadorDocumento({
  documento,
  aoFechar,
}: {
  documento: DocumentoParaVer;
  aoFechar: () => void;
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
        const corpo = await resposta.blob();
        // O tipo vem do metadado guardado no servidor, nunca de palpite do
        // navegador sobre o conteúdo.
        urlObjeto = URL.createObjectURL(new Blob([corpo], { type: mime }));
        if (!ativo) {
          URL.revokeObjectURL(urlObjeto);
          urlObjeto = null;
          return;
        }
        setConteudo({ estado: modo, url: urlObjeto });
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

        <div className={estilos.corpoVisualizador}>
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
              src={conteudo.url}
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
            />
          )}

          {conteudo.estado === "nao_exibivel" && (
            <p className={estilos.avisoFormato}>
              {rotuloDeMime(documento.mime)} não abre no navegador. Baixe o
              arquivo para ler no editor de texto.
            </p>
          )}
        </div>

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
