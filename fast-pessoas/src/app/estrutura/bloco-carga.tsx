"use client";

import { FormEvent, useState } from "react";
import type { ResultadoCarga } from "@/dominios/estrutura/importacao-analise";
import estilos from "./bloco-carga.module.css";

// Bloco de upload da CARGA INICIAL — o mesmo componente nas telas de estrutura
// e de cargos (muda a rota, o layout documentado e o texto). Molde visual e de
// fluxo: o bloco de importação do painel de ponto (painel-ponto.tsx).
//
// O relatório mostra as TRÊS contas do lote: aceitas (criaram algo), já
// existiam (idempotência — reimportar é seguro) e rejeitadas com motivo.

export function BlocoCarga({
  titulo,
  rota,
  colunas,
  explicacao,
  exemplo,
  aoImportar,
}: {
  titulo: string;
  /** POST multipart/JSON — /api/estrutura/importacao ou /api/cargos/importacao. */
  rota: string;
  /** O layout das colunas, exibido como <code>. */
  colunas: string;
  explicacao: string;
  /** Placeholder da área de colar. */
  exemplo: string;
  /** Recarrega as listas do painel pai depois de um lote aceito. */
  aoImportar?: () => void;
}) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [separador, setSeparador] = useState(";");
  const [importando, setImportando] = useState(false);
  const [relatorio, setRelatorio] = useState<ResultadoCarga | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function importar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setImportando(true);
    setErro(null);
    setRelatorio(null);
    try {
      const resposta = await fetch(rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivo: arquivoNome || "colado-na-tela.csv",
          conteudo,
          separador,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(
          (dados as { erro?: string }).erro ?? "Não foi possível importar."
        );
        return;
      }
      setRelatorio(dados as ResultadoCarga);
      aoImportar?.();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>{titulo}</h2>
      <p className={estilos.nota}>
        Colunas (com ou sem cabeçalho): <code>{colunas}</code>. {explicacao}{" "}
        Linha ruim vira rejeição COM MOTIVO e o resto do arquivo entra
        normalmente; o que já existe conta como &quot;já existia&quot; —
        reimportar o mesmo arquivo não duplica nada.
      </p>
      <form className={estilos.formulario} onSubmit={importar}>
        <div className={estilos.campoGrupo}>
          <label className={estilos.rotulo} htmlFor={`${rota}-arquivo`}>
            Arquivo (CSV)
          </label>
          <input
            className={estilos.campo}
            id={`${rota}-arquivo`}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={async (evento) => {
              const arquivo = evento.target.files?.[0];
              if (!arquivo) return;
              setArquivoNome(arquivo.name);
              setConteudo(await arquivo.text());
            }}
          />
        </div>
        <div className={estilos.campoGrupoCurto}>
          <label className={estilos.rotulo} htmlFor={`${rota}-separador`}>
            Separador
          </label>
          <select
            className={estilos.campo}
            id={`${rota}-separador`}
            value={separador}
            onChange={(evento) => setSeparador(evento.target.value)}
          >
            <option value=";">ponto e vírgula</option>
            <option value=",">vírgula</option>
            <option value={"\t"}>tabulação</option>
          </select>
        </div>
        <button
          className={estilos.botao}
          type="submit"
          disabled={importando || conteudo.trim() === ""}
        >
          {importando ? "Importando…" : "Importar"}
        </button>
      </form>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={`${rota}-conteudo`}>
          …ou cole o conteúdo aqui
        </label>
        <textarea
          className={estilos.campo}
          id={`${rota}-conteudo`}
          rows={4}
          value={conteudo}
          onChange={(evento) => setConteudo(evento.target.value)}
          placeholder={exemplo}
        />
      </div>

      {erro && <p className={estilos.erro}>{erro}</p>}

      {relatorio && (
        <div className={estilos.blocoRelatorio}>
          <strong>
            Lote {relatorio.lote_id}: {relatorio.linhas_lidas} linha(s) lida(s)
            — {relatorio.linhas_aceitas} criaram algo,{" "}
            {relatorio.linhas_ja_existiam} já existiam,{" "}
            {relatorio.linhas_rejeitadas} rejeitada(s).
          </strong>
          {relatorio.rejeicoes.length > 0 && (
            <ul className={estilos.rejeicoes}>
              {relatorio.rejeicoes.slice(0, 50).map((rejeicao) => (
                <li key={rejeicao.linha}>
                  linha {rejeicao.linha}: {rejeicao.motivo} —{" "}
                  <code>{rejeicao.conteudo}</code>
                </li>
              ))}
              {relatorio.rejeicoes.length > 50 && (
                <li>
                  … e mais {relatorio.rejeicoes.length - 50} rejeição(ões) no
                  relatório do lote.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
