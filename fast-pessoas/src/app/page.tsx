import { redirect } from "next/navigation";
import { lerSessao } from "../lib/sessao";
import { BotaoSair } from "./botao-sair";
import estilos from "./page.module.css";

const ROTULO_PAPEL: Record<string, string> = {
  funcionario: "Funcionário",
  gestor: "Gestor",
  rh: "RH",
  dp: "Departamento Pessoal",
  diretoria: "Diretoria de Pessoas",
  admin: "Administrador",
};

export default async function PaginaInicial() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <span className={estilos.marca}>Fast Pessoas</span>
        <div className={estilos.usuario}>
          <span>
            {sessao.nome} · {ROTULO_PAPEL[sessao.papel] ?? sessao.papel}
          </span>
          <a className={estilos.acao} href="/trocar-senha">
            Trocar senha
          </a>
          <BotaoSair />
        </div>
      </header>

      <main className={estilos.conteudo}>
        <h1>Bem-vindo ao Fast Pessoas</h1>
        <p className={estilos.subtitulo}>
          Sistema de DP/RH da Fast — em construção, entregue por etapas.
        </p>

        <section className={estilos.grade}>
          <div className={estilos.cartao}>
            <h2>Ficha do colaborador</h2>
            <p>Cadastro e linha do tempo de cada pessoa.</p>
            <span className={estilos.etiqueta}>em desenvolvimento</span>
          </div>
          <div className={estilos.cartao}>
            <h2>Solicitações</h2>
            <p>Pedidos e aprovações entre funcionário e DP.</p>
            <span className={estilos.etiqueta}>em desenvolvimento</span>
          </div>
          <div className={estilos.cartao}>
            <h2>Check-in diário</h2>
            <p>Como você está se sentindo hoje?</p>
            <span className={estilos.etiqueta}>em desenvolvimento</span>
          </div>
        </section>
      </main>
    </div>
  );
}
