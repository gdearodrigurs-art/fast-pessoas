"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { chaveDeNome } from "@/dominios/desligamento/esquemas";
import comum from "../comum.module.css";
import { CatalogoCategorias, CategoriaDevolucao } from "../tipos";
import estilos from "./page.module.css";

export function PainelCategorias({
  podeAdministrar,
}: {
  podeAdministrar: boolean;
}) {
  const [categorias, setCategorias] = useState<CategoriaDevolucao[] | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  const [novoNome, setNovoNome] = useState("");
  const [renomeandoId, setRenomeandoId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/desligamentos/categorias");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setCategorias((dados as CatalogoCategorias).categorias);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o catálogo.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function chamar(caminho: string, metodo: string, corpo: unknown) {
    setExecutando(true);
    setErroAcao(null);
    try {
      const resposta = await fetch(`/api/desligamentos/categorias${caminho}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setCategorias(dados.categorias as CategoriaDevolucao[]);
        return true;
      }
      setErroAcao(dados.erro ?? "Não foi possível concluir a ação.");
      return false;
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setExecutando(false);
    }
  }

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!novoNome.trim()) return;
    if (await chamar("", "POST", { nome: novoNome.trim() })) {
      setNovoNome("");
    }
  }

  async function salvarNome(id: number) {
    if (!nomeEditado.trim()) return;
    if (await chamar(`/${id}`, "POST", { nome: nomeEditado.trim() })) {
      setRenomeandoId(null);
      setNomeEditado("");
    }
  }

  const previaChave = chaveDeNome(novoNome);

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/desligamentos">
          ← Desligamentos
        </Link>

        <h1>Categorias de devolução</h1>
        <p className={estilos.subtitulo}>
          O que a empresa entrega e cobra de volta no desligamento: carro,
          desktop, notebook, telefone, tablet, EPI, crachá — e o que mais o
          negócio precisar. Esta lista é sua: nada aqui depende de deploy.
          Categoria que sai de circulação é <b>inativada</b>, nunca apagada, para
          que o item já devolvido continue mostrando o que era.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {!categorias && !erro && <p className={estilos.vazio}>Carregando…</p>}

        {categorias && (
          <>
            <section className={estilos.bloco}>
              <h2>Em uso no seletor de itens</h2>
              {categorias.filter((categoria) => categoria.ativa).length ===
              0 ? (
                <p className={estilos.vazio}>
                  Nenhuma categoria ativa — o seletor de itens fica sem opção.
                </p>
              ) : (
                categorias
                  .filter((categoria) => categoria.ativa)
                  .map((categoria) => (
                    <div key={categoria.id} className={estilos.linha}>
                      {renomeandoId === categoria.id ? (
                        <>
                          <input
                            className={estilos.nomeCategoria}
                            aria-label={`Novo nome de ${categoria.nome}`}
                            type="text"
                            maxLength={60}
                            value={nomeEditado}
                            onChange={(e) => setNomeEditado(e.target.value)}
                          />
                          <button
                            className={comum.botaoPrimario}
                            type="button"
                            disabled={executando || !nomeEditado.trim()}
                            onClick={() => void salvarNome(categoria.id)}
                          >
                            Salvar
                          </button>
                          <button
                            className={comum.botaoSecundario}
                            type="button"
                            onClick={() => setRenomeandoId(null)}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={estilos.nomeCategoria}>
                            {categoria.nome}
                          </span>
                          <span className={estilos.chave}>
                            {categoria.chave}
                          </span>
                          <span className={estilos.uso}>
                            {categoria.em_uso === 0
                              ? "sem uso ainda"
                              : `${categoria.em_uso} item(ns)`}
                          </span>
                          {podeAdministrar && (
                            <>
                              <button
                                className={comum.botaoSecundario}
                                type="button"
                                onClick={() => {
                                  setErroAcao(null);
                                  setRenomeandoId(categoria.id);
                                  setNomeEditado(categoria.nome);
                                }}
                              >
                                Renomear
                              </button>
                              <button
                                className={comum.botaoSecundario}
                                type="button"
                                disabled={executando}
                                onClick={() =>
                                  void chamar(`/${categoria.id}`, "PATCH", {
                                    inativa: true,
                                  })
                                }
                              >
                                Inativar
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))
              )}

              {podeAdministrar && (
                <form className={estilos.formLinha} onSubmit={criar}>
                  <input
                    type="text"
                    maxLength={60}
                    aria-label="Nome da nova categoria"
                    placeholder="Nome da categoria (ex.: Empilhadeira)"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                  />
                  {previaChave && (
                    <span className={estilos.previaChave}>
                      chave: {previaChave}
                    </span>
                  )}
                  <button
                    className={comum.botaoPrimario}
                    type="submit"
                    disabled={executando || !novoNome.trim()}
                  >
                    {executando ? "Salvando…" : "Criar categoria"}
                  </button>
                </form>
              )}
              {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            </section>

            {podeAdministrar && (
              <section className={estilos.bloco}>
                <h2>Fora de circulação</h2>
                {categorias.filter((categoria) => !categoria.ativa).length ===
                0 ? (
                  <p className={estilos.vazio}>
                    Nenhuma categoria inativada até agora.
                  </p>
                ) : (
                  categorias
                    .filter((categoria) => !categoria.ativa)
                    .map((categoria) => (
                      <div
                        key={categoria.id}
                        className={`${estilos.linha} ${estilos.inativa}`}
                      >
                        <span className={estilos.nomeCategoria}>
                          {categoria.nome}
                        </span>
                        <span className={estilos.chave}>{categoria.chave}</span>
                        <span className={estilos.uso}>
                          {categoria.em_uso === 0
                            ? "sem uso"
                            : `${categoria.em_uso} item(ns) no histórico`}
                        </span>
                        <button
                          className={comum.botaoSecundario}
                          type="button"
                          disabled={executando}
                          onClick={() =>
                            void chamar(`/${categoria.id}`, "PATCH", {
                              inativa: false,
                            })
                          }
                        >
                          Reativar
                        </button>
                      </div>
                    ))
                )}
                <p className={estilos.nota}>
                  Inativar tira a categoria do seletor de itens novos. Os itens
                  já registrados com ela continuam valendo, continuam editáveis e
                  continuam aparecendo com este nome — por isso não existe
                  excluir.
                </p>
              </section>
            )}

            {!podeAdministrar && (
              <p className={estilos.nota}>
                Você está vendo o catálogo em consulta. Criar, renomear e
                inativar categoria pede a chave
                desligamento.categoria.administrar.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
