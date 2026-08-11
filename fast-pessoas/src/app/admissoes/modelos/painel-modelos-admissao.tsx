"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  ModeloAdmissaoEntrada,
  TipoVinculoModelo,
  validarModeloAdmissao,
} from "@/dominios/admissao/esquemas";
import estilos from "./page.module.css";

// Espelho do payload de /api/admissoes/modelos (montarPainelModelos no serviço).
interface ItemView {
  ordem: number;
  descricao: string;
  obrigatorio: boolean;
}
interface VersaoView {
  id: number;
  versao: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  itens: ItemView[];
  quantidade_itens: number;
  obrigatorios: number;
}
interface FamiliaView {
  tipo_vinculo: TipoVinculoModelo | null;
  familia: string;
  rotulo: string;
  ativa: VersaoView | null;
  historico: VersaoView[];
}
interface Painel {
  pode: boolean;
  familias: FamiliaView[];
}

interface ItemForm {
  descricao: string;
  obrigatorio: boolean;
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PainelModelosAdmissao() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  // Família em edição (a chave `familia`, ex.: "geral" / "clt"), ou null.
  const [editando, setEditando] = useState<string | null>(null);
  const [itensForm, setItensForm] = useState<ItemForm[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/admissoes/modelos");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setPainel(dados as Painel);
          setErro(null);
        } else {
          setErro(
            (dados as { erro?: string }).erro ??
              "Não foi possível carregar os modelos."
          );
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
  }, [recarga]);

  function abrirEditor(familia: FamiliaView) {
    const base =
      familia.ativa?.itens.map((item) => ({
        descricao: item.descricao,
        obrigatorio: item.obrigatorio,
      })) ?? [];
    setItensForm(base.length ? base : [{ descricao: "", obrigatorio: true }]);
    setEditando(familia.familia);
    setErro(null);
  }

  function fecharEditor() {
    setEditando(null);
    setItensForm([]);
    setErro(null);
  }

  function alterarItem(indice: number, mudanca: Partial<ItemForm>) {
    setItensForm((atual) =>
      atual.map((item, i) => (i === indice ? { ...item, ...mudanca } : item))
    );
  }
  function adicionarItem() {
    setItensForm((atual) => [...atual, { descricao: "", obrigatorio: true }]);
  }
  function removerItem(indice: number) {
    setItensForm((atual) => atual.filter((_, i) => i !== indice));
  }

  async function salvar(familia: FamiliaView) {
    const entrada: ModeloAdmissaoEntrada = {
      tipo_vinculo: familia.tipo_vinculo,
      itens: itensForm.map((item) => ({
        descricao: item.descricao.trim(),
        obrigatorio: item.obrigatorio,
      })),
    };
    const problemas = validarModeloAdmissao(entrada);
    if (problemas.length > 0) {
      setErro(problemas[0]);
      return;
    }
    setSalvando(true);
    try {
      const resposta = await fetch("/api/admissoes/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entrada),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro ?? "Falha ao salvar.");
      }
      fecharEditor();
      setRecarga((n) => n + 1);
    } catch (problema) {
      setErro((problema as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/admissoes">
          Admissões
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Modelos de checklist de admissão</h1>
        <p className={estilos.subtitulo}>
          O checklist da admissão varia por <strong>tipo de vínculo</strong>:
          aprendiz, estagiário, CLT e PJ têm documentos legalmente diferentes. O{" "}
          <strong>Geral</strong> é o fallback — quem admite alguém de um vínculo
          sem modelo próprio cai nele, então a admissão nunca fica sem checklist.
          Salvar cria uma <strong>nova versão ativa</strong> e encerra a anterior;
          o histórico fica registrado. O item extra por processo continua sendo
          adicionado na tela da admissão, não aqui.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !painel && <p className={estilos.vazio}>Carregando…</p>}

        {painel?.familias.map((familia) => {
          const emEdicao = editando === familia.familia;
          return (
            <section className={estilos.cartaoFamilia} key={familia.familia}>
              <div className={estilos.cabecalhoFamilia}>
                <div>
                  <h2>{familia.rotulo}</h2>
                  {familia.ativa ? (
                    <span className={estilos.metaAtiva}>
                      v{familia.ativa.versao} ativa · {familia.ativa.quantidade_itens}{" "}
                      {familia.ativa.quantidade_itens === 1 ? "item" : "itens"} (
                      {familia.ativa.obrigatorios} obrigatório
                      {familia.ativa.obrigatorios === 1 ? "" : "s"}) · desde{" "}
                      {formatarData(familia.ativa.inicio_vigencia)}
                    </span>
                  ) : (
                    <span className={estilos.metaSemModelo}>
                      {familia.familia === "geral"
                        ? "Sem modelo geral — a admissão precisa de ao menos o geral."
                        : "Sem modelo próprio — este vínculo usa o modelo Geral."}
                    </span>
                  )}
                </div>
                {!emEdicao && editando === null && (
                  <button
                    className={estilos.botaoPrimario}
                    type="button"
                    onClick={() => abrirEditor(familia)}
                  >
                    {familia.ativa ? "Nova versão" : "Criar modelo"}
                  </button>
                )}
              </div>

              {/* leitura da versão ativa (quando não está editando) */}
              {!emEdicao && familia.ativa && (
                <ol className={estilos.listaLeitura}>
                  {familia.ativa.itens.map((item) => (
                    <li key={item.ordem}>
                      <span>{item.descricao}</span>
                      {item.obrigatorio ? (
                        <span className={estilos.selo}>obrigatório</span>
                      ) : (
                        <span className={estilos.seloLeve}>opcional</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {/* editor da nova versão */}
              {emEdicao && (
                <div className={estilos.editor}>
                  {itensForm.map((item, indice) => (
                    <div className={estilos.linhaItem} key={indice}>
                      <span className={estilos.ordem}>{indice + 1}</span>
                      <input
                        className={estilos.campoDescricao}
                        placeholder="Documento ou etapa do checklist"
                        value={item.descricao}
                        onChange={(evento) =>
                          alterarItem(indice, { descricao: evento.target.value })
                        }
                      />
                      <label className={estilos.rotuloObrigatorio}>
                        <input
                          type="checkbox"
                          checked={item.obrigatorio}
                          onChange={(evento) =>
                            alterarItem(indice, {
                              obrigatorio: evento.target.checked,
                            })
                          }
                        />
                        obrigatório
                      </label>
                      <button
                        className={estilos.botaoRemover}
                        type="button"
                        onClick={() => removerItem(indice)}
                        aria-label="Remover item"
                        disabled={itensForm.length === 1}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className={estilos.botaoSecundario}
                    type="button"
                    onClick={adicionarItem}
                  >
                    + Adicionar item
                  </button>

                  <div className={estilos.acoesEditor}>
                    <button
                      className={estilos.botaoPrimario}
                      type="button"
                      onClick={() => salvar(familia)}
                      disabled={salvando}
                    >
                      {salvando ? "Salvando…" : "Salvar nova versão"}
                    </button>
                    <button
                      className={estilos.botaoTexto}
                      type="button"
                      onClick={fecharEditor}
                      disabled={salvando}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* histórico das encerradas */}
              {!emEdicao && familia.historico.length > 0 && (
                <details className={estilos.historico}>
                  <summary>
                    Histórico ({familia.historico.length} versão
                    {familia.historico.length === 1 ? "" : "es"} encerrada
                    {familia.historico.length === 1 ? "" : "s"})
                  </summary>
                  <ul>
                    {familia.historico.map((versao) => (
                      <li key={versao.id}>
                        v{versao.versao} · {versao.quantidade_itens} itens ·{" "}
                        {formatarData(versao.inicio_vigencia)}
                        {versao.fim_vigencia
                          ? ` → ${formatarData(versao.fim_vigencia)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
