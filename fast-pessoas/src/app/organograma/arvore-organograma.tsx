"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import Link from "next/link";
import estilos from "./page.module.css";
import { ArvoreVertical } from "./arvore-vertical";
import {
  CORES_UNIDADE,
  COR_SEM_UNIDADE,
  dataBr,
  rotuloLiderados,
  type No,
  type Organograma,
} from "./tipos";

// Duas visões sobre a MESMA árvore e o MESMO estado de colapso:
//   - vertical (arvore-vertical.tsx): de cima para baixo, conectores em CSS —
//     é o formato que a diretoria pediu; padrão em tela larga;
//   - lista indentada (aqui embaixo): fallback de tela estreita, onde 62
//     cartões lado a lado não cabem, e modo texto para quem preferir.
// Quem escolhe é o CSS (media query + classe `modoLista`), não o JavaScript.

const ROTULO_ALCANCE: Record<Organograma["alcance"], string> = {
  todos: "Você está vendo a estrutura completa da empresa.",
  equipe: "Você está vendo a sua equipe — você e os seus liderados, em cadeia.",
  proprio:
    "Você está vendo a sua linha de reporte: de você até a diretoria. Colegas de outras áreas não aparecem.",
};

// Zoom da árvore vertical: escala aplicada por `zoom` no CSS. Os limites são
// o que ainda se lê (0,5 já é cartão minúsculo) e o que ainda cabe (1,4).
const ESCALA_MINIMA = 0.5;
const ESCALA_MAXIMA = 1.4;
const PASSO_ESCALA = 0.1;

function limitarEscala(valor: number): number {
  return Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, Math.round(valor * 10) / 10));
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível carregar.";
}

/** Achata a árvore respeitando o que está recolhido — colapso é só de exibição. */
function achatar(
  nos: No[],
  recolhidos: Set<string>,
  saida: { no: No; temFilhos: boolean; recolhido: boolean }[]
): void {
  for (const no of nos) {
    const filhos = no.tipo === "pessoa" ? no.filhos : [];
    const temFilhos = filhos.length > 0;
    const recolhido = temFilhos && recolhidos.has(no.chave);
    saida.push({ no, temFilhos, recolhido });
    if (temFilhos && !recolhido) achatar(filhos, recolhidos, saida);
  }
}

function chavesComFilhos(nos: No[], destino: string[]): void {
  for (const no of nos) {
    if (no.tipo !== "pessoa" || no.filhos.length === 0) continue;
    destino.push(no.chave);
    chavesComFilhos(no.filhos, destino);
  }
}

export function ArvoreOrganograma() {
  const [dados, setDados] = useState<Organograma | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [unidade, setUnidade] = useState("");
  const [cargo, setCargo] = useState("");
  const [buscaCampo, setBuscaCampo] = useState("");
  const [busca, setBusca] = useState("");
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [escala, setEscala] = useState(1);
  const [modoLista, setModoLista] = useState(false);
  const rolagemRef = useRef<HTMLDivElement>(null);
  // Contador de "reenquadre pedido". Recolher/expandir TUDO refaz o desenho
  // inteiro e precisa reenquadrar, mas o estado que muda (`recolhidos`) é o
  // mesmo de recolher UM ramo — que não deve mexer na rolagem. O contador
  // separa as duas intenções sem inspecionar o conjunto.
  const [reenquadres, setReenquadres] = useState(0);

  // Busca com respiro: 2 caracteres é o mínimo aceito pelo esquema da rota.
  useEffect(() => {
    const texto = buscaCampo.trim();
    const temporizador = setTimeout(
      () => setBusca(texto.length >= 2 ? texto : ""),
      300
    );
    return () => clearTimeout(temporizador);
  }, [buscaCampo]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const parametros = new URLSearchParams();
    if (unidade) parametros.set("estabelecimento_id", unidade);
    if (cargo) parametros.set("cargo_id", cargo);
    if (busca) parametros.set("busca", busca);
    try {
      const resposta = await fetch(`/api/organograma?${parametros}`);
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        setDados(null);
        return;
      }
      setDados((await resposta.json()) as Organograma);
      // Dado novo = tudo aberto, para o caminho até o nó destacado ficar visível.
      setRecolhidos(new Set());
    } catch {
      setErro("Falha de rede ao carregar o organograma.");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [unidade, cargo, busca]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const corPorUnidade = useMemo(() => {
    const mapa = new Map<number, string>();
    (dados?.unidades ?? []).forEach((opcao, indice) => {
      mapa.set(opcao.id, CORES_UNIDADE[indice % CORES_UNIDADE.length]);
    });
    return mapa;
  }, [dados]);

  const corDe = useCallback(
    (estabelecimentoId: number | null) =>
      estabelecimentoId === null
        ? COR_SEM_UNIDADE
        : corPorUnidade.get(estabelecimentoId) ?? COR_SEM_UNIDADE,
    [corPorUnidade]
  );

  const linhas = useMemo(() => {
    if (!dados) return [];
    const saida: { no: No; temFilhos: boolean; recolhido: boolean }[] = [];
    achatar(dados.raizes, recolhidos, saida);
    return saida;
  }, [dados, recolhidos]);

  const alternar = (chave: string) => {
    setRecolhidos((anterior) => {
      const proximo = new Set(anterior);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  };

  const raizes = useMemo(
    () => new Set((dados?.raizes ?? []).map((no) => no.chave)),
    [dados]
  );

  const recolherTudo = () => {
    if (!dados) return;
    const chaves: string[] = [];
    chavesComFilhos(dados.raizes, chaves);
    // A raiz fica aberta: organograma todo fechado não serve para nada.
    setRecolhidos(new Set(chaves.filter((chave) => !raizes.has(chave))));
    setReenquadres((atual) => atual + 1);
  };

  const expandirTudo = () => {
    setRecolhidos(new Set());
    setReenquadres((atual) => atual + 1);
  };

  /**
   * Enquadra a RAIZ no contêiner de rolagem.
   *
   * Todo `.nivel` é flex com `justify-content: center`, então a raiz fica no
   * centro horizontal do desenho — mas o contêiner nasce em `scrollLeft = 0`,
   * na ponta ESQUERDA. Com o quadro inteiro (64 cartões de 214px) são ~13 mil
   * px de conteúdo numa janela de ~1 mil: quem abria a tela via cinco cartões
   * do meio da hierarquia e nenhum sinal de que o topo da empresa estava a 6
   * mil px à direita. Nem o zoom mínimo resolvia. Centralizar o contêiner é,
   * por construção do CSS, enquadrar a raiz.
   */
  const enquadrarRaiz = useCallback(() => {
    const rolagem = rolagemRef.current;
    if (!rolagem) return;
    rolagem.scrollLeft = (rolagem.scrollWidth - rolagem.clientWidth) / 2;
  }, []);

  // Dado novo (carga, filtro, busca), mudança de escala, volta da lista para a
  // árvore e recolher/expandir em massa refazem o desenho todo — cada um deles
  // reenquadra. Recolher UM ramo não entra: quem mexe num ramo perderia o lugar.
  useEffect(() => {
    enquadrarRaiz();
  }, [enquadrarRaiz, dados, escala, modoLista, reenquadres]);

  const temFiltro = Boolean(unidade || cargo || busca);

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/colaboradores">
          Colaboradores
        </Link>
      </Cabecalho>
      <main className={estilos.conteudo}>
        <h1>Organograma</h1>
        <p className={estilos.subtitulo}>
          Estrutura montada automaticamente da relação gestor → liderado vigente.
          Não há organograma digitado à mão: mudar de gestor na ficha muda esta
          tela. Sem salário — aqui é estrutura.
        </p>

        {dados && (
          <p className={estilos.aviso}>{ROTULO_ALCANCE[dados.alcance]}</p>
        )}
        {dados?.avisos.map((aviso) => (
          <p className={estilos.avisoAtencao} key={aviso}>
            {aviso}
          </p>
        ))}

        {dados?.headcount && (
          <section className={estilos.cartao}>
            <h2>Headcount aprovado × realizado</h2>
            <div className={estilos.numeros}>
              <div className={estilos.numero}>
                <div className={estilos.numeroValor}>
                  {dados.headcount.realizado}
                </div>
                <div className={estilos.numeroRotulo}>
                  Realizado — pessoas no quadro (ativas e afastadas)
                </div>
              </div>
              <div className={estilos.numero}>
                <div className={estilos.numeroValor}>
                  {dados.headcount.aprovado}
                </div>
                <div className={estilos.numeroRotulo}>
                  Aprovado — realizado + vagas aprovadas em aberto
                </div>
              </div>
              <div className={estilos.numero}>
                <div className={estilos.numeroValor}>
                  {dados.headcount.lacuna}
                </div>
                <div className={estilos.numeroRotulo}>
                  Posições em aberto — {dados.headcount.vagas_em_aberto} vaga(s)
                  de requisição aprovada
                </div>
              </div>
            </div>
            <p className={estilos.nota}>
              <strong>O que estes números são, exatamente:</strong>{" "}
              <em>realizado</em> é gente que existe no quadro hoje;{" "}
              <em>aprovado</em> é gente que existe <em>mais</em> as posições que
              a empresa já autorizou a contratar (requisição de vaga aprovada e
              vaga ainda não fechada). Contam apenas o recorte que você vê nesta
              tela, e não mudam com os filtros abaixo.
            </p>
            <p className={estilos.nota}>
              <strong>O que eles NÃO são:</strong> quadro aprovado formal. O
              sistema não tem (ainda) orçamento de headcount por unidade e cargo
              aprovado pela diretoria com vigência — então esta tela não finge
              ter. Enquanto isso não existir, &ldquo;aprovado&rdquo; aqui
              significa &ldquo;posições autorizadas hoje&rdquo;, derivado das
              requisições de vaga.
            </p>
          </section>
        )}

        <section className={estilos.cartao}>
          <div className={estilos.filtros}>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="busca">
                Buscar por nome
              </label>
              <input
                className={estilos.campo}
                id="busca"
                onChange={(evento) => setBuscaCampo(evento.target.value)}
                placeholder="pelo menos 2 letras"
                value={buscaCampo}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="unidade">
                Unidade
              </label>
              <select
                className={estilos.campo}
                id="unidade"
                onChange={(evento) => setUnidade(evento.target.value)}
                value={unidade}
              >
                <option value="">Todas</option>
                {(dados?.unidades ?? []).map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cargo">
                Cargo
              </label>
              <select
                className={estilos.campo}
                id="cargo"
                onChange={(evento) => setCargo(evento.target.value)}
                value={cargo}
              >
                <option value="">Todos</option>
                {(dados?.cargos ?? []).map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.acoes}>
              <button
                className={estilos.botaoSecundario}
                onClick={recolherTudo}
                type="button"
              >
                Recolher
              </button>
              <button
                className={estilos.botaoSecundario}
                onClick={expandirTudo}
                type="button"
              >
                Expandir
              </button>
              {temFiltro && (
                <button
                  className={estilos.botaoSecundario}
                  onClick={() => {
                    setUnidade("");
                    setCargo("");
                    setBuscaCampo("");
                  }}
                  type="button"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* `!carregando`: durante a busca `dados` ainda é o payload ANTERIOR
              (destacados=0 quando não havia filtro), e a nota piscava um
              "Nada casou com o filtro" falso antes da resposta chegar. */}
          {temFiltro && dados && !carregando && (
            <p className={estilos.nota}>
              {dados.destacados === 0
                ? "Nada casou com o filtro."
                : `${dados.destacados} nó(s) em destaque. Os gestores acima aparecem para você ver onde a pessoa está — as contagens continuam sendo do quadro completo.`}
            </p>
          )}

          {carregando && <p className={estilos.vazio}>Carregando…</p>}
          {erro && <p className={estilos.erro}>{erro}</p>}

          {!carregando && !erro && linhas.length === 0 && (
            <p className={estilos.vazio}>Nada para exibir.</p>
          )}

          {linhas.length > 0 && (
            <div className={modoLista ? estilos.modoLista : undefined}>
              {/* Controles da visão em árvore. Ficam FORA do contêiner de
                  rolagem: rolar a árvore para os lados não os leva junto, e o
                  `position: sticky` os mantém no topo enquanto se desce. */}
              <div className={estilos.barraVisual}>
                <div className={estilos.grupoZoom}>
                  <span className={estilos.rotulo}>Zoom</span>
                  <button
                    aria-label="Diminuir o zoom da árvore"
                    className={estilos.botaoZoom}
                    disabled={escala <= ESCALA_MINIMA}
                    onClick={() =>
                      setEscala((atual) => limitarEscala(atual - PASSO_ESCALA))
                    }
                    type="button"
                  >
                    −
                  </button>
                  <span className={estilos.valorZoom}>
                    {Math.round(escala * 100)}%
                  </span>
                  <button
                    aria-label="Aumentar o zoom da árvore"
                    className={estilos.botaoZoom}
                    disabled={escala >= ESCALA_MAXIMA}
                    onClick={() =>
                      setEscala((atual) => limitarEscala(atual + PASSO_ESCALA))
                    }
                    type="button"
                  >
                    +
                  </button>
                  <button
                    className={estilos.botaoSecundario}
                    onClick={() => setEscala(1)}
                    type="button"
                  >
                    Ajustar em 100%
                  </button>
                  <button
                    className={estilos.botaoSecundario}
                    onClick={enquadrarRaiz}
                    type="button"
                  >
                    Voltar à raiz
                  </button>
                </div>
                <button
                  className={estilos.botaoSecundario}
                  onClick={() => setModoLista((atual) => !atual)}
                  type="button"
                >
                  {modoLista ? "Ver em árvore" : "Ver como lista"}
                </button>
                <span className={estilos.dicaBarra}>
                  A árvore abre enquadrada na raiz; arraste para os lados para
                  percorrer. Recolha um ramo pelo rodapé do cartão.
                </span>
              </div>

              <div className={estilos.visaoArvore}>
                <div className={estilos.rolagem} ref={rolagemRef}>
                  <div
                    className={estilos.arvoreVertical}
                    style={{ "--escala": escala } as CSSProperties}
                  >
                    <ArvoreVertical
                      alternar={alternar}
                      corDe={corDe}
                      raizes={dados?.raizes ?? []}
                      recolhidos={recolhidos}
                    />
                  </div>
                </div>
              </div>

              <ul className={`${estilos.arvore} ${estilos.visaoLista}`}>
              {linhas.map(({ no, temFilhos, recolhido }) => {
                const cor = corDe(no.estabelecimento_id);
                return (
                  <li
                    className={`${estilos.linha} ${
                      no.tipo === "vaga" ? estilos.linhaVaga : ""
                    } ${no.destacado ? estilos.linhaDestacada : ""}`}
                    key={no.chave}
                    style={{
                      paddingLeft: `${12 + no.nivel * 24}px`,
                      borderLeftColor: cor,
                    }}
                  >
                    {temFilhos ? (
                      <button
                        aria-expanded={!recolhido}
                        className={estilos.alternador}
                        onClick={() => alternar(no.chave)}
                        title={recolhido ? "Expandir" : "Recolher"}
                        type="button"
                      >
                        {recolhido ? "▸" : "▾"}
                      </button>
                    ) : (
                      <span className={estilos.alternadorVazio} aria-hidden />
                    )}
                    {no.tipo === "pessoa" ? (
                      <>
                        <Link
                          className={estilos.nome}
                          href={`/colaboradores/${no.colaborador_id}`}
                        >
                          {no.nome}
                        </Link>
                        <span className={estilos.cargo}>
                          {no.cargo_nome ?? "sem cargo vigente"}
                        </span>
                        <span
                          className={estilos.unidade}
                          style={{ color: cor, borderColor: cor }}
                        >
                          {no.unidade ?? "sem lotação"}
                        </span>
                        {no.status !== "ativo" && (
                          <span className={estilos.selo}>{no.status}</span>
                        )}
                        {no.diretos > 0 && (
                          <span
                            className={estilos.contagem}
                            title="liderados diretos / total da subárvore"
                          >
                            {rotuloLiderados(no)}
                          </span>
                        )}
                        {no.fora_da_hierarquia && (
                          <span className={estilos.seloAlerta}>
                            fora da hierarquia
                          </span>
                        )}
                        {no.gestor_fora_do_quadro && (
                          <span className={estilos.seloAlerta}>
                            gestor fora do quadro
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={estilos.nomeVaga}>
                          vaga aberta: {no.cargo_nome ?? no.titulo}
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
                  </li>
                );
              })}
              </ul>
            </div>
          )}

          {dados && dados.vagas_sem_no.length > 0 && (
            <div className={estilos.orfas}>
              <h3>Vagas em aberto sem gestor identificado</h3>
              <ul>
                {dados.vagas_sem_no.map((vaga) => (
                  <li key={vaga.chave}>
                    {vaga.cargo_nome ?? vaga.titulo} —{" "}
                    {vaga.unidade ?? "sem unidade"} · prazo{" "}
                    {dataBr(vaga.prazo_alvo)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <p className={estilos.nota}>
          Evolução registrada: linha de sucessão por cargo (quem substitui quem)
          depende de cruzar resultado de avaliação com o RCF — entra quando o
          plano de sucessão virar módulo. Aqui já dá para ler a cadeia de
          comando, que é o insumo dela.
        </p>
      </main>
    </div>
  );
}
