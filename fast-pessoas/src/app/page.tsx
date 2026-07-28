import Link from "next/link";
import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { ROTULOS_PAPEL } from "@/dominios/usuarios/esquemas";
import { Cabecalho } from "./cabecalho";
import estilos from "./page.module.css";

interface Permissoes extends Record<string, unknown> {
  demanda_criar: boolean;
  clima_responder: boolean;
  clima_agregado_ver: boolean;
  clima_individual_ver: boolean;
  indicador_ver: boolean;
  documento_ver: boolean;
  cargo_administrar: boolean;
  usuario_administrar: boolean;
}

export default async function PaginaInicial() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }

  // Flags só de NAVEGAÇÃO (quais cards aparecem): cada página e cada API
  // reconferem a permissão por conta própria em toda chamada.
  const linhas = await consultar<Permissoes>(
    `SELECT
       sistema.tem_permissao($1, 'demanda.criar')                  AS demanda_criar,
       sistema.tem_permissao($1, 'clima.responder')                AS clima_responder,
       sistema.tem_permissao($1, 'clima.agregado.ver')             AS clima_agregado_ver,
       sistema.tem_permissao($1, 'clima.resposta.individual.ver')  AS clima_individual_ver,
       sistema.tem_permissao($1, 'indicador.ver')                  AS indicador_ver,
       sistema.tem_permissao($1, 'documento.ver')                  AS documento_ver,
       sistema.tem_permissao($1, 'rh.cargo.administrar')           AS cargo_administrar,
       sistema.tem_permissao($1, 'usuario.administrar')            AS usuario_administrar`,
    [sessao.usuario_id]
  );
  const pode = linhas[0];

  const modulos = [
    {
      href: "/colaboradores",
      titulo: "Colaboradores",
      descricao: "Ficha, linha do tempo e histórico de cada pessoa.",
      mostrar: true, // escopo (todos | equipe | próprio) resolvido pela página
    },
    {
      href: "/demandas",
      titulo: "Demandas",
      descricao: "Pedidos e aprovações entre você, seu gestor e o DP.",
      mostrar: pode?.demanda_criar ?? false,
    },
    {
      href: "/clima",
      titulo: "Check-in de clima",
      descricao: "Como foi o seu dia? Leva menos de 10 segundos.",
      mostrar: pode?.clima_responder ?? false,
    },
    {
      href: "/clima/painel",
      titulo: "Painel de clima",
      descricao: "Médias agregadas do check-in — sem identificar ninguém.",
      mostrar: pode?.clima_agregado_ver ?? false,
    },
    {
      href: "/clima/individual",
      titulo: "Clima individual",
      descricao: "Respostas individuais — leitura registrada em trilha.",
      mostrar: pode?.clima_individual_ver ?? false,
    },
    {
      href: "/metas",
      titulo: "Metas de indicadores",
      descricao: "Catálogo de indicadores e metas por vigência.",
      mostrar: pode?.indicador_ver ?? false,
    },
    {
      href: "/documentos",
      titulo: "Documentos",
      descricao: "Documentos gerais e do colaborador, com registro de ciência.",
      mostrar: pode?.documento_ver ?? false,
    },
    {
      href: "/cargos",
      titulo: "Cargos e estrutura",
      descricao: "Cargos com CHA, faixas salariais e estabelecimentos.",
      mostrar: pode?.cargo_administrar ?? false,
    },
    {
      href: "/usuarios",
      titulo: "Usuários",
      descricao: "Contas de acesso e papéis do sistema.",
      mostrar: pode?.usuario_administrar ?? false,
    },
  ].filter((modulo) => modulo.mostrar);

  return (
    <div className={estilos.pagina}>
      <Cabecalho ocultarInicio>
        <span className={estilos.usuario}>
          {sessao.nome} · {ROTULOS_PAPEL[sessao.papel]}
        </span>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Bem-vindo ao Fast Pessoas</h1>
        <p className={estilos.subtitulo}>
          Sistema de DP/RH da Fast — escolha por onde começar.
        </p>

        <section className={estilos.grade}>
          {modulos.map((modulo) => (
            <Link
              key={modulo.href}
              className={estilos.cartao}
              href={modulo.href}
            >
              <h2>{modulo.titulo}</h2>
              <p>{modulo.descricao}</p>
            </Link>
          ))}
        </section>

        <h2 className={estilos.tituloSecao}>Sua conta</h2>
        <section className={estilos.grade}>
          <Link className={estilos.cartao} href="/configurar-2fa">
            <h2>Autenticação em duas etapas</h2>
            <p>Configure ou desative o 2FA com aplicativo autenticador.</p>
          </Link>
          <Link className={estilos.cartao} href="/trocar-senha">
            <h2>Trocar senha</h2>
            <p>Atualize a sua senha de acesso.</p>
          </Link>
        </section>
      </main>
    </div>
  );
}
