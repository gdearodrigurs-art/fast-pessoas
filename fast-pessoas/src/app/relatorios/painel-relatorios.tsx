"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import estilos from "./page.module.css";

interface Aniversariante {
  id: number;
  nome_completo: string;
  dia: number;
  unidade: string | null;
  cargo_nome: string | null;
}

interface RelatorioAniversariantes {
  mes: number;
  estabelecimento_id: number | null;
  aniversariantes: Aniversariante[];
  unidades: { estabelecimento_id: number; unidade: string }[];
  fichas_sem_data_nascimento: number;
}

interface RecorteAgregado {
  chave: string;
  rotulo: string;
  quantidade: number | null;
  suprimido: boolean;
}

interface RelatorioDiversidade {
  total_quadro: number;
  com_data_nascimento: number;
  sem_data_nascimento: number;
  minimo_por_recorte: number;
  por_genero: RecorteAgregado[];
  por_faixa_idade: RecorteAgregado[];
}

interface RelatorioComposicaoFamiliar {
  total_quadro: number;
  minimo_por_recorte: number;
  idade_limite_crianca: number;
  responsaveis_por_genero: RecorteAgregado[];
  com_conjuge_cadastrado: number;
  total_filhos: number;
  total_criancas: number;
  total_dependentes: number;
}

interface LinhaContagem {
  rotulo: string;
  quantidade: number;
}

interface RelatorioHeadcount {
  total_quadro: number;
  ativos: number;
  afastados: number;
  por_unidade: LinhaContagem[];
  por_cargo: LinhaContagem[];
  por_vinculo: LinhaContagem[];
}

type Aba = "aniversariantes" | "diversidade" | "familia" | "headcount";

const ABAS: [Aba, string][] = [
  ["aniversariantes", "Aniversariantes"],
  ["diversidade", "Diversidade"],
  ["familia", "Composição familiar"],
  ["headcount", "Headcount"],
];

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// O que a analista de RH pediu e que AINDA não temos dado para responder.
// Fica na tela, escrito, em vez de virar um relatório com número inventado.
const DEPENDE_DE_MODULO_FUTURO = [
  "Treinados por setor, curso e função — depende do módulo de Treinamento & Desenvolvimento (hoje no Sults).",
  "Processos trabalhistas (quantidade, custo) — depende de um módulo de contencioso, que não existe.",
  "Absenteísmo e horas extras — dependem do módulo de Ponto (REP-P ainda não contratado).",
  "Custo de pessoal por unidade — a folha própria está em F1; o custo consolidado entra quando ela virar a fonte oficial.",
  "Quadro aprovado × realizado — precisa do conceito de quadro aprovado (headcount orçado), que ainda não modelamos.",
];

/** Mês corrente em São Paulo — o servidor usa o mesmo fuso como padrão. */
function mesCorrenteSp(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      month: "numeric",
    }).format(new Date())
  );
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível carregar.";
}

function Barra({ valor, maximo }: { valor: number; maximo: number }) {
  const largura = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return <span className={estilos.barra} style={{ width: `${largura}%` }} />;
}

function TabelaContagem({
  titulo,
  linhas,
  total,
}: {
  titulo: string;
  linhas: LinhaContagem[];
  total: number;
}) {
  const maximo = linhas.reduce((max, linha) => Math.max(max, linha.quantidade), 0);
  return (
    <>
      <h3>{titulo}</h3>
      {linhas.length === 0 ? (
        <p className={estilos.vazio}>Sem dados.</p>
      ) : (
        <div className={estilos.tabelaEnvolucro}>
          <table className={estilos.tabela}>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.rotulo}>
                  <td>{linha.rotulo}</td>
                  <td className={estilos.numerico}>{linha.quantidade}</td>
                  <td className={estilos.numerico}>
                    {total > 0
                      ? `${Math.round((linha.quantidade / total) * 100)}%`
                      : "—"}
                  </td>
                  <td style={{ width: "35%" }}>
                    <Barra valor={linha.quantidade} maximo={maximo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TabelaRecortes({
  titulo,
  recortes,
  minimo,
}: {
  titulo: string;
  recortes: RecorteAgregado[];
  minimo: number;
}) {
  const maximo = recortes.reduce(
    (max, recorte) => Math.max(max, recorte.quantidade ?? 0),
    0
  );
  return (
    <>
      <h3>{titulo}</h3>
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <tbody>
            {recortes.map((recorte) => (
              <tr key={recorte.chave}>
                <td>{recorte.rotulo}</td>
                <td className={estilos.numerico}>
                  {recorte.suprimido ? (
                    <span className={estilos.suprimido}>
                      menos de {minimo}
                    </span>
                  ) : (
                    recorte.quantidade
                  )}
                </td>
                <td style={{ width: "35%" }}>
                  {!recorte.suprimido && (
                    <Barra valor={recorte.quantidade ?? 0} maximo={maximo} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PainelRelatorios() {
  const [aba, setAba] = useState<Aba>("aniversariantes");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const [mes, setMes] = useState<string>(() => String(mesCorrenteSp()));
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>("");

  const [aniversariantes, setAniversariantes] =
    useState<RelatorioAniversariantes | null>(null);
  const [diversidade, setDiversidade] = useState<RelatorioDiversidade | null>(
    null
  );
  const [familia, setFamilia] = useState<RelatorioComposicaoFamiliar | null>(
    null
  );
  const [headcount, setHeadcount] = useState<RelatorioHeadcount | null>(null);

  const carregarAniversariantes = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const parametros = new URLSearchParams();
      if (mes !== "") parametros.set("mes", mes);
      if (unidadeFiltro !== "") parametros.set("estabelecimento_id", unidadeFiltro);
      const resposta = await fetch(`/api/relatorios/aniversariantes?${parametros}`);
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        return;
      }
      setAniversariantes(await resposta.json());
    } catch {
      setErro("Falha de conexão. Recarregue a página.");
    } finally {
      setCarregando(false);
    }
  }, [mes, unidadeFiltro]);

  const carregarSimples = useCallback(
    async (
      caminho: string,
      aplicar: (dados: unknown) => void
    ): Promise<void> => {
      setCarregando(true);
      setErro(null);
      try {
        const resposta = await fetch(caminho);
        if (!resposta.ok) {
          setErro(await lerErro(resposta));
          return;
        }
        aplicar(await resposta.json());
      } catch {
        setErro("Falha de conexão. Recarregue a página.");
      } finally {
        setCarregando(false);
      }
    },
    []
  );

  // As buscas ficam dentro de um async IIFE: assim nenhum setState acontece
  // sincronamente no corpo do efeito (mesmo padrão das outras telas).
  useEffect(() => {
    void (async () => {
      if (aba === "aniversariantes") {
        await carregarAniversariantes();
      }
    })();
  }, [aba, carregarAniversariantes]);

  useEffect(() => {
    void (async () => {
      if (aba === "diversidade" && diversidade === null) {
        await carregarSimples("/api/relatorios/diversidade", (dados) =>
          setDiversidade(dados as RelatorioDiversidade)
        );
      }
      if (aba === "familia" && familia === null) {
        await carregarSimples("/api/relatorios/composicao-familiar", (dados) =>
          setFamilia(dados as RelatorioComposicaoFamiliar)
        );
      }
      if (aba === "headcount" && headcount === null) {
        await carregarSimples("/api/relatorios/headcount", (dados) =>
          setHeadcount(dados as RelatorioHeadcount)
        );
      }
    })();
  }, [aba, diversidade, familia, headcount, carregarSimples]);

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Relatórios de pessoas</h1>
        <p className={estilos.subtitulo}>
          Números apurados no banco, sempre sobre o quadro atual (ativos e
          afastados). Recorte que cruza dado autodeclarado ou de dependente é
          publicado só em agregado, com supressão de grupo pequeno.
        </p>

        <div className={estilos.abas}>
          {ABAS.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              className={`${estilos.aba} ${aba === id ? estilos.abaAtiva : ""}`}
              onClick={() => {
                setErro(null);
                setAba(id);
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {erro && <p className={estilos.erro}>{erro}</p>}

        {aba === "aniversariantes" && (
          <section className={estilos.cartao}>
            <h2>Aniversariantes do mês</h2>
            <p className={estilos.nota}>
              Só dia e mês — o ano de nascimento não entra no relatório (a idade
              não é necessária para parabenizar alguém).
            </p>
            <div className={estilos.filtros}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="rlMes">
                  Mês
                </label>
                <select
                  className={estilos.campo}
                  id="rlMes"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                >
                  {MESES.map((nome, indice) => (
                    <option key={nome} value={String(indice + 1)}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="rlUnidade">
                  Unidade
                </label>
                <select
                  className={estilos.campo}
                  id="rlUnidade"
                  value={unidadeFiltro}
                  onChange={(e) => setUnidadeFiltro(e.target.value)}
                >
                  <option value="">Todas as unidades</option>
                  {(aniversariantes?.unidades ?? []).map((unidade) => (
                    <option
                      key={unidade.estabelecimento_id}
                      value={String(unidade.estabelecimento_id)}
                    >
                      {unidade.unidade}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {carregando && aniversariantes === null ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : !aniversariantes ? null : (
              <>
                <div className={estilos.numeros}>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {aniversariantes.aniversariantes.length}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      aniversariantes em {MESES[aniversariantes.mes - 1]}
                    </div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {aniversariantes.fichas_sem_data_nascimento}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      fichas sem data de nascimento cadastrada
                    </div>
                  </div>
                </div>
                {aniversariantes.fichas_sem_data_nascimento > 0 && (
                  <p className={estilos.aviso}>
                    {aniversariantes.fichas_sem_data_nascimento} pessoa(s) do
                    quadro estão sem data de nascimento na ficha e por isso não
                    aparecem em nenhum mês. O campo é obrigatório para novos
                    cadastros; o legado precisa ser completado pelo DP.
                  </p>
                )}
                {aniversariantes.aniversariantes.length === 0 ? (
                  <p className={estilos.vazio}>
                    Ninguém faz aniversário neste mês com o filtro atual.
                  </p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Dia</th>
                          <th>Nome</th>
                          <th>Cargo</th>
                          <th>Unidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aniversariantes.aniversariantes.map((pessoa) => (
                          <tr key={pessoa.id}>
                            <td>
                              <span className={estilos.dia}>{pessoa.dia}</span>
                            </td>
                            <td>{pessoa.nome_completo}</td>
                            <td>{pessoa.cargo_nome ?? "—"}</td>
                            <td>{pessoa.unidade ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {aba === "diversidade" && (
          <section className={estilos.cartao}>
            <h2>Diversidade do quadro</h2>
            <p className={estilos.nota}>
              Gênero é autodeclarado e usado somente aqui, em agregado. Recorte
              com menos de {diversidade?.minimo_por_recorte ?? 5} pessoas não é
              publicado — em um quadro deste tamanho, publicar identificaria a
              pessoa.
            </p>
            {!diversidade ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : (
              <>
                <div className={estilos.numeros}>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {diversidade.total_quadro}
                    </div>
                    <div className={estilos.numeroRotulo}>pessoas no quadro</div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {diversidade.com_data_nascimento}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      com data de nascimento (base da faixa de idade)
                    </div>
                  </div>
                </div>
                <TabelaRecortes
                  titulo="Por gênero (autodeclarado)"
                  recortes={diversidade.por_genero}
                  minimo={diversidade.minimo_por_recorte}
                />
                <TabelaRecortes
                  titulo="Por faixa de idade"
                  recortes={diversidade.por_faixa_idade}
                  minimo={diversidade.minimo_por_recorte}
                />
                {diversidade.sem_data_nascimento > 0 && (
                  <p className={estilos.aviso}>
                    A faixa de idade cobre {diversidade.com_data_nascimento} de{" "}
                    {diversidade.total_quadro} pessoas —{" "}
                    {diversidade.sem_data_nascimento} ficha(s) ainda sem data de
                    nascimento.
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {aba === "familia" && (
          <section className={estilos.cartao}>
            <h2>Composição familiar</h2>
            <p className={estilos.nota}>
              A fonte é o cadastro de dependentes dos benefícios — não é um censo
              familiar: quem não incluiu dependente em plano não aparece aqui.
              Nome de dependente nunca sai do sistema; só contagem.
            </p>
            {!familia ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : (
              <>
                <div className={estilos.numeros}>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {familia.total_filhos}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      filhos cadastrados
                    </div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {familia.total_criancas}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      crianças de até {familia.idade_limite_crianca} anos
                    </div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {familia.com_conjuge_cadastrado}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      pessoas com cônjuge cadastrado
                    </div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {familia.total_dependentes}
                    </div>
                    <div className={estilos.numeroRotulo}>
                      dependentes no total
                    </div>
                  </div>
                </div>
                <TabelaRecortes
                  titulo="Responsáveis por filho, por gênero"
                  recortes={familia.responsaveis_por_genero}
                  minimo={familia.minimo_por_recorte}
                />
              </>
            )}
          </section>
        )}

        {aba === "headcount" && (
          <section className={estilos.cartao}>
            <h2>Headcount</h2>
            <p className={estilos.nota}>
              Quadro atual por lotação, posição e vínculo vigentes. Desligados
              não entram.
            </p>
            {!headcount ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : (
              <>
                <div className={estilos.numeros}>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {headcount.total_quadro}
                    </div>
                    <div className={estilos.numeroRotulo}>no quadro</div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>{headcount.ativos}</div>
                    <div className={estilos.numeroRotulo}>ativos</div>
                  </div>
                  <div className={estilos.numero}>
                    <div className={estilos.numeroValor}>
                      {headcount.afastados}
                    </div>
                    <div className={estilos.numeroRotulo}>afastados</div>
                  </div>
                </div>
                <TabelaContagem
                  titulo="Por unidade"
                  linhas={headcount.por_unidade}
                  total={headcount.total_quadro}
                />
                <TabelaContagem
                  titulo="Por cargo"
                  linhas={headcount.por_cargo}
                  total={headcount.total_quadro}
                />
                <TabelaContagem
                  titulo="Por tipo de vínculo"
                  linhas={headcount.por_vinculo}
                  total={headcount.total_quadro}
                />
              </>
            )}
          </section>
        )}

        <section className={`${estilos.cartao} ${estilos.futuro}`}>
          <h2>Pedidos que dependem de módulo futuro</h2>
          <p className={estilos.nota}>
            Estes relatórios foram pedidos e não estão aqui porque o sistema
            ainda não guarda o dado. Preferimos dizer isto a mostrar um número
            que não se sustenta.
          </p>
          <ul>
            {DEPENDE_DE_MODULO_FUTURO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
