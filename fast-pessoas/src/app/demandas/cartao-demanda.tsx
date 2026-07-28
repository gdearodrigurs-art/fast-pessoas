"use client";

import Link from "next/link";
import { ReactNode } from "react";
import {
  rotuloStatusExibicao,
  STATUS_ATIVOS,
  StatusDemanda,
} from "@/dominios/demandas/esquemas";
import comum from "./comum.module.css";
import { formatarData, formatarDataHora, textoPrazo } from "./formato";
import { Demanda } from "./tipos";

const CLASSE_STATUS: Record<StatusDemanda, string> = {
  aguardando_aprovacao: comum.badgeWarning,
  aberta: comum.badgeNeutro,
  em_atendimento: comum.badgeInfo,
  concluida: comum.badgeSuccess,
  recusada: comum.badgeDanger,
};

export function numeroDemanda(numero: number): string {
  return `DEM-${String(numero).padStart(4, "0")}`;
}

export function CartaoDemanda({
  demanda,
  comLinkDetalhe = false,
  children,
}: {
  demanda: Demanda;
  comLinkDetalhe?: boolean;
  children?: ReactNode;
}) {
  const ativa = STATUS_ATIVOS.includes(demanda.status);
  const classePrazo =
    demanda.dias_ate_prazo < 0
      ? comum.badgeDanger
      : demanda.dias_ate_prazo === 0
        ? comum.badgeWarning
        : comum.badgeNeutro;
  return (
    <article className={comum.demanda}>
      <div className={comum.topo}>
        <span className={comum.numero}>{numeroDemanda(demanda.numero)}</span>
        <span className={comum.tipo}>{demanda.tipo_nome}</span>
        <span className={`${comum.badge} ${CLASSE_STATUS[demanda.status]}`}>
          {rotuloStatusExibicao(demanda.status, demanda.recusada_na_aprovacao)}
        </span>
        {ativa && (
          <span className={`${comum.badge} ${classePrazo}`}>
            {textoPrazo(demanda.dias_ate_prazo)}
          </span>
        )}
      </div>
      <div className={comum.meta}>
        Solicitante: <b>{demanda.solicitante_nome}</b> · criada em{" "}
        {formatarDataHora(demanda.criado_em)} · prazo{" "}
        {formatarData(demanda.prazo)} (SLA {demanda.sla_dias} dias)
        {demanda.atendente_nome ? ` · atendente: ${demanda.atendente_nome}` : ""}
      </div>
      <div className={comum.descricao}>{demanda.descricao}</div>
      {(children || comLinkDetalhe) && (
        <div className={comum.acoes}>
          {children}
          {comLinkDetalhe && (
            <Link className={comum.ligacaoLeve} href={`/demandas/${demanda.id}`}>
              histórico e comentários
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
