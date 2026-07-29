"use client";

import Link from "next/link";
import { ReactNode } from "react";
import {
  ESTADOS_TERMINAIS,
  EstadoProcesso,
  ROTULOS_ESTADO,
  ROTULOS_INICIATIVA,
  ROTULOS_MODALIDADE_AVISO,
  ROTULOS_STATUS_ENTREVISTA,
} from "@/dominios/desligamento/esquemas";
import comum from "./comum.module.css";
import { formatarData, textoPrazo477 } from "./formato";
import { Processo } from "./tipos";

const CLASSE_ESTADO: Record<EstadoProcesso, string> = {
  iniciado: comum.badgeNeutro,
  em_cumprimento: comum.badgeInfo,
  em_acerto: comum.badgeWarning,
  encerrado: comum.badgeSuccess,
  cancelado: comum.badgeDanger,
};

export function CartaoProcesso({
  processo,
  comLinkDetalhe = false,
  children,
}: {
  processo: Processo;
  comLinkDetalhe?: boolean;
  children?: ReactNode;
}) {
  const ativo = !ESTADOS_TERMINAIS.includes(processo.estado);
  const classePrazo =
    processo.dias_ate_477 < 0
      ? comum.badgeDanger
      : processo.dias_ate_477 <= 3
        ? comum.badgeWarning
        : comum.badgeNeutro;
  return (
    <article className={comum.cartao}>
      <div className={comum.topo}>
        <span className={comum.identificador}>
          mat. {processo.colaborador_matricula}
        </span>
        <span className={comum.nome}>{processo.colaborador_nome}</span>
        <span className={`${comum.badge} ${CLASSE_ESTADO[processo.estado]}`}>
          {ROTULOS_ESTADO[processo.estado]}
        </span>
        {ativo && (
          <span className={`${comum.badge} ${classePrazo}`}>
            {textoPrazo477(processo.dias_ate_477)}
          </span>
        )}
        {processo.entrevista_status && (
          <span className={`${comum.badge} ${comum.badgeNeutro}`}>
            entrevista: {ROTULOS_STATUS_ENTREVISTA[processo.entrevista_status]}
          </span>
        )}
      </div>
      <div className={comum.meta}>
        {processo.tipo_nome} ·{" "}
        {ROTULOS_INICIATIVA[processo.iniciativa].toLowerCase()} ·{" "}
        {ROTULOS_MODALIDADE_AVISO[processo.modalidade_aviso].toLowerCase()} ·
        comunicado em {formatarData(processo.data_comunicacao)} · término{" "}
        {processo.data_termino_efetiva
          ? `efetivo ${formatarData(processo.data_termino_efetiva)}`
          : `projetado ${formatarData(processo.data_projetada_termino)}`}
        {ativo && processo.itens_pendentes > 0
          ? ` · ${processo.itens_pendentes} devolução(ões) pendente(s)`
          : ""}
      </div>
      {(children || comLinkDetalhe) && (
        <div className={comum.acoes}>
          {children}
          {comLinkDetalhe && (
            <Link
              className={comum.ligacaoLeve}
              href={`/desligamentos/${processo.id}`}
            >
              detalhe do processo
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
