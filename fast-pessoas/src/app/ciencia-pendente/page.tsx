import Link from "next/link";
import {
  ROTULOS_ESTADO_PENDENCIA,
} from "@/dominios/documentos/esquemas";
import { pendenciaBloqueante } from "@/dominios/documentos/servico";
import { exigirSessaoDePaginaParaRegularizacao } from "@/lib/sessao";
import { BotaoRevalidarAcesso } from "./botao-revalidar";
import estilos from "./page.module.css";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * A página do GATE do Código de Conduta (Onda 2 — decisões B1/B4 de docs/20).
 * O proxy manda para cá toda sessão com o claim `ciencia_pendente`; aqui se
 * explica o bloqueio e se aponta a saída: ler e dar ciência em /documentos.
 *
 * O claim pode estar OBSOLETO (liberação dada por terceiro depois do login):
 * nesse caso o banco já não acusa bloqueio, e o componente cliente consulta
 * /api/documentos/pendencias/minhas — que reemite a sessão sem o claim — e
 * leva de volta ao início, sem exigir novo login.
 */
export default async function PaginaCienciaPendente() {
  // Variante SEM a tranca do claim (A8): esta página É o gate — a tranca de
  // exigirSessaoDePagina redirecionaria para cá em laço infinito.
  const sessao = await exigirSessaoDePaginaParaRegularizacao();
  const pendencia = await pendenciaBloqueante(sessao.usuario_id);

  if (!pendencia) {
    return (
      <main className={estilos.pagina}>
        <section className={estilos.cartao}>
          <h1 className={estilos.titulo}>Situação regularizada</h1>
          <p className={estilos.subtitulo}>
            A pendência que travava o seu acesso já foi resolvida. Atualizando a
            sua sessão…
          </p>
          <BotaoRevalidarAcesso automatico />
        </section>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao}>
        <h1 className={estilos.titulo}>Acesso bloqueado</h1>
        <p className={estilos.subtitulo}>
          Há um documento com ciência obrigatória pendente. Até a
          regularização, o sistema fica restrito à página de Documentos — a
          regra vale para todos os perfis, sem exceção.
        </p>

        <div className={estilos.avisoBloqueio}>
          <strong>{pendencia.titulo}</strong>
          {" — "}
          {ROTULOS_ESTADO_PENDENCIA[pendencia.estado]}
          {pendencia.data_limite &&
            ` · prazo até ${formatarData(pendencia.data_limite)}`}
          {pendencia.estado === "recusado" &&
            pendencia.vencida &&
            " (prazo vencido)"}
        </div>

        <p className={estilos.aviso}>
          Para liberar o acesso: leia o documento e registre a ciência. Se você
          não concorda com o conteúdo, é possível registrar a recusa — ela fica
          documentada, mas não destrava o acesso; nesse caso, procure o DP.
        </p>

        <Link className={estilos.botaoLigacao} href="/documentos">
          Ir para Documentos
        </Link>

        <BotaoRevalidarAcesso />
      </section>
    </main>
  );
}
