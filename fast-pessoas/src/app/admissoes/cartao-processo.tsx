"use client";

import Link from "next/link";
import { ReactNode } from "react";
import {
  DIAS_ALERTA_EXPERIENCIA,
  EstadoProcesso,
  percentualConclusao,
  ROTULOS_ESTADO_PROCESSO,
} from "@/dominios/admissao/esquemas";
import comum from "./comum.module.css";
import { formatarData, textoInicioPrevisto, textoVencimento } from "./formato";
import { Processo } from "./tipos";

const CLASSE_ESTADO: Record<EstadoProcesso, string> = {
  em_preparacao: comum.badgeInfo,
  concluido: comum.badgeSuccess,
  cancelado: comum.badgeNeutro,
};

interface AlertaExperiencia {
  texto: string;
  classe: string;
}

/**
 * Prazo relevante do contrato de experiência (dia 45, depois dia 90) com
 * destaque visual quando faltam DIAS_ALERTA_EXPERIENCIA dias ou menos.
 */
export function alertaExperiencia(processo: Processo): AlertaExperiencia | null {
  if (!processo.contrato_experiencia) return null;
  const { prazo_experiencia_1, prazo_experiencia_2 } = processo;
  const { dias_prazo_1, dias_prazo_2 } = processo;
  if (
    prazo_experiencia_1 === null ||
    prazo_experiencia_2 === null ||
    dias_prazo_1 === null ||
    dias_prazo_2 === null
  ) {
    return null;
  }
  if (dias_prazo_1 >= 0) {
    return {
      texto: `Experiência 1º período (dia 45): ${textoVencimento(dias_prazo_1)} — ${formatarData(prazo_experiencia_1)}`,
      classe: classePorDias(dias_prazo_1),
    };
  }
  if (dias_prazo_2 >= 0) {
    return {
      texto: `Experiência prorrogação (dia 90): ${textoVencimento(dias_prazo_2)} — ${formatarData(prazo_experiencia_2)}`,
      classe: classePorDias(dias_prazo_2),
    };
  }
  return {
    texto: `Experiência encerrada (dia 90 em ${formatarData(prazo_experiencia_2)})`,
    classe: comum.badgeNeutro,
  };
}

function classePorDias(dias: number): string {
  if (dias <= 3) return comum.badgeDanger;
  if (dias <= DIAS_ALERTA_EXPERIENCIA) return comum.badgeWarning;
  return comum.badgeNeutro;
}

export function CartaoProcesso({
  processo,
  comLinkDetalhe = false,
  children,
}: {
  processo: Processo;
  comLinkDetalhe?: boolean;
  children?: ReactNode;
}) {
  const percentual = percentualConclusao(
    processo.total_itens,
    processo.itens_resolvidos
  );
  const alerta = alertaExperiencia(processo);

  return (
    <article className={comum.cartao}>
      <div className={comum.topo}>
        <span className={comum.matricula}>Mat. {processo.matricula}</span>
        <span className={comum.nome}>{processo.colaborador_nome}</span>
        <span className={`${comum.badge} ${CLASSE_ESTADO[processo.estado]}`}>
          {ROTULOS_ESTADO_PROCESSO[processo.estado]}
        </span>
        {alerta && (
          <span className={`${comum.badge} ${alerta.classe}`}>
            {alerta.texto}
          </span>
        )}
        {!processo.contrato_experiencia && (
          <span className={`${comum.badge} ${comum.badgeNeutro}`}>
            Sem contrato de experiência
          </span>
        )}
      </div>
      <p className={comum.meta}>
        Admissão em {formatarData(processo.data_admissao)} · início previsto{" "}
        {formatarData(processo.data_inicio_prevista)}
        {processo.estado === "em_preparacao"
          ? ` (${textoInicioPrevisto(processo.dias_ate_inicio)})`
          : ""}{" "}
        · checklist v{processo.checklist_versao}
      </p>
      <div className={comum.progresso}>
        <div className={comum.trilhaProgresso}>
          <div
            className={`${comum.preenchimentoProgresso} ${
              percentual === 100 ? comum.preenchimentoCompleto : ""
            }`}
            style={{ width: `${percentual}%` }}
          />
        </div>
        <span className={comum.rotuloProgresso}>
          {processo.itens_resolvidos}/{processo.total_itens} itens ·{" "}
          {percentual}%
        </span>
      </div>
      {processo.estado === "em_preparacao" &&
        processo.obrigatorios_pendentes > 0 && (
          <p className={comum.pendenciaObrigatoria}>
            {processo.obrigatorios_pendentes} item(ns) obrigatório(s)
            pendente(s)
          </p>
        )}
      {(children || comLinkDetalhe) && (
        <div className={comum.acoes}>
          {children}
          {comLinkDetalhe && (
            <Link
              className={comum.ligacaoLeve}
              href={`/admissoes/${processo.id}`}
            >
              abrir checklist
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
