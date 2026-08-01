"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { ROTULOS_VINCULO } from "@/dominios/colaboradores/esquemas";
import {
  ROTULOS_NIVEL_APROVACAO,
  ROTULOS_TIPO_MOVIMENTACAO,
  rotuloEstagioCadeia,
  rotuloSituacaoEfeito,
  situacaoDoEfeito,
} from "@/dominios/demandas/esquemas";
import comum from "./comum.module.css";
import { formatarData, formatarDataHora } from "./formato";
import { numeroDemanda } from "./cartao-demanda";
import { CartaoMovimentacao as Dados, Etapa } from "./tipos";

function classeEtapa(status: Etapa["status"]): string {
  if (status === "aprovada") return comum.badgeSuccess;
  if (status === "reprovada") return comum.badgeDanger;
  return comum.badgeWarning;
}

/** A cadeia inteira, na ordem, com quem decidiu o quê e quando. */
export function Cadeia({ etapas }: { etapas: Etapa[] }) {
  if (etapas.length === 0) return null;
  return (
    <ol className={comum.cadeia}>
      {[...etapas]
        .sort((a, b) => a.ordem - b.ordem)
        .map((etapa) => (
          <li key={etapa.id} className={comum.etapa}>
            <span className={comum.numeroEtapa}>{etapa.ordem}</span>
            <span className={comum.nivelEtapa}>
              {ROTULOS_NIVEL_APROVACAO[etapa.nivel]}
            </span>
            <span className={`${comum.badge} ${classeEtapa(etapa.status)}`}>
              {etapa.status === "pendente"
                ? "Pendente"
                : etapa.status === "aprovada"
                  ? "Aprovada"
                  : "Reprovada"}
            </span>
            <span className={comum.detalheEtapa}>
              {etapa.status === "pendente"
                ? etapa.usuario_esperado_nome
                  ? `esperando ${etapa.usuario_esperado_nome}`
                  : "esperando decisão"
                : `${etapa.decisor_nome ?? "—"}${
                    etapa.decidido_em
                      ? ` · ${formatarDataHora(etapa.decidido_em)}`
                      : ""
                  }${etapa.motivo ? ` · ${etapa.motivo}` : ""}`}
            </span>
          </li>
        ))}
    </ol>
  );
}

export function CartaoMovimentacao({
  dados,
  comLinkDetalhe = false,
  children,
}: {
  dados: Dados;
  comLinkDetalhe?: boolean;
  children?: ReactNode;
}) {
  const { demanda, movimentacao, etapas } = dados;
  const estagio = rotuloEstagioCadeia(etapas);
  // Aprovar e aplicar são dois momentos: o selo diz em qual deles o pedido
  // está, e a data pretendida aparece por extenso para não haver dúvida sobre
  // quando a vida da pessoa muda.
  const situacaoEfeito = situacaoDoEfeito({
    status_demanda: demanda.status,
    aplicada_em: movimentacao.aplicada_em,
    efeito_vencido: movimentacao.efeito_vencido,
    etapas,
  });
  const promocao = movimentacao.tipo === "promocao";
  // A transferência entre empresas do grupo (0048) mostra o par de REGISTRO
  // (o CNPJ), não o de cargo nem o de local: é o que muda nela.
  const trocaDeEmpresa = movimentacao.tipo === "transferencia_empresa";
  const rotuloPar = promocao
    ? "Cargo"
    : trocaDeEmpresa
      ? "Registro (empresa)"
      : "Unidade";
  const de = promocao
    ? movimentacao.cargo_origem
    : trocaDeEmpresa
      ? movimentacao.empresa_origem
      : movimentacao.unidade_origem;
  const para = promocao
    ? movimentacao.cargo_destino
    : trocaDeEmpresa
      ? movimentacao.empresa_destino
      : movimentacao.unidade_destino;
  return (
    <article className={comum.demanda}>
      <div className={comum.topo}>
        <span className={comum.numero}>{numeroDemanda(demanda.numero)}</span>
        <span className={comum.tipo}>
          {ROTULOS_TIPO_MOVIMENTACAO[movimentacao.tipo]}
        </span>
        {estagio ? (
          <span className={`${comum.badge} ${comum.badgeWarning}`}>
            {estagio}
          </span>
        ) : (
          <span
            className={`${comum.badge} ${
              situacaoEfeito === "cancelado"
                ? comum.badgeDanger
                : situacaoEfeito === "a_aplicar"
                  ? comum.badgeWarning
                  : comum.badgeSuccess
            }`}
          >
            {situacaoEfeito === "cancelado"
              ? "Reprovada na cadeia"
              : rotuloSituacaoEfeito(
                  situacaoEfeito,
                  formatarData(movimentacao.data_pretendida)
                )}
          </span>
        )}
        {movimentacao.dentro_faixa === false && (
          <span className={`${comum.badge} ${comum.badgeDanger}`}>
            Fora da faixa — com exceção
          </span>
        )}
      </div>
      <div className={comum.meta}>
        Colaborador: <b>{movimentacao.colaborador_nome}</b> · solicitante:{" "}
        {demanda.solicitante_nome} · vigência pretendida{" "}
        {formatarData(movimentacao.data_pretendida)}
        {movimentacao.aplicada_em
          ? ` · aplicada em ${formatarDataHora(movimentacao.aplicada_em)}`
          : ""}
      </div>
      {situacaoEfeito === "programado" && (
        <div className={comum.meta}>
          Nada muda no cadastro até{" "}
          {formatarData(movimentacao.data_pretendida)}: o efeito é aplicado na
          data, pelo próprio pedido.
        </div>
      )}
      {situacaoEfeito === "a_aplicar" && (
        <div className={comum.avisoFaixa}>
          A vigência aprovada já chegou e o efeito ainda não foi aplicado no
          cadastro.
        </div>
      )}
      <div className={comum.descricao}>
        {rotuloPar}: <b>{de ?? "—"}</b> → <b>{para ?? "—"}</b>
        {!promocao && movimentacao.centro_custo_destino
          ? ` · centro de custo ${movimentacao.centro_custo_destino}`
          : ""}
        {trocaDeEmpresa && movimentacao.unidade_destino
          ? ` · lotação ${movimentacao.unidade_destino}`
          : ""}
      </div>
      {trocaDeEmpresa && (
        <div className={comum.descricao}>
          Encerra o vínculo atual e abre outro com a matrícula{" "}
          <b>{movimentacao.matricula_destino ?? "—"}</b>
          {movimentacao.tipo_vinculo_destino
            ? ` (${ROTULOS_VINCULO[movimentacao.tipo_vinculo_destino]})`
            : ""}
          . A pessoa é a mesma: mesmo CPF, mesma conta de acesso e histórico
          preservado.
          {movimentacao.vinculo_destino_matricula
            ? ` Vínculo já aberto: matrícula ${movimentacao.vinculo_destino_matricula}.`
            : ""}
          {/* Quem vai liderar do outro lado é decisão do pedido, e quem aprova
              precisa vê-la — inclusive quando ela é "ninguém ainda". */}
          {movimentacao.gestor_destino_nome ? (
            <>
              {" "}
              Líder na empresa destino: <b>{movimentacao.gestor_destino_nome}</b>
              .
            </>
          ) : (
            <>
              {" "}
              <b>Sem líder definido na empresa destino</b> — o vínculo novo
              nasce sem liderança e o DP precisa designar.
            </>
          )}
        </div>
      )}
      <div className={comum.descricao}>
        Justificativa: {movimentacao.justificativa}
      </div>
      {movimentacao.justificativa_excecao && (
        <div className={comum.avisoFaixa}>
          Exceção de enquadramento: {movimentacao.justificativa_excecao}
        </div>
      )}
      {movimentacao.salario_proposto !== null && (
        <div className={comum.meta}>
          Salário proposto:{" "}
          <b>
            {movimentacao.salario_proposto.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </b>
          {movimentacao.faixa_min !== null && movimentacao.faixa_max !== null
            ? ` · faixa do cargo destino ${movimentacao.faixa_min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} a ${movimentacao.faixa_max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
            : ""}
        </div>
      )}
      <Cadeia etapas={etapas} />
      {(children || comLinkDetalhe) && (
        <div className={comum.acoes}>
          {children}
          {comLinkDetalhe && (
            <Link
              className={comum.ligacaoLeve}
              href={`/demandas/${demanda.id}`}
            >
              abrir o pedido
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
