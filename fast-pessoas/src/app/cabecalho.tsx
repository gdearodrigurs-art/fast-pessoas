import Link from "next/link";
import { BotaoSair } from "./botao-sair";
import { SinoNotificacoes } from "./sino-notificacoes";
import estilos from "./cabecalho.module.css";

/**
 * Cabeçalho compartilhado de todas as páginas autenticadas:
 * marca (link para o início) + links do módulo (children) + Sair.
 * Sem hooks — funciona em server components e dentro de client components.
 */
export function Cabecalho({
  children,
  ocultarInicio = false,
}: {
  /** Links extras do módulo (usar a classe `acaoCabecalho` exportada abaixo). */
  children?: React.ReactNode;
  /** Na própria home o link "Início" é redundante. */
  ocultarInicio?: boolean;
}) {
  return (
    <header className={estilos.cabecalho}>
      <Link className={estilos.marca} href="/">
        Fast Pessoas
      </Link>
      <nav className={estilos.navegacao}>
        {!ocultarInicio && (
          <Link className={estilos.acao} href="/">
            Início
          </Link>
        )}
        {children}
        <SinoNotificacoes />
        <BotaoSair />
      </nav>
    </header>
  );
}

/** Classe padrão para links de módulo dentro do cabeçalho. */
export const acaoCabecalho = estilos.acao;
