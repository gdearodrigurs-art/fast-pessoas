"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  ROTULOS_STATUS_ITEM,
  StatusItem,
} from "@/dominios/admissao/esquemas";
import { CartaoProcesso } from "../cartao-processo";
import comum from "../comum.module.css";
import { formatarDataHora } from "../formato";
import { Detalhe, Item } from "../tipos";
import estilos from "./page.module.css";

const CLASSE_STATUS_ITEM: Record<StatusItem, string> = {
  pendente: comum.badgeNeutro,
  concluido: comum.badgeSuccess,
  nao_aplicavel: comum.badgeInfo,
};

export function DetalheAdmissao({ id }: { id: number }) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [itemOcupado, setItemOcupado] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  const [dialogoCancelar, setDialogoCancelar] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/admissoes/${id}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setDetalhe(dados as Detalhe);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o processo.");
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

  async function mudarItem(item: Item, status: StatusItem) {
    setItemOcupado(item.id);
    setErroAcao(null);
    try {
      const resposta = await fetch(`/api/admissoes/${id}/itens/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDetalhe(dados as Detalhe);
      } else {
        setErroAcao(dados.erro ?? "Não foi possível atualizar o item.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setItemOcupado(null);
    }
  }

  async function concluirProcesso() {
    setConcluindo(true);
    setErroAcao(null);
    try {
      const resposta = await fetch(`/api/admissoes/${id}/concluir`, {
        method: "POST",
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDetalhe(dados as Detalhe);
      } else {
        setErroAcao(dados.erro ?? "Não foi possível concluir o processo.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setConcluindo(false);
    }
  }

  async function cancelarProcesso(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCancelando(true);
    setErroCancelamento(null);
    try {
      const resposta = await fetch(`/api/admissoes/${id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivoCancelamento.trim() }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogoCancelar(false);
        setDetalhe(dados as Detalhe);
      } else {
        setErroCancelamento(
          dados.erro ?? "Não foi possível cancelar o processo."
        );
      }
    } catch {
      setErroCancelamento("Falha de conexão. Tente novamente.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/admissoes">
          ← Admissões
        </Link>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !detalhe && <p className={estilos.vazio}>Carregando…</p>}

        {detalhe && (
          <>
            <CartaoProcesso processo={detalhe.processo}>
              {(detalhe.acoes.concluir || detalhe.acoes.cancelar) && (
                <div className={estilos.acoesProcesso}>
                  {detalhe.acoes.cancelar && (
                    <button
                      className={comum.botaoSecundario}
                      type="button"
                      onClick={() => {
                        setMotivoCancelamento("");
                        setErroCancelamento(null);
                        setDialogoCancelar(true);
                      }}
                    >
                      Cancelar processo
                    </button>
                  )}
                  <button
                    className={comum.botaoPrimario}
                    type="button"
                    onClick={concluirProcesso}
                    disabled={!detalhe.acoes.concluir || concluindo}
                  >
                    {concluindo ? "Concluindo…" : "Concluir processo"}
                  </button>
                  {!detalhe.acoes.concluir &&
                    detalhe.processo.obrigatorios_pendentes > 0 && (
                      <span className={estilos.dicaConcluir}>
                        Conclua os {detalhe.processo.obrigatorios_pendentes}{" "}
                        item(ns) obrigatório(s) para liberar a conclusão.
                      </span>
                    )}
                </div>
              )}
              {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            </CartaoProcesso>

            <section className={estilos.bloco}>
              <h2>
                Checklist da admissão (v{detalhe.processo.checklist_versao})
              </h2>
              <p className={estilos.notaFuso}>
                Horários no fuso America/Sao_Paulo.
              </p>
              {detalhe.itens.map((item) => (
                <div
                  key={item.id}
                  className={`${estilos.item} ${
                    item.status !== "pendente" ? estilos.itemResolvido : ""
                  }`}
                >
                  <span className={estilos.ordemItem}>{item.ordem}.</span>
                  <div className={estilos.corpoItem}>
                    <div className={estilos.descricaoItem}>
                      {item.descricao}{" "}
                      {item.obrigatorio ? (
                        <span className={`${comum.badge} ${comum.badgeWarning}`}>
                          obrigatório
                        </span>
                      ) : (
                        <span className={`${comum.badge} ${comum.badgeNeutro}`}>
                          opcional
                        </span>
                      )}{" "}
                      <span
                        className={`${comum.badge} ${CLASSE_STATUS_ITEM[item.status]}`}
                      >
                        {ROTULOS_STATUS_ITEM[item.status]}
                      </span>
                    </div>
                    {item.concluido_por_nome && item.concluido_em && (
                      <div className={estilos.autoriaItem}>
                        {ROTULOS_STATUS_ITEM[item.status]} por{" "}
                        {item.concluido_por_nome} em{" "}
                        {formatarDataHora(item.concluido_em)}
                      </div>
                    )}
                  </div>
                  {detalhe.acoes.tratar_itens && (
                    <div className={estilos.acoesItem}>
                      {item.status === "pendente" ? (
                        <>
                          <button
                            className={estilos.botaoItem}
                            type="button"
                            disabled={itemOcupado === item.id}
                            onClick={() => mudarItem(item, "concluido")}
                          >
                            Concluir
                          </button>
                          <button
                            className={estilos.botaoItem}
                            type="button"
                            disabled={itemOcupado === item.id}
                            onClick={() => mudarItem(item, "nao_aplicavel")}
                          >
                            Não se aplica
                          </button>
                        </>
                      ) : (
                        <button
                          className={estilos.botaoItem}
                          type="button"
                          disabled={itemOcupado === item.id}
                          onClick={() => mudarItem(item, "pendente")}
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      {dialogoCancelar && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Cancelar processo de admissão</h3>
            <p className={comum.subDialogo}>
              O cancelamento fica registrado na auditoria com o motivo.
            </p>
            <form onSubmit={cancelarProcesso}>
              <label className={comum.rotuloCampo} htmlFor="motivo-cancelar">
                Motivo do cancelamento
              </label>
              <textarea
                className={`${comum.campo} ${comum.campoTexto}`}
                id="motivo-cancelar"
                required
                maxLength={4000}
                placeholder="ex.: candidato desistiu antes do início"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
              />
              {erroCancelamento && (
                <p className={comum.erroAcao}>{erroCancelamento}</p>
              )}
              <div className={comum.acoesDialogo}>
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => setDialogoCancelar(false)}
                >
                  Voltar
                </button>
                <button
                  className={comum.botaoPrimario}
                  type="submit"
                  disabled={cancelando || !motivoCancelamento.trim()}
                >
                  {cancelando ? "Cancelando…" : "Confirmar cancelamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
