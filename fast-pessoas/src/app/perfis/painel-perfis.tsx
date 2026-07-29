"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import Link from "next/link";
import estilos from "./page.module.css";

interface ChaveCatalogo {
  chave: string;
  descricao: string;
  grupo: string;
  sensivel: boolean;
}

interface PerfilResumo {
  papel: string;
  rotulo: string;
  descricao: string;
  chaves: string[];
  usuarios_total: number;
  usuarios_ativos: number;
  travadas: string[];
  editavel: boolean;
}

interface PainelPerfis {
  catalogo: ChaveCatalogo[];
  grupos: string[];
  perfis: PerfilResumo[];
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export function PainelPerfisTela({ papelDaSessao }: { papelDaSessao: string }) {
  const [painel, setPainel] = useState<PainelPerfis | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async (papelParaAbrir?: string) => {
    try {
      const resposta = await fetch("/api/perfis");
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível carregar os perfis.");
        return;
      }
      const carregado = dados as PainelPerfis;
      setPainel(carregado);
      const alvo =
        papelParaAbrir ??
        carregado.perfis.find((perfil) => perfil.editavel)?.papel ??
        carregado.perfis[0]?.papel ??
        null;
      setSelecionado(alvo);
      const perfil = carregado.perfis.find((item) => item.papel === alvo);
      setMarcadas(new Set(perfil?.chaves ?? []));
    } catch {
      setErro("Falha de conexão. Recarregue a página.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const perfil = useMemo(
    () => painel?.perfis.find((item) => item.papel === selecionado) ?? null,
    [painel, selecionado]
  );

  const concedidas = useMemo(() => {
    if (!perfil) return [];
    const atual = new Set(perfil.chaves);
    return [...marcadas].filter((chave) => !atual.has(chave)).sort();
  }, [perfil, marcadas]);

  const revogadas = useMemo(() => {
    if (!perfil) return [];
    return perfil.chaves.filter((chave) => !marcadas.has(chave));
  }, [perfil, marcadas]);

  const pendente = concedidas.length + revogadas.length > 0;

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ChaveCatalogo[]>();
    for (const item of painel?.catalogo ?? []) {
      const lista = mapa.get(item.grupo);
      if (lista) lista.push(item);
      else mapa.set(item.grupo, [item]);
    }
    return mapa;
  }, [painel]);

  function selecionar(papel: string) {
    if (pendente) {
      setAviso(
        "Há alterações não salvas neste perfil. Salve ou descarte antes de trocar."
      );
      return;
    }
    setAviso(null);
    setErro(null);
    setConfirmando(false);
    setSelecionado(papel);
    const alvo = painel?.perfis.find((item) => item.papel === papel);
    setMarcadas(new Set(alvo?.chaves ?? []));
  }

  function alternar(chave: string) {
    setAviso(null);
    setMarcadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function descartar() {
    setMarcadas(new Set(perfil?.chaves ?? []));
    setConfirmando(false);
    setAviso(null);
    setErro(null);
  }

  async function salvar() {
    if (!perfil) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch(`/api/perfis/${perfil.papel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: [...marcadas] }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível salvar o perfil.");
        return;
      }
      const nConcedidas = (dados.concedidas ?? []).length as number;
      const nRevogadas = (dados.revogadas ?? []).length as number;
      setConfirmando(false);
      setAviso(
        `Perfil ${perfil.rotulo} atualizado: ${plural(nConcedidas, "chave concedida", "chaves concedidas")} e ` +
          `${plural(nRevogadas, "chave revogada", "chaves revogadas")}. ` +
          `Alteração registrada na trilha de auditoria.`
      );
      await carregar(perfil.papel);
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/usuarios">
          Usuários
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Perfis de acesso</h1>
        <p className={estilos.subtitulo}>
          Cada perfil é um conjunto de chaves de permissão. A API confere a
          chave no banco em toda chamada — mudar aqui muda o acesso de todos os
          usuários com aquele papel, na hora. Toda alteração vai para a trilha
          de auditoria.
        </p>

        {carregando ? (
          <p className={estilos.vazio}>Carregando…</p>
        ) : !painel ? (
          <p className={estilos.erro}>{erro ?? "Perfis indisponíveis."}</p>
        ) : (
          <div className={estilos.layout}>
            <aside className={estilos.lista}>
              {painel.perfis.map((item) => (
                <button
                  key={item.papel}
                  type="button"
                  className={
                    item.papel === selecionado
                      ? `${estilos.itemPerfil} ${estilos.itemAtivo}`
                      : estilos.itemPerfil
                  }
                  onClick={() => selecionar(item.papel)}
                >
                  <span className={estilos.itemNome}>
                    {item.rotulo}
                    {item.papel === papelDaSessao && (
                      <span className={estilos.selo}>seu papel</span>
                    )}
                  </span>
                  <span className={estilos.itemMeta}>
                    {plural(item.chaves.length, "chave", "chaves")} ·{" "}
                    {plural(item.usuarios_ativos, "usuário ativo", "usuários ativos")}
                    {item.usuarios_total !== item.usuarios_ativos &&
                      ` (${item.usuarios_total} no total)`}
                  </span>
                </button>
              ))}
            </aside>

            <section className={estilos.detalhe}>
              {!perfil ? (
                <p className={estilos.vazio}>Selecione um perfil.</p>
              ) : (
                <>
                  <div className={estilos.cabecalhoPerfil}>
                    <h2>{perfil.rotulo}</h2>
                    <code className={estilos.codigoPapel}>{perfil.papel}</code>
                  </div>
                  <p className={estilos.descricaoPerfil}>{perfil.descricao}</p>
                  <p className={estilos.impacto}>
                    {perfil.usuarios_ativos === 0
                      ? "Nenhum usuário ativo usa este perfil hoje."
                      : `${plural(perfil.usuarios_ativos, "usuário ativo", "usuários ativos")} ` +
                        `${perfil.usuarios_ativos === 1 ? "usa" : "usam"} este perfil — ` +
                        "qualquer mudança abaixo vale para todos eles."}
                  </p>

                  {!perfil.editavel && (
                    <p className={estilos.avisoBloco}>
                      Papel fora da lista oficial do sistema: exibido para
                      conferência, não editável por aqui.
                    </p>
                  )}

                  {erro && <p className={estilos.erro}>{erro}</p>}
                  {aviso && <p className={estilos.aviso}>{aviso}</p>}

                  {painel.grupos.map((grupo) => {
                    const chaves = porGrupo.get(grupo) ?? [];
                    if (chaves.length === 0) return null;
                    const marcadasNoGrupo = chaves.filter((item) =>
                      marcadas.has(item.chave)
                    ).length;
                    return (
                      <fieldset key={grupo} className={estilos.grupo}>
                        <legend className={estilos.legenda}>
                          {grupo}{" "}
                          <span className={estilos.contagemGrupo}>
                            {marcadasNoGrupo}/{chaves.length}
                          </span>
                        </legend>
                        {chaves.map((item) => {
                          const travada = perfil.travadas.includes(item.chave);
                          const idCaixa = `${perfil.papel}--${item.chave}`;
                          return (
                            <label
                              key={item.chave}
                              className={estilos.linhaChave}
                              htmlFor={idCaixa}
                            >
                              <input
                                id={idCaixa}
                                type="checkbox"
                                checked={marcadas.has(item.chave)}
                                disabled={
                                  travada || !perfil.editavel || salvando
                                }
                                onChange={() => alternar(item.chave)}
                              />
                              <span className={estilos.textoChave}>
                                <span className={estilos.descricaoChave}>
                                  {item.descricao}
                                  {item.sensivel && (
                                    <span className={estilos.seloSensivel}>
                                      dado sensível
                                    </span>
                                  )}
                                  {travada && (
                                    <span className={estilos.seloTravada}>
                                      obrigatória
                                    </span>
                                  )}
                                </span>
                                <code className={estilos.codigoChave}>
                                  {item.chave}
                                </code>
                              </span>
                            </label>
                          );
                        })}
                      </fieldset>
                    );
                  })}
                </>
              )}
            </section>
          </div>
        )}
      </main>

      {perfil && pendente && perfil.editavel && (
        <div className={estilos.barra}>
          <div className={estilos.barraTexto}>
            <strong>{perfil.rotulo}</strong>:{" "}
            {concedidas.length > 0 && (
              <>
                {plural(concedidas.length, "chave a conceder", "chaves a conceder")}
              </>
            )}
            {concedidas.length > 0 && revogadas.length > 0 && " · "}
            {revogadas.length > 0 && (
              <>
                {plural(revogadas.length, "chave a revogar", "chaves a revogar")}
              </>
            )}
            {confirmando && (
              <div className={estilos.confirmacao}>
                {perfil.usuarios_ativos > 0
                  ? `Confirma? Isto muda agora o acesso de ${plural(
                      perfil.usuarios_ativos,
                      "usuário ativo",
                      "usuários ativos"
                    )} com o papel ${perfil.rotulo}.`
                  : "Confirma? Nenhum usuário ativo usa este perfil hoje, mas a composição passa a valer para quem receber o papel."}
                {revogadas.length > 0 && (
                  <div className={estilos.listaRevogadas}>
                    A revogar: {revogadas.join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={estilos.barraAcoes}>
            <button
              type="button"
              className={estilos.botaoSecundario}
              onClick={descartar}
              disabled={salvando}
            >
              Descartar
            </button>
            {confirmando ? (
              <button
                type="button"
                className={estilos.botao}
                onClick={salvar}
                disabled={salvando}
              >
                {salvando ? "Salvando…" : "Confirmar e salvar"}
              </button>
            ) : (
              <button
                type="button"
                className={estilos.botao}
                onClick={() => setConfirmando(true)}
                disabled={salvando}
              >
                Salvar alterações
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
