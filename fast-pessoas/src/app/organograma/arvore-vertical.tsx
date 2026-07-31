"use client";

import Link from "next/link";
import estilos from "./page.module.css";
import {
  dataBr,
  rotuloLiderados,
  type No,
  type NoPessoa,
} from "./tipos";

// ------------------------------------------------------------------ árvore vertical
// Organograma DE CIMA PARA BAIXO, com conectores desenhados em CSS puro — sem
// biblioteca de grafo, sem SVG, sem medir posição no JavaScript.
//
// A forma sai da própria marcação: cada nível é um <ul> em flex-row e cada
// pessoa é um <li> que empilha [cartão] + [<ul> dos filhos] centralizados. As
// linhas são bordas de ::before/::after (ver .ramo em page.module.css):
//   - o <ul> aninhado desenha o prumo que SAI do cartão do pai;
//   - cada <li> desenha a sua metade da barra horizontal e o prumo que ENTRA
//     no próprio cartão; primeiro e último filho perdem a metade externa.
// Colapso é só não renderizar o <ul> dos filhos — nada de altura animada, e os
// conectores somem junto porque são do próprio nó.
//
// O escopo por papel, os filtros, a busca e as contagens JÁ vêm resolvidos do
// serviço: este arquivo só desenha o que recebeu.

interface Compartilhado {
  recolhidos: Set<string>;
  alternar: (chave: string) => void;
  corDe: (estabelecimentoId: number | null) => string;
}

export function ArvoreVertical({
  raizes,
  ...compartilhado
}: { raizes: NoPessoa[] } & Compartilhado) {
  return (
    <ul className={`${estilos.nivel} ${estilos.nivelRaiz}`}>
      {raizes.map((no) => (
        <Ramo key={no.chave} no={no} {...compartilhado} />
      ))}
    </ul>
  );
}

function Ramo({ no, ...compartilhado }: { no: No } & Compartilhado) {
  const { recolhidos, alternar, corDe } = compartilhado;
  const filhos = no.tipo === "pessoa" ? no.filhos : [];
  const recolhido = filhos.length > 0 && recolhidos.has(no.chave);
  const cor = corDe(no.estabelecimento_id);

  return (
    <li className={estilos.ramo}>
      <article
        className={[
          estilos.cartaoNo,
          no.tipo === "vaga" ? estilos.cartaoVaga : "",
          no.destacado ? estilos.cartaoDestacado : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ borderTopColor: cor }}
      >
        {no.tipo === "pessoa" ? (
          <>
            <Link
              className={estilos.cartaoNome}
              href={`/colaboradores/${no.colaborador_id}`}
            >
              {no.nome}
            </Link>
            <span className={estilos.cartaoCargo}>
              {no.cargo_nome ?? "sem cargo vigente"}
            </span>
            <span
              className={estilos.unidade}
              style={{ color: cor, borderColor: cor }}
            >
              {no.unidade ?? "sem lotação"}
            </span>
            <span className={estilos.contagem}>{rotuloLiderados(no)}</span>
            {(no.status !== "ativo" ||
              no.fora_da_hierarquia ||
              no.gestor_fora_do_quadro) && (
              <span className={estilos.cartaoSelos}>
                {no.status !== "ativo" && (
                  <span className={estilos.selo}>{no.status}</span>
                )}
                {no.fora_da_hierarquia && (
                  <span className={estilos.seloAlerta}>fora da hierarquia</span>
                )}
                {no.gestor_fora_do_quadro && (
                  <span className={estilos.seloAlerta}>gestor fora do quadro</span>
                )}
              </span>
            )}
          </>
        ) : (
          <>
            <span className={estilos.cartaoNomeVaga}>vaga aberta</span>
            <span className={estilos.cartaoCargo}>
              {no.cargo_nome ?? no.titulo}
            </span>
            <span
              className={estilos.unidade}
              style={{ color: cor, borderColor: cor }}
            >
              {no.unidade ?? "sem unidade"}
            </span>
            <span className={estilos.contagem}>
              prazo {dataBr(no.prazo_alvo)}
              {no.status !== "aberta" ? ` · ${no.status}` : ""}
            </span>
          </>
        )}

        {filhos.length > 0 && (
          <button
            aria-expanded={!recolhido}
            aria-label={`${recolhido ? "Expandir" : "Recolher"} o ramo de ${
              no.tipo === "pessoa" ? no.nome : no.titulo
            }`}
            className={estilos.rodapeCartao}
            onClick={() => alternar(no.chave)}
            type="button"
          >
            {recolhido ? `▸ expandir ${filhos.length}` : `▾ recolher ${filhos.length}`}
          </button>
        )}
      </article>

      {filhos.length > 0 && !recolhido && (
        <ul className={`${estilos.nivel} ${estilos.nivelFilho}`}>
          {filhos.map((filho) => (
            <Ramo key={filho.chave} no={filho} {...compartilhado} />
          ))}
        </ul>
      )}
    </li>
  );
}
