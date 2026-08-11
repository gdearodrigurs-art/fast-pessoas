import Link from "next/link";
import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { Cabecalho } from "./cabecalho";
import estilos from "./page.module.css";

interface Permissoes extends Record<string, unknown> {
  demanda_criar: boolean;
  ferias_programar: boolean;
  afastamento_ver: boolean;
  admissao_ver: boolean;
  admissao_modelo_administrar: boolean;
  desligamento_ver: boolean;
  beneficios_acessar: boolean;
  avaliacao_acessar: boolean;
  recrutamento_acessar: boolean;
  ponto_proprio: boolean;
  ponto_administrar: boolean;
  folha_ver: boolean;
  sst_ver: boolean;
  clima_responder: boolean;
  clima_agregado_ver: boolean;
  clima_individual_ver: boolean;
  pesquisas_acessar: boolean;
  indicador_ver: boolean;
  documento_ver: boolean;
  colaborador_ver: boolean;
  colaborador_ver_todos: boolean;
  cargo_administrar: boolean;
  estrutura_administrar: boolean;
  relatorio_ver: boolean;
  painel_executivo_ver: boolean;
  usuario_administrar: boolean;
  perfil_administrar: boolean;
  lidera_alguem: boolean;
}

interface Cartao {
  href: string;
  titulo: string;
  descricao: string;
  mostrar: boolean;
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
       sistema.tem_permissao($1, 'admissao.modelo.administrar')    AS admissao_modelo_administrar,
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
       -- Espelho do PRÓPRIO ponto é direito do trabalhador (Portaria 671
       -- art. 79): a chave está em todo papel, logo o card aparece para todos.
       sistema.tem_permissao($1, 'ponto.ver.proprio')              AS ponto_proprio,
       sistema.tem_permissao($1, 'ponto.administrar')              AS ponto_administrar,
       sistema.tem_permissao($1, 'folha.ver')                      AS folha_ver,
       sistema.tem_permissao($1, 'sst.ver')                        AS sst_ver,
       sistema.tem_permissao($1, 'clima.responder')                AS clima_responder,
       sistema.tem_permissao($1, 'clima.agregado.ver')             AS clima_agregado_ver,
       sistema.tem_permissao($1, 'clima.resposta.individual.ver')  AS clima_individual_ver,
       -- Espelha a guarda de /pesquisas (exigirAlgumaChavePesquisa): a tela
       -- serve quatro públicos. Hoje todo papel com resultado.ver ou
       -- plano.gerir também tem responder, então as quatro chaves equivalem a
       -- "responder OR administrar"; as quatro estão aqui para que um perfil
       -- recomposto em /perfis não ganhe acesso à tela sem ganhar o card.
       (sistema.tem_permissao($1, 'pesquisa.responder')
        OR sistema.tem_permissao($1, 'pesquisa.administrar')
        OR sistema.tem_permissao($1, 'pesquisa.resultado.ver')
        OR sistema.tem_permissao($1, 'pesquisa.plano.gerir'))      AS pesquisas_acessar,
       sistema.tem_permissao($1, 'indicador.ver')                  AS indicador_ver,
       sistema.tem_permissao($1, 'documento.ver')                  AS documento_ver,
       sistema.tem_permissao($1, 'rh.colaborador.ver')             AS colaborador_ver,
       sistema.tem_permissao($1, 'rh.colaborador.ver.todos')       AS colaborador_ver_todos,
       sistema.tem_permissao($1, 'rh.cargo.administrar')           AS cargo_administrar,
       -- Estrutura do grupo: basta UMA das três chaves para a tela ter conteúdo
       -- (cada seção se mostra pela sua própria chave).
       (sistema.tem_permissao($1, 'rh.empresa.administrar')
        OR sistema.tem_permissao($1, 'rh.centro_custo.administrar')
        OR sistema.tem_permissao($1, 'rh.estabelecimento.administrar'))
                                                                   AS estrutura_administrar,
       sistema.tem_permissao($1, 'relatorio.ver')                   AS relatorio_ver,
       sistema.tem_permissao($1, 'painel.executivo.ver')            AS painel_executivo_ver,
       sistema.tem_permissao($1, 'usuario.administrar')            AS usuario_administrar,
       sistema.tem_permissao($1, 'perfil.administrar')             AS perfil_administrar,
       -- Não é permissão: é FATO de estrutura. Mesmo fragmento de vigência do
       -- alcance em todo o sistema (rh.relacao_gestor com fim_vigencia NULL e
       -- início já começado) — ver EQUIPE_VIGENTE em dominios/portais.
       EXISTS (
         SELECT 1
           FROM rh.relacao_gestor rg
           JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
          WHERE g.usuario_id = $1
            AND rg.fim_vigencia IS NULL
            AND rg.inicio_vigencia <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
       )                                                           AS lidera_alguem`,
    [sessao.usuario_id]
  );
  const pode = linhas[0];

  // Alcance de empresa inteira sobre a ficha alheia — pela CHAVE, nunca pelo
  // nome do papel (mesma régua de colaboradores/servico.resolverEscopo e do
  // seletor de gestor do portal; ver migration 0039). Serve só para decidir se
  // o card do portal do gestor aparece.
  const escopoAmplo = pode?.colaborador_ver_todos ?? false;

  // ------------------------------------------------------------------ seções
  // A home passou de 6 para 24 cards ao longo das ondas; em lista única virou
  // rolagem. O agrupamento é por PONTO DE VISTA de quem abre: primeiro o que a
  // pessoa resolve sozinha, depois a equipe, depois a operação de DP/RH, depois
  // a leitura de gestão e por fim a administração do sistema. Seção sem
  // nenhum card visível não é renderizada — o funcionário vê duas seções.
  const secoes: { titulo: string; cartoes: Cartao[] }[] = [
    {
      titulo: "Meu dia",
      cartoes: [
        {
          href: "/portal-colaborador",
          titulo: "Meu portal",
          descricao:
            "Seus dados, férias, solicitações, benefícios e documentos num só lugar.",
          // Sem chave: toda sessão autenticada tem direito ao PRÓPRIO portal,
          // como já tem direito à própria ficha. A tela e a API resolvem o resto.
          mostrar: true,
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
          href: "/clima",
          titulo: "Check-in de clima",
          descricao: "Como foi o seu dia? Leva menos de 10 segundos.",
          mostrar: pode?.clima_responder ?? false,
        },
        {
          href: "/pesquisas",
          titulo: "Pesquisas de clima",
          descricao:
            "Pesquisa anual, pulse e eNPS — resposta anônima e plano de ação.",
          mostrar: pode?.pesquisas_acessar ?? false,
        },
        {
          href: "/beneficios",
          titulo: "Benefícios",
          descricao: "Adesões, dependentes e catálogo de benefícios.",
          // Fica em "Meu dia", e não em "Gestão de pessoas", porque a chave que
          // abre o card é `adesao.solicitar` — que TODO papel tem: a porta da
          // tela é pedir a própria adesão. Quem também tem `adesao.gerir` /
          // `beneficio.administrar` encontra a fila do DP na mesma tela.
          mostrar: pode?.beneficios_acessar ?? false,
        },
        {
          href: "/meu-ponto",
          titulo: "Ponto e banco de horas",
          descricao:
            "Seu espelho do mês, saldo do banco de horas e horas extras apuradas.",
          // Chave `ponto.ver.proprio`, que TODO papel tem: o card mora em "Meu
          // dia" porque a porta é o próprio espelho. Quem também administra o
          // ponto encontra a fila do DP no card "Ponto (DP)".
          mostrar: pode?.ponto_proprio ?? false,
        },
        {
          href: "/documentos",
          titulo: "Documentos",
          descricao:
            "Documentos gerais e do colaborador, com registro de ciência.",
          mostrar: pode?.documento_ver ?? false,
        },
      ],
    },
    {
      titulo: "Minha equipe",
      cartoes: [
        {
          href: "/portal-gestor",
          titulo: "Portal do gestor",
          descricao:
            "Equipe, férias, avaliações, pendências, turnover e alertas num só lugar.",
          // Chave da porta da tela e da rota (rh.colaborador.ver) MAIS a
          // condição de ter equipe: para o papel gestor sem liderado vigente o
          // portal abriria vazio, e card que abre tela vazia é ruído. Quem tem
          // escopo amplo (DP/RH/diretoria/T&D) mantém o card porque a tela lhe
          // dá o seletor de gestor. Cada bloco reconfere a sua chave.
          mostrar:
            (pode?.colaborador_ver ?? false) &&
            (escopoAmplo || (pode?.lidera_alguem ?? false)),
        },
        {
          href: "/organograma",
          titulo: "Organograma",
          descricao:
            "Quem se reporta a quem, com headcount aprovado e vagas abertas.",
          // Sem chave, como a rota: o alcance vai de "empresa toda" a "só a
          // minha corrente até a diretoria" e é resolvido em /api/organograma.
          mostrar: true,
        },
        {
          href: "/colaboradores",
          titulo: "Colaboradores",
          descricao: "Ficha, linha do tempo e histórico de cada pessoa.",
          // O escopo continua sendo resolvido pela página (todos | equipe |
          // próprio). O card, porém, só aparece para quem alcança OUTRA pessoa:
          // quem alcança apenas a si mesmo tem o card "Meu portal", que mostra
          // o mesmo dado na primeira pessoa e com mais utilidade.
          mostrar: pode?.colaborador_ver ?? false,
        },
        {
          href: "/avaliacoes",
          titulo: "Avaliações",
          descricao:
            "Ciclos de experiência (45/90) e desempenho, líder→liderado.",
          mostrar: pode?.avaliacao_acessar ?? false,
        },
      ],
    },
    {
      titulo: "Gestão de pessoas",
      cartoes: [
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
          href: "/admissoes/modelos",
          titulo: "Modelos de admissão",
          descricao:
            "Checklist de admissão por tipo de vínculo (CLT, estágio, aprendiz, PJ).",
          mostrar: pode?.admissao_modelo_administrar ?? false,
        },
        {
          href: "/desligamentos",
          titulo: "Desligamentos",
          descricao: "Condução do desligamento, devoluções e entrevista.",
          mostrar: pode?.desligamento_ver ?? false,
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
          href: "/ponto",
          titulo: "Ponto (DP)",
          descricao:
            "Importação, apuração da competência, fila de intercorrências e banco de horas da empresa.",
          // "(DP)" no título porque o card do PRÓPRIO ponto tem o nome sem
          // sufixo em "Meu dia": quem tem as duas chaves vê os dois e precisa
          // distinguir a operação da empresa do próprio espelho.
          mostrar: pode?.ponto_administrar ?? false,
        },
        {
          href: "/folha",
          titulo: "Folha de pagamento",
          descricao:
            "Competências, cálculo, conferência e fechamento da folha.",
          mostrar: pode?.folha_ver ?? false,
        },
        {
          href: "/cargos",
          titulo: "Cargos",
          descricao: "Cargos com CHA, RCF e faixas salariais.",
          mostrar: pode?.cargo_administrar ?? false,
        },
        {
          href: "/estrutura",
          titulo: "Estrutura do grupo",
          descricao:
            "Empresas do grupo (registro), locais de trabalho (lotação) e centros de custo.",
          mostrar: pode?.estrutura_administrar ?? false,
        },
        {
          href: "/relatorios",
          titulo: "Relatórios",
          descricao:
            "Aniversariantes, diversidade, composição familiar e headcount.",
          mostrar: pode?.relatorio_ver ?? false,
        },
      ],
    },
    {
      titulo: "Indicadores e direção",
      cartoes: [
        {
          // Separado de /relatorios de propósito (pedido da analista de RH):
          // relatório é operação de RH, painel executivo é decisão de diretoria.
          href: "/painel-executivo",
          titulo: "Dashboard Executivo",
          descricao:
            "Turnover, headcount, custo, absenteísmo, clima e performance — com a conta de cada número.",
          mostrar: pode?.painel_executivo_ver ?? false,
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
      ],
    },
    {
      titulo: "Administração do sistema",
      cartoes: [
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
      ],
    },
  ]
    .map((secao) => ({
      titulo: secao.titulo,
      cartoes: secao.cartoes.filter((cartao) => cartao.mostrar),
    }))
    .filter((secao) => secao.cartoes.length > 0);

  return (
    <div className={estilos.pagina}>
      {/* O nome saiu daqui e foi para dentro do Cabecalho — antes só esta tela
          o mostrava, e nas outras 40 ele sumia. */}
      <Cabecalho ocultarInicio />

      <main className={estilos.conteudo}>
        <h1>Bem-vindo ao Fast Pessoas</h1>
        <p className={estilos.subtitulo}>
          Sistema de DP/RH da Fast — escolha por onde começar.
        </p>

        {secoes.map((secao) => (
          <section key={secao.titulo}>
            <h2 className={estilos.tituloSecao}>{secao.titulo}</h2>
            <div className={estilos.grade}>
              {secao.cartoes.map((cartao) => (
                <Link
                  key={cartao.href}
                  className={estilos.cartao}
                  href={cartao.href}
                >
                  <h3>{cartao.titulo}</h3>
                  <p>{cartao.descricao}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className={estilos.tituloSecao}>Minha conta</h2>
          <div className={estilos.grade}>
            <Link className={estilos.cartao} href="/configurar-2fa">
              <h3>Autenticação em duas etapas</h3>
              <p>Configure ou desative o 2FA com aplicativo autenticador.</p>
            </Link>
            <Link className={estilos.cartao} href="/trocar-senha">
              <h3>Trocar senha</h3>
              <p>Atualize a sua senha de acesso.</p>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
