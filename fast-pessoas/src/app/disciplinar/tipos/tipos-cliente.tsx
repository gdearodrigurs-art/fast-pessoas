"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { chaveDeNome } from "@/dominios/disciplinar/esquemas";
import type { CatalogoTipos } from "@/dominios/disciplinar/servico";
import type { TipoMedidaDisciplinar } from "@/dominios/disciplinar/repositorio";
import estilos from "./page.module.css";

export function TiposCliente() {
  const [tipos, setTipos] = useState<TipoMedidaDisciplinar[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  const [novoNome, setNovoNome] = useState("");
  const [novoComPeriodo, setNovoComPeriodo] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/disciplinar/tipos");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setTipos((dados as CatalogoTipos).tipos);
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

  async function chamar(metodo: string, corpo: unknown) {
    setExecutando(true);
    setErroAcao(null);
    try {
      const resposta = await fetch("/api/disciplinar/tipos", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setTipos(dados.tipos as TipoMedidaDisciplinar[]);
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
    if (
      await chamar("POST", {
        nome: novoNome.trim(),
        com_periodo: novoComPeriodo,
      })
    ) {
      setNovoNome("");
      setNovoComPeriodo(false);
    }
  }

  const ativos = tipos?.filter((tipo) => tipo.ativo) ?? [];
  const inativos = tipos?.filter((tipo) => !tipo.ativo) ?? [];
  const previaChave = chaveDeNome(novoNome);

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/">
          ← Início
        </Link>

        <h1>Tipos de medida disciplinar</h1>
        <p className={estilos.subtitulo}>
          O catálogo do que o RH pode registrar como medida: advertência verbal,
          advertência escrita, suspensão — e o que mais a política precisar. Um
          tipo com <b>período</b> abre janela de datas (início e fim), como a
          suspensão; sem período é fato pontual, como a advertência. Tipo que sai
          de uso é <b>inativado</b>, nunca apagado, para a medida já registrada
          continuar mostrando o que era.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {!tipos && !erro && <p className={estilos.vazio}>Carregando…</p>}

        {tipos && (
          <>
            <section className={estilos.bloco}>
              <h2>Em uso no seletor de medidas</h2>
              {ativos.length === 0 ? (
                <p className={estilos.vazio}>
                  Nenhum tipo ativo — o seletor de medidas fica sem opção.
                </p>
              ) : (
                ativos.map((tipo) => (
                  <div key={tipo.id} className={estilos.linha}>
                    <span className={estilos.nome}>{tipo.nome}</span>
                    <span className={estilos.chave}>{tipo.chave}</span>
                    {tipo.com_periodo && (
                      <span className={estilos.tagPeriodo}>abre período</span>
                    )}
                    <span className={estilos.uso}>
                      {tipo.em_uso === 0
                        ? "sem uso ainda"
                        : `${tipo.em_uso} medida(s)`}
                    </span>
                    <button
                      className={estilos.botaoSecundario}
                      type="button"
                      disabled={executando}
                      onClick={() =>
                        void chamar("PATCH", { id: tipo.id, inativo: true })
                      }
                    >
                      Inativar
                    </button>
                  </div>
                ))
              )}

              <form className={estilos.formLinha} onSubmit={criar}>
                <input
                  type="text"
                  maxLength={120}
                  aria-label="Nome do novo tipo"
                  placeholder="Nome do tipo (ex.: Comunicado formal)"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                />
                <label className={estilos.linhaCheck}>
                  <input
                    type="checkbox"
                    checked={novoComPeriodo}
                    onChange={(e) => setNovoComPeriodo(e.target.checked)}
                  />
                  Abre período (início/fim)
                </label>
                {previaChave && (
                  <span className={estilos.previaChave}>
                    chave: {previaChave}
                  </span>
                )}
                <button
                  className={estilos.botaoPrimario}
                  type="submit"
                  disabled={executando || !novoNome.trim()}
                >
                  {executando ? "Salvando…" : "Criar tipo"}
                </button>
              </form>
              {erroAcao && <p className={estilos.erroAcao}>{erroAcao}</p>}
            </section>

            <section className={estilos.bloco}>
              <h2>Fora de uso</h2>
              {inativos.length === 0 ? (
                <p className={estilos.vazio}>Nenhum tipo inativado até agora.</p>
              ) : (
                inativos.map((tipo) => (
                  <div
                    key={tipo.id}
                    className={`${estilos.linha} ${estilos.inativa}`}
                  >
                    <span className={estilos.nome}>{tipo.nome}</span>
                    <span className={estilos.chave}>{tipo.chave}</span>
                    {tipo.com_periodo && (
                      <span className={estilos.tagPeriodo}>abre período</span>
                    )}
                    <span className={estilos.uso}>
                      {tipo.em_uso === 0
                        ? "sem uso"
                        : `${tipo.em_uso} medida(s) no histórico`}
                    </span>
                    <button
                      className={estilos.botaoSecundario}
                      type="button"
                      disabled={executando}
                      onClick={() =>
                        void chamar("PATCH", { id: tipo.id, inativo: false })
                      }
                    >
                      Reativar
                    </button>
                  </div>
                ))
              )}
              <p className={estilos.nota}>
                Inativar tira o tipo do seletor de medidas novas. As medidas já
                registradas com ele continuam valendo e continuam aparecendo com
                este nome — por isso não existe excluir.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
