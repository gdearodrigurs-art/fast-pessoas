import Link from "next/link";
import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { ROTULOS_PAPEL } from "@/dominios/usuarios/esquemas";
import { Cabecalho } from "./cabecalho";
import estilos from "./page.module.css";

interface Permissoes extends Record<string, unknown> {
  demanda_criar: boolean;
  ferias_programar: boolean;
  afastamento_ver: boolean;
  admissao_ver: boolean;
  desligamento_ver: boolean;
  beneficios_acessar: boolean;
  avaliacao_acessar: boolean;
  recrutamento_acessar: boolean;
  folha_ver: boolean;
  sst_ver: boolean;
  clima_responder: boolean;
  clima_agregado_ver: boolean;
  clima_individual_ver: boolean;
  indicador_ver: boolean;
  documento_ver: boolean;
  cargo_administrar: boolean;
  relatorio_ver: boolean;
  usuario_administrar: boolean;
  perfil_administrar: boolean;
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
       sistema.tem_permissao($1, 'ferias.programar')               AS ferias_programar,
       sistema.tem_permissao($1, 'afastamento.ver')                AS afastamento_ver,
       sistema.tem_permissao($1, 'admissao.ver')                   AS admissao_ver,
       sistema.tem_permissao($1, 'desligamento.ver')               AS desligamento_ver,
       (sistema.tem_permissao($1, 'adesao.solicitar')
        OR sistema.tem_permissao($1, 'adesao.gerir')
        OR sistema.tem_permissao($1, 'beneficio.administrar')
        OR sistema.tem_permissao($1, 'beneficio.ver'))             AS beneficios_acessar,
       (sistema.tem_permissao($1, 'avaliacao.responder')
        OR sistema.tem_permissao($1, 'avaliacao.configurar')
        OR sistema.tem_permissao($1, 'avaliacao.decidir')
        OR sistema.tem_permissao($1, 'avaliacao.resultado.ver'))   AS avaliacao_acessar,
       (sistema.tem_permissao($1, 'rs.ver')
        OR sistema.tem_permissao($1, 'rs.requisicao.criar'))       AS recrutamento_acessar,
       sistema.tem_permissao($1, 'folha.ver')                      AS folha_ver,
       sistema.tem_permissao($1, 'sst.ver')                        AS sst_ver,
       sistema.tem_permissao($1, 'clima.responder')                AS clima_responder,
       sistema.tem_permissao($1, 'clima.agregado.ver')             AS clima_agregado_ver,
       sistema.tem_permissao($1, 'clima.resposta.individual.ver')  AS clima_individual_ver,
       sistema.tem_permissao($1, 'indicador.ver')                  AS indicador_ver,
       sistema.tem_permissao($1, 'documento.ver')                  AS documento_ver,
       sistema.tem_permissao($1, 'rh.cargo.administrar')           AS cargo_administrar,
       sistema.tem_permissao($1, 'relatorio.ver')                   AS relatorio_ver,
       sistema.tem_permissao($1, 'usuario.administrar')            AS usuario_administrar,
       sistema.tem_permissao($1, 'perfil.administrar')             AS perfil_administrar`,
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
      href: "/ferias",
      titulo: "Férias",
      descricao: "Períodos aquisitivos, programação e aprovação de férias.",
      mostrar: pode?.ferias_programar ?? false,
    },
    {
      href: "/afastamentos",
      titulo: "Afastamentos",
      descricao: "Afastamentos e licenças, com dado de saúde protegido.",
      mostrar: pode?.afastamento_ver ?? false,
    },
    {
      href: "/sst",
      titulo: "Saúde e segurança",
      descricao: "ASOs, CATs e entregas de EPI com registro de ciência.",
      mostrar: pode?.sst_ver ?? false,
    },
    {
      href: "/recrutamento",
      titulo: "Recrutamento",
      descricao: "Requisições de vaga, kanban de candidatos e ofertas.",
      mostrar: pode?.recrutamento_acessar ?? false,
    },
    {
      href: "/admissoes",
      titulo: "Admissões",
      descricao: "Processos de admissão com checklist até o primeiro dia.",
      mostrar: pode?.admissao_ver ?? false,
    },
    {
      href: "/desligamentos",
      titulo: "Desligamentos",
      descricao: "Condução do desligamento, devoluções e entrevista.",
      mostrar: pode?.desligamento_ver ?? false,
    },
    {
      href: "/beneficios",
      titulo: "Benefícios",
      descricao: "Catálogo de benefícios, adesões e dependentes.",
      mostrar: pode?.beneficios_acessar ?? false,
    },
    {
      href: "/folha",
      titulo: "Folha de pagamento",
      descricao: "Competências, cálculo, conferência e fechamento da folha.",
      mostrar: pode?.folha_ver ?? false,
    },
    {
      href: "/avaliacoes",
      titulo: "Avaliações",
      descricao: "Ciclos de experiência (45/90) e desempenho, líder→liderado.",
      mostrar: pode?.avaliacao_acessar ?? false,
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
      href: "/relatorios",
      titulo: "Relatórios",
      descricao:
        "Aniversariantes, diversidade, composição familiar e headcount.",
      mostrar: pode?.relatorio_ver ?? false,
    },
    {
      href: "/usuarios",
      titulo: "Usuários",
      descricao: "Contas de acesso e papéis do sistema.",
      mostrar: pode?.usuario_administrar ?? false,
    },
    {
      href: "/perfis",
      titulo: "Perfis de acesso",
      descricao: "Quais permissões cada papel tem — composição auditada.",
      mostrar: pode?.perfil_administrar ?? false,
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
