"use client";

import Link from "next/link";
import { rotuloPapel } from "@/dominios/usuarios/esquemas";
import { BotaoSair } from "./botao-sair";
import { SinoNotificacoes } from "./sino-notificacoes";
import { useIdentidade } from "./sessao-contexto";
import estilos from "./cabecalho.module.css";

/**
 * Cabeçalho compartilhado de todas as páginas autenticadas:
 * marca + **quem está logado** + links do módulo (children) + "Meu portal" +
 * sino + Sair.
 *
 * O nome vive AQUI, e não em cada página: antes só a home o mostrava, passando
 * como `children`, e nas outras 40 telas o mesmo espaço era ocupado pelos links
 * do módulo — a pessoa perdia de vista com qual conta estava navegando.
 *
 * É client component porque lê o contexto de sessão; continua podendo ser usado
 * de server component (o `children` entra como slot, que o App Router permite).
 */
export function Cabecalho({
  children,
  ocultarInicio = false,
  ocultarMeuPortal = false,
}: {
  /** Links extras do módulo (usar a classe `acaoCabecalho` exportada abaixo). */
  children?: React.ReactNode;
  /** Na própria home o link "Início" é redundante. */
  ocultarInicio?: boolean;
  /** Dentro do próprio portal o atalho é redundante. */
  ocultarMeuPortal?: boolean;
}) {
  const identidade = useIdentidade();

  return (
    <header className={estilos.cabecalho}>
      <Link className={estilos.marca} href="/">
        Fast Pessoas
      </Link>
      <nav className={estilos.navegacao}>
        {identidade && (
          <span className={estilos.identidade}>
            {identidade.nome} · {rotuloPapel(identidade.papel)}
          </span>
        )}
        {!ocultarInicio && (
          <Link className={estilos.acao} href="/">
            Início
          </Link>
        )}
        {children}
        {/* Fixo, ao lado do sino, em TODA página autenticada: é a tela que todo
            funcionário usa, e sem chave para conferir aqui — qualquer sessão tem
            direito ao próprio portal (ver /api/portais/colaborador, que resolve
            o colaborador pela sessão e não aceita id por parâmetro). */}
        {!ocultarMeuPortal && (
          <Link className={estilos.acao} href="/portal-colaborador">
            Meu portal
          </Link>
        )}
        <SinoNotificacoes />
        <BotaoSair />
      </nav>
    </header>
  );
}

/** Classe padrão para links de módulo dentro do cabeçalho. */
export const acaoCabecalho = estilos.acao;
