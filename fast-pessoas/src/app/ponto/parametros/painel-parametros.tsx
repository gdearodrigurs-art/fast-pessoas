"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import { TIPOS_JORNADA } from "@/dominios/ponto/calculo";
import {
  ABRANGENCIAS_FERIADO,
  AbrangenciaFeriado,
  formatarMinutos,
  formatarRelogio,
  horaParaMinutos,
  ROTULOS_ABRANGENCIA_FERIADO,
  ROTULOS_TIPO_FERIADO,
  ROTULOS_TIPO_JORNADA,
  ROTULOS_TRATAMENTO_RESCISAO,
  TIPOS_FERIADO,
  TipoFeriado,
  TRATAMENTOS_RESCISAO,
  TratamentoRescisao,
} from "@/dominios/ponto/esquemas";
import estilos from "../ponto.module.css";

/** Índice 0 domingo … 6 sábado, na mesma ordem em que a jornada guarda. */
const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** O mesmo por extenso, para rótulo de campo em que abreviar confunde. */
const NOMES_DIA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/**
 * Minutos → "HH:MM" SEM dar a volta na meia-noite: a saída contratual de quem
 * vira a noite é 29:20, não 05:20, e `formatarRelogio` (que normaliza em 1440)
 * devolveria o horário errado ao semear o formulário.
 */
function paraHhMm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(
    minutos % 60
  ).padStart(2, "0")}`;
}

// Contrato de /api/ponto/parametros.

interface Jornada {
  id: number;
  codigo: string;
  nome: string;
  tipo: keyof typeof ROTULOS_TIPO_JORNADA;
  carga_diaria_minutos: number;
  carga_semanal_minutos: number;
  previsto_por_dia_semana: number[] | null;
  ciclo_dias: number | null;
  intervalo_minimo_minutos: number;
  intervalo_obrigatorio_acima_minutos: number;
  tolerancia_entrada_minutos: number;
  tolerancia_saida_minutos: number;
  horario_entrada_minuto: number | null;
  horario_saida_minuto: number | null;
  dia_repouso_semana: number | null;
  dias_uteis_semana: number;
  adicional_noturno_inicio_minuto: number;
  adicional_noturno_fim_minuto: number;
  hora_noturna_segundos: number;
  janela_arraste_minutos: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  colaboradores_na_escala: number;
}

interface Escala {
  escala_id: number;
  colaborador_id: number;
  inicio_vigencia: string;
  jornada: Jornada;
}

interface Feriado {
  id: number;
  data: string;
  nome: string;
  abrangencia: AbrangenciaFeriado;
  uf: string | null;
  municipio: string | null;
  tipo: TipoFeriado;
}

interface Regra {
  id: number;
  nivel: number;
  escopo: string;
  // Os três alvos vêm da API desde sempre; a tela passou a declará-los porque é
  // deles que a nova versão se semeia — sem eles, reabrir o formulário de uma
  // regra de cargo obrigaria a escolher o cargo de novo, no chute.
  estabelecimento_id: number | null;
  cargo_id: number | null;
  colaborador_id: number | null;
  prazo_compensacao_dias: number;
  limite_positivo_minutos: number;
  limite_negativo_minutos: number;
  expira_saldo: boolean;
  tratamento_rescisao: TratamentoRescisao;
  fator_he_50: number;
  fator_he_100: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface Opcao {
  id: number;
  nome: string;
}

interface Pessoa {
  id: number;
  nome_completo: string;
  matricula: string;
}

interface Visao {
  hoje: string;
  ano_feriados: number;
  jornadas: Jornada[];
  escalas: Escala[];
  feriados: Feriado[];
  regras: Regra[];
  cargos: Opcao[];
  estabelecimentos: Opcao[];
  colaboradores: Pessoa[];
}

// Contrato de POST /api/ponto/suite (bateria versionada em rh.caso_teste_ponto).

interface DiferencaCaso {
  campo: string;
  esperado: number | string | boolean | null;
  obtido: number | string | boolean | null;
}

interface ResultadoCaso {
  caso_id: number;
  nome: string;
  descricao: string;
  passou: boolean;
  diferencas: DiferencaCaso[];
  erro: string | null;
}

interface ResultadoSuite {
  total: number;
  passaram: number;
  falharam: number;
  casos: ResultadoCaso[];
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Diferença da bateria: booleano vira palavra, para a tabela não mostrar "true". */
function mostrarValor(valor: number | string | boolean | null): string {
  if (valor === null) return "ausente";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível concluir.";
}

/** POST com erro já legível, usado pelas seções que têm formulário próprio. */
async function enviarJson(
  url: string,
  corpo: unknown
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) return { ok: false, erro: await lerErro(resposta) };
    return { ok: true };
  } catch {
    return { ok: false, erro: "Falha de conexão. Tente novamente." };
  }
}

export function PainelParametrosPonto() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [anoFeriados, setAnoFeriados] = useState<number>(
    new Date().getUTCFullYear()
  );

  const [escala, setEscala] = useState({
    colaborador_id: "",
    jornada_versao_id: "",
    inicio_vigencia: "",
    observacao: "",
  });
  const [feriado, setFeriado] = useState({
    data: "",
    nome: "",
    abrangencia: "nacional" as AbrangenciaFeriado,
    tipo: "feriado" as TipoFeriado,
    uf: "",
    municipio: "",
  });
  const [salvando, setSalvando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [suite, setSuite] = useState<ResultadoSuite | null>(null);
  const [rodandoSuite, setRodandoSuite] = useState(false);
  const [erroSuite, setErroSuite] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/ponto/parametros?ano=${anoFeriados}`, {
          cache: "no-store",
        });
        if (!ativo) return;
        if (!resposta.ok) {
          setErro(await lerErro(resposta));
          return;
        }
        setVisao((await resposta.json()) as Visao);
        setErro(null);
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [anoFeriados, versao]);

  async function enviar(
    marca: string,
    url: string,
    corpo: unknown,
    sucesso: string,
    metodo = "POST"
  ) {
    setSalvando(marca);
    setErroForm(null);
    setMensagem(null);
    try {
      const resposta = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: metodo === "DELETE" ? undefined : JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        setErroForm(await lerErro(resposta));
        return;
      }
      setMensagem(sucesso);
      setVersao((v) => v + 1);
    } catch {
      setErroForm("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(null);
    }
  }

  function salvarEscala(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar(
      "escala",
      "/api/ponto/parametros/escalas",
      {
        colaborador_id: Number(escala.colaborador_id),
        jornada_versao_id: Number(escala.jornada_versao_id),
        inicio_vigencia: escala.inicio_vigencia,
        observacao: escala.observacao || undefined,
      },
      "Escala definida. A apuração passa a usar essa jornada a partir da vigência."
    );
  }

  function salvarFeriado(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar(
      "feriado",
      "/api/ponto/parametros/feriados",
      {
        data: feriado.data,
        nome: feriado.nome,
        abrangencia: feriado.abrangencia,
        tipo: feriado.tipo,
        uf: feriado.abrangencia === "nacional" ? null : feriado.uf || null,
        municipio:
          feriado.abrangencia === "municipal" ? feriado.municipio || null : null,
      },
      "Feriado cadastrado."
    );
  }

  async function rodarSuite() {
    setErroSuite(null);
    setRodandoSuite(true);
    try {
      const resposta = await fetch("/api/ponto/suite", { method: "POST" });
      if (resposta.ok) {
        setSuite((await resposta.json()) as ResultadoSuite);
      } else {
        setErroSuite(await lerErro(resposta));
      }
    } catch {
      setErroSuite("Falha de conexão. Tente novamente.");
    } finally {
      setRodandoSuite(false);
    }
  }

  const nomePorId = new Map(
    (visao?.colaboradores ?? []).map((pessoa) => [pessoa.id, pessoa.nome_completo])
  );

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/ponto">
          Ponto
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Parâmetros do ponto</h1>
        <p className={estilos.subtitulo}>
          Jornadas, escalas, feriados e regras de banco de horas. Tudo aqui é
          DADO VERSIONADO COM VIGÊNCIA: mudar um parâmetro cria versão nova e a
          apuração do mês passado continua enxergando o parâmetro do mês passado.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {erroForm && <p className={estilos.erro}>{erroForm}</p>}
        {mensagem && <p className={estilos.sucesso}>{mensagem}</p>}

        {/* ------------------------------------------------ bateria do motor */}
        <section className={estilos.cartao}>
          <h2>Bateria de casos de teste do motor</h2>
          <p className={estilos.notaRodape}>
            Roda os casos de rh.caso_teste_ponto pelo mesmo caminho da apuração
            (agrupamento das batidas por dia e depois o motor) e confere MINUTO A
            MINUTO contra a saída esperada, calculada à mão e escrita por extenso
            na descrição de cada caso. É o que impede a hora noturna reduzida, o
            divisor do DSR, o dia de repouso, a tolerância por marcação e a janela
            de arraste de voltarem a ser número chumbado no código: os casos vêm
            em pares que só diferem no parâmetro em disputa, então FAIL em um e
            PASS no gêmeo apontam o defeito.
          </p>
          <div className={estilos.barraAcoes}>
            <button
              className={estilos.botao}
              type="button"
              disabled={rodandoSuite}
              onClick={() => void rodarSuite()}
            >
              {rodandoSuite ? "Rodando…" : "Rodar bateria"}
            </button>
          </div>
          {erroSuite && <p className={estilos.erro}>{erroSuite}</p>}
          {suite && (
            <>
              <div className={estilos.cartoesResumo}>
                <div className={estilos.cartaoResumo}>
                  <strong>{suite.total}</strong>
                  <span>casos ativos</span>
                </div>
                <div className={estilos.cartaoResumo}>
                  <strong>{suite.passaram}</strong>
                  <span>PASS</span>
                </div>
                <div
                  className={
                    suite.falharam > 0
                      ? `${estilos.cartaoResumo} ${estilos.cartaoResumoDestaque}`
                      : estilos.cartaoResumo
                  }
                >
                  <strong>{suite.falharam}</strong>
                  <span>FAIL</span>
                </div>
              </div>
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Resultado</th>
                      <th>Caso</th>
                      <th>Diferenças (esperado → obtido, em minutos)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suite.casos.map((caso) => (
                      <tr key={caso.caso_id}>
                        <td>
                          <span
                            className={`${estilos.etiqueta} ${caso.passou ? estilos.etiquetaPass : estilos.etiquetaFail}`}
                          >
                            {caso.passou ? "PASS" : "FAIL"}
                          </span>
                        </td>
                        <td>
                          <strong>{caso.nome}</strong>
                          <details className={estilos.memoria}>
                            <summary>Descrição da conta</summary>
                            <pre className={estilos.memoriaConteudo}>
                              {caso.descricao}
                            </pre>
                          </details>
                        </td>
                        <td>
                          {caso.erro && (
                            <span className={estilos.erro}>{caso.erro}</span>
                          )}
                          {!caso.erro && caso.diferencas.length === 0 && "—"}
                          {caso.diferencas.map((diferenca) => (
                            <div key={diferenca.campo}>
                              <strong>{diferenca.campo}</strong>:{" "}
                              {mostrarValor(diferenca.esperado)} →{" "}
                              {mostrarValor(diferenca.obtido)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ------------------------------------------------ jornadas */}
        <SecaoJornadas
          jornadas={visao?.jornadas ?? []}
          aoMudar={() => setVersao((v) => v + 1)}
        />

        {/* ------------------------------------------------ escalas */}
        <section className={estilos.cartao}>
          <h2>Escalas vigentes ({visao?.escalas.length ?? 0})</h2>
          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Jornada</th>
                  <th>Desde</th>
                </tr>
              </thead>
              <tbody>
                {(visao?.escalas ?? []).map((item) => (
                  <tr key={item.escala_id}>
                    <td>
                      {nomePorId.get(item.colaborador_id) ??
                        `colaborador ${item.colaborador_id}`}
                    </td>
                    <td>
                      {item.jornada.codigo} — {item.jornada.nome}
                    </td>
                    <td>{formatarData(item.inicio_vigencia)}</td>
                  </tr>
                ))}
                {(visao?.escalas.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={3}>Ninguém com escala vigente.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>Definir escala</h3>
          <form className={estilos.formulario} onSubmit={salvarEscala}>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="e-colaborador">
                Colaborador
              </label>
              <select
                className={estilos.campo}
                id="e-colaborador"
                required
                value={escala.colaborador_id}
                onChange={(e) =>
                  setEscala({ ...escala, colaborador_id: e.target.value })
                }
              >
                <option value="">selecione…</option>
                {(visao?.colaboradores ?? []).map((pessoa) => (
                  <option key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome_completo} ({pessoa.matricula})
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="e-jornada">
                Jornada
              </label>
              <select
                className={estilos.campo}
                id="e-jornada"
                required
                value={escala.jornada_versao_id}
                onChange={(e) =>
                  setEscala({ ...escala, jornada_versao_id: e.target.value })
                }
              >
                <option value="">selecione…</option>
                {(visao?.jornadas ?? [])
                  .filter((item) => item.status === "ativa")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo} — {item.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="e-vigencia">
                Início
              </label>
              <input
                className={estilos.campo}
                id="e-vigencia"
                type="date"
                required
                value={escala.inicio_vigencia}
                onChange={(e) =>
                  setEscala({ ...escala, inicio_vigencia: e.target.value })
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="e-obs">
                Observação
              </label>
              <input
                className={estilos.campo}
                id="e-obs"
                value={escala.observacao}
                onChange={(e) =>
                  setEscala({ ...escala, observacao: e.target.value })
                }
              />
            </div>
            <button
              className={estilos.botao}
              type="submit"
              disabled={salvando === "escala"}
            >
              {salvando === "escala" ? "Salvando…" : "Definir escala"}
            </button>
          </form>
        </section>

        {/* ------------------------------------------------ feriados */}
        <section className={estilos.cartao}>
          <h2>Feriados de {visao?.ano_feriados ?? anoFeriados}</h2>
          <div className={estilos.faixaLinha}>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="f-ano">
                Ano
              </label>
              <input
                className={estilos.campo}
                id="f-ano"
                type="number"
                min={2020}
                max={2100}
                value={anoFeriados}
                onChange={(e) => setAnoFeriados(Number(e.target.value))}
              />
            </div>
          </div>
          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Abrangência</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(visao?.feriados ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{formatarData(item.data)}</td>
                    <td>{item.nome}</td>
                    <td>{ROTULOS_TIPO_FERIADO[item.tipo]}</td>
                    <td>
                      {ROTULOS_ABRANGENCIA_FERIADO[item.abrangencia]}
                      {item.uf ? ` · ${item.uf}` : ""}
                      {item.municipio ? ` · ${item.municipio}` : ""}
                    </td>
                    <td>
                      <button
                        className={estilos.botaoLinha}
                        type="button"
                        disabled={salvando === `feriado-${item.id}`}
                        onClick={() =>
                          void enviar(
                            `feriado-${item.id}`,
                            `/api/ponto/parametros/feriados/${item.id}`,
                            null,
                            "Feriado removido.",
                            "DELETE"
                          )
                        }
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {(visao?.feriados.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5}>Nenhum feriado cadastrado neste ano.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>Novo feriado</h3>
          <form className={estilos.formulario} onSubmit={salvarFeriado}>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="fer-data">
                Data
              </label>
              <input
                className={estilos.campo}
                id="fer-data"
                type="date"
                required
                value={feriado.data}
                onChange={(e) => setFeriado({ ...feriado, data: e.target.value })}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="fer-nome">
                Nome
              </label>
              <input
                className={estilos.campo}
                id="fer-nome"
                required
                value={feriado.nome}
                onChange={(e) => setFeriado({ ...feriado, nome: e.target.value })}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="fer-tipo">
                Tipo
              </label>
              <select
                className={estilos.campo}
                id="fer-tipo"
                value={feriado.tipo}
                onChange={(e) =>
                  setFeriado({ ...feriado, tipo: e.target.value as TipoFeriado })
                }
              >
                {TIPOS_FERIADO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULOS_TIPO_FERIADO[valor]}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="fer-abrangencia">
                Abrangência
              </label>
              <select
                className={estilos.campo}
                id="fer-abrangencia"
                value={feriado.abrangencia}
                onChange={(e) =>
                  setFeriado({
                    ...feriado,
                    abrangencia: e.target.value as AbrangenciaFeriado,
                  })
                }
              >
                {ABRANGENCIAS_FERIADO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULOS_ABRANGENCIA_FERIADO[valor]}
                  </option>
                ))}
              </select>
            </div>
            {feriado.abrangencia !== "nacional" && (
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="fer-uf">
                  UF
                </label>
                <input
                  className={estilos.campo}
                  id="fer-uf"
                  maxLength={2}
                  value={feriado.uf}
                  onChange={(e) => setFeriado({ ...feriado, uf: e.target.value })}
                />
              </div>
            )}
            {feriado.abrangencia === "municipal" && (
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="fer-municipio">
                  Município
                </label>
                <input
                  className={estilos.campo}
                  id="fer-municipio"
                  value={feriado.municipio}
                  onChange={(e) =>
                    setFeriado({ ...feriado, municipio: e.target.value })
                  }
                />
              </div>
            )}
            <button
              className={estilos.botao}
              type="submit"
              disabled={salvando === "feriado"}
            >
              {salvando === "feriado" ? "Salvando…" : "Cadastrar"}
            </button>
          </form>
          <p className={estilos.notaRodape}>
            Só FERIADO é dia de repouso — trabalho nele é hora extra de 100%.
            Ponto facultativo é dia útil comum.
          </p>
        </section>

        {/* ------------------------------------------------ regras de banco */}
        <SecaoRegras
          regras={visao?.regras ?? []}
          cargos={visao?.cargos ?? []}
          estabelecimentos={visao?.estabelecimentos ?? []}
          colaboradores={visao?.colaboradores ?? []}
          aoMudar={() => setVersao((v) => v + 1)}
        />
      </main>
    </div>
  );
}

// ==================================================================== jornadas

/**
 * O formulário de jornada NASCE VAZIO — os 20 campos, sem exceção.
 *
 * Já foi o contrário: `useState` trazia 5x2, 08:00 de carga diária, 44:00 de
 * semanal, 60 min de intervalo e 5+5 de tolerância prontos nos campos
 * `required`, e bastava digitar código, nome e vigência para GRAVAR seis
 * números de negócio que ninguém escolheu. Pior: aqueles números não fechavam
 * entre si — 5 dias de 8h dão 40h, não 44 —, então a jornada montada com os
 * próprios padrões da tela era RECUSADA pelo banco com "violates check
 * constraint jornada_versao_previsto_semana_fecha" e o DP via só "Erro interno
 * do servidor", sem campo nenhum para consertar.
 *
 * A semeadura acontece na ABERTURA do formulário, a partir da versão que se
 * está sucedendo (`abrirFormulario`), e não aqui: `useState` semeia uma vez, e
 * esta seção não remonta depois de gravar — semeando na montagem, o formulário
 * reaberto mostraria a versão anterior como se fosse a vigente. É o mesmo
 * desenho que a tela de parâmetros da folha adotou em SecaoParametrosGerais.
 */
const JORNADA_EM_BRANCO = {
  codigo: "",
  nome: "",
  tipo: "",
  carga_diaria: "",
  carga_semanal: "",
  previsto: ["", "", "", "", "", "", ""],
  ciclo_dias: "",
  intervalo_minimo: "",
  intervalo_obrigatorio_acima: "",
  tolerancia_entrada: "",
  tolerancia_saida: "",
  horario_entrada: "",
  horario_saida: "",
  /** "" nada escolhido · "nenhum" sem dia fixo · "0".."6" dia da semana. */
  dia_repouso_semana: "",
  dias_uteis_semana: "",
  adicional_noturno_inicio: "",
  adicional_noturno_fim: "",
  hora_noturna_segundos: "",
  janela_arraste: "",
  inicio_vigencia: "",
};

type FormularioJornada = typeof JORNADA_EM_BRANCO;

/** Versão vigente → formulário. A VIGÊNCIA nunca é copiada: ela é sempre nova. */
function semearDaJornada(base: Jornada): FormularioJornada {
  return {
    codigo: base.codigo,
    nome: base.nome,
    tipo: base.tipo,
    carga_diaria: paraHhMm(base.carga_diaria_minutos),
    carga_semanal: paraHhMm(base.carga_semanal_minutos),
    previsto: base.previsto_por_dia_semana
      ? base.previsto_por_dia_semana.map(String)
      : ["", "", "", "", "", "", ""],
    ciclo_dias: base.ciclo_dias === null ? "" : String(base.ciclo_dias),
    intervalo_minimo: String(base.intervalo_minimo_minutos),
    intervalo_obrigatorio_acima: String(
      base.intervalo_obrigatorio_acima_minutos
    ),
    tolerancia_entrada: String(base.tolerancia_entrada_minutos),
    tolerancia_saida: String(base.tolerancia_saida_minutos),
    horario_entrada:
      base.horario_entrada_minuto === null
        ? ""
        : paraHhMm(base.horario_entrada_minuto),
    horario_saida:
      base.horario_saida_minuto === null
        ? ""
        : paraHhMm(base.horario_saida_minuto),
    dia_repouso_semana:
      base.dia_repouso_semana === null
        ? "nenhum"
        : String(base.dia_repouso_semana),
    dias_uteis_semana: String(base.dias_uteis_semana),
    adicional_noturno_inicio: formatarRelogio(
      base.adicional_noturno_inicio_minuto
    ),
    adicional_noturno_fim: formatarRelogio(base.adicional_noturno_fim_minuto),
    hora_noturna_segundos: String(base.hora_noturna_segundos),
    janela_arraste: String(base.janela_arraste_minutos),
    inicio_vigencia: "",
  };
}

function SecaoJornadas({
  jornadas,
  aoMudar,
}: {
  jornadas: Jornada[];
  aoMudar: () => void;
}) {
  const [form, setForm] = useState<FormularioJornada>(JORNADA_EM_BRANCO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [baseadaEm, setBaseadaEm] = useState<Jornada | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const ativas = jornadas.filter((item) => item.status === "ativa");

  function abrirFormulario(base: Jornada | null) {
    setForm(base ? semearDaJornada(base) : JORNADA_EM_BRANCO);
    setBaseadaEm(base);
    setErro(null);
    setSucesso(null);
    setMostrarForm(true);
  }

  function alterar(campo: keyof FormularioJornada, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function alterarPrevisto(dia: number, valor: string) {
    setForm((atual) => ({
      ...atual,
      previsto: atual.previsto.map((v, i) => (i === dia ? valor : v)),
    }));
  }

  const previstoCompleto = form.previsto.every((v) => v.trim() !== "");
  const previstoIniciado = form.previsto.some((v) => v.trim() !== "");
  const somaPrevisto = form.previsto.reduce(
    (total, valor) => total + (horaParaMinutos(valor) ?? 0),
    0
  );

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    if (previstoIniciado && !previstoCompleto) {
      setErro(
        "O previsto da semana é tudo ou nada: preencha os 7 dias (0 no dia de " +
          "folga) ou apague todos e deixe o banco derivar do tipo e da carga."
      );
      return;
    }
    setEnviando(true);
    const resultado = await enviarJson("/api/ponto/parametros/jornadas", {
      codigo: form.codigo.trim().toUpperCase(),
      nome: form.nome.trim(),
      tipo: form.tipo,
      carga_diaria: form.carga_diaria,
      carga_semanal: form.carga_semanal,
      previsto_por_dia_semana: previstoCompleto ? form.previsto : undefined,
      ciclo_dias:
        form.ciclo_dias.trim() === "" ? undefined : Number(form.ciclo_dias),
      intervalo_minimo: form.intervalo_minimo,
      intervalo_obrigatorio_acima: form.intervalo_obrigatorio_acima,
      tolerancia_entrada: form.tolerancia_entrada,
      tolerancia_saida: form.tolerancia_saida,
      horario_entrada: form.horario_entrada,
      horario_saida: form.horario_saida,
      // "nenhum" é resposta, não campo em branco: significa "esta jornada não
      // tem repouso em dia fixo do calendário" — o descanso do 12x36 são as
      // 36 h entre plantões. O esquema exige a chave presente justamente para
      // distinguir isso de "o DP não respondeu".
      dia_repouso_semana:
        form.dia_repouso_semana === "nenhum"
          ? null
          : Number(form.dia_repouso_semana),
      dias_uteis_semana: Number(form.dias_uteis_semana),
      adicional_noturno_inicio: form.adicional_noturno_inicio,
      adicional_noturno_fim: form.adicional_noturno_fim,
      hora_noturna_segundos: Number(form.hora_noturna_segundos),
      janela_arraste: form.janela_arraste,
      inicio_vigencia: form.inicio_vigencia,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setMostrarForm(false);
    setForm(JORNADA_EM_BRANCO);
    setBaseadaEm(null);
    setSucesso(
      "Versão de jornada criada. A versão anterior do mesmo código foi " +
        "encerrada na véspera."
    );
    aoMudar();
  }

  return (
    <section className={estilos.cartao}>
      <h2>Jornadas</h2>
      {ativas.length === 0 && (
        <div className={estilos.avisoCritico}>
          <strong>Nenhuma jornada ativa cadastrada.</strong> Sem jornada não há
          previsto, não há hora extra e a apuração não roda. Cadastre a primeira
          abaixo — os campos abrem EM BRANCO de propósito: carga, tolerância,
          janela noturna, dia de repouso e duração da hora noturna saem do
          contrato de trabalho e da convenção coletiva da empresa, e o sistema
          não tem número para sugerir no lugar do DP.
        </div>
      )}
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th className={estilos.numero}>Diária</th>
              <th className={estilos.numero}>Semanal</th>
              <th className={estilos.numero}>Intervalo</th>
              <th className={estilos.numero}>Tolerância</th>
              <th>Previsto na semana</th>
              <th>Horário contratual</th>
              <th>Noturno</th>
              <th>Arraste até</th>
              <th>Vigência</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jornadas.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.codigo}</strong>
                </td>
                <td>{item.nome}</td>
                <td>{ROTULOS_TIPO_JORNADA[item.tipo]}</td>
                <td className={estilos.numero}>
                  {formatarMinutos(item.carga_diaria_minutos)}
                </td>
                <td className={estilos.numero}>
                  {formatarMinutos(item.carga_semanal_minutos)}
                </td>
                <td className={estilos.numero}>
                  {formatarMinutos(item.intervalo_minimo_minutos)}
                  <br />
                  <small>
                    obrigatório acima de{" "}
                    {formatarMinutos(item.intervalo_obrigatorio_acima_minutos)}
                  </small>
                </td>
                <td className={estilos.numero}>
                  {item.tolerancia_entrada_minutos +
                    item.tolerancia_saida_minutos}{" "}
                  min
                </td>
                {/*
                  O PREVISTO DE CADA DIA, à vista. Ele estava implícito no
                  motor ("sábado = semanal − 5 × diária") e foi assim que a
                  LOJA-44 acabou chamada de "sábado 4h" prevendo 7h20: o
                  número não aparecia em lugar nenhum antes de virar atraso
                  no espelho de alguém.
                */}
                <td
                  title={
                    "Minutos previstos em cada dia da semana. A soma fecha " +
                    "com a carga semanal — o banco não aceita outra coisa."
                  }
                >
                  {item.previsto_por_dia_semana
                    ? item.previsto_por_dia_semana
                        .map(
                          (minutos, dia) =>
                            `${DIAS_DA_SEMANA[dia]} ${minutos === 0 ? "—" : formatarMinutos(minutos)}`
                        )
                        .join(" · ")
                    : item.ciclo_dias === null || item.ciclo_dias === undefined
                      ? "sem previsto por dia e sem ciclo — cadastre a escala"
                      : `escala de ${item.ciclo_dias} dia(s): trabalha um, folga ${
                          item.ciclo_dias - 1
                        }`}
                </td>
                <td
                  title={
                    "Horário do contrato. É contra ele que a variação de cada " +
                    "marcação é medida (CLT art. 58 §1º). Sem horário, o motor " +
                    "compara o saldo do dia."
                  }
                >
                  {item.horario_entrada_minuto === null ||
                  item.horario_saida_minuto === null
                    ? "sem horário fixo"
                    : `${paraHhMm(item.horario_entrada_minuto)} → ${paraHhMm(
                        item.horario_saida_minuto
                      )}`}
                  <br />
                  <small>
                    repouso:{" "}
                    {item.dia_repouso_semana === null
                      ? "sem dia fixo"
                      : DIAS_DA_SEMANA[item.dia_repouso_semana]}{" "}
                    · DSR ÷ {item.dias_uteis_semana}
                  </small>
                </td>
                <td
                  title={
                    "Janela do adicional noturno e duração da hora noturna " +
                    "(CLT art. 73 §1º: 52min30s = 3150 s)."
                  }
                >
                  {formatarRelogio(item.adicional_noturno_inicio_minuto)} →{" "}
                  {formatarRelogio(item.adicional_noturno_fim_minuto)}
                  <br />
                  <small>
                    hora de {Math.floor(item.hora_noturna_segundos / 60)}
                    {item.hora_noturna_segundos % 60 === 0
                      ? ""
                      : `min${item.hora_noturna_segundos % 60}s`}
                    {item.hora_noturna_segundos % 60 === 0 ? " min" : ""}
                  </small>
                </td>
                <td
                  title={
                    "Batida de fechamento antes deste horário do dia seguinte " +
                    "ainda fecha o turno da véspera (turno que vira a noite)."
                  }
                >
                  {item.janela_arraste_minutos === 0
                    ? "desligado"
                    : `${formatarRelogio(item.janela_arraste_minutos)} do dia seguinte`}
                </td>
                <td>
                  {formatarData(item.inicio_vigencia)}
                  {item.fim_vigencia
                    ? ` até ${formatarData(item.fim_vigencia)}`
                    : ""}
                </td>
                <td>{item.status}</td>
                <td>
                  {item.status === "ativa" && (
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      onClick={() => abrirFormulario(item)}
                    >
                      Nova versão
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jornadas.length === 0 && (
              <tr>
                <td colSpan={14}>Nenhuma jornada cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {erro && <p className={estilos.erro}>{erro}</p>}
      {sucesso && <p className={estilos.sucesso}>{sucesso}</p>}

      {!mostrarForm && (
        <div className={estilos.barraAcoes}>
          <button
            className={estilos.botao}
            type="button"
            onClick={() => abrirFormulario(null)}
          >
            Cadastrar jornada nova
          </button>
        </div>
      )}

      {mostrarForm && (
        <>
          <h3>
            {baseadaEm
              ? `Nova versão de ${baseadaEm.codigo}`
              : "Cadastrar jornada nova"}
          </h3>
          <p className={estilos.notaRodape}>
            {baseadaEm
              ? `Os parâmetros vieram da versão ativa de ${baseadaEm.codigo}, em vigor desde ${formatarData(baseadaEm.inicio_vigencia)} — confira cada um antes de gravar. A vigência NÃO foi copiada: ela é sempre nova.`
              : "Nada foi pré-preenchido: não existe versão de onde copiar. Todo número aqui é escolha sua, e é ela que a apuração vai aplicar."}
          </p>
          <form className={estilos.formulario} onSubmit={enviarFormulario}>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="j-codigo">
                Código
              </label>
              <input
                className={estilos.campo}
                id="j-codigo"
                required
                value={form.codigo}
                onChange={(e) => alterar("codigo", e.target.value)}
                placeholder="COMERCIAL-44"
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="j-nome">
                Nome
              </label>
              <input
                className={estilos.campo}
                id="j-nome"
                required
                value={form.nome}
                onChange={(e) => alterar("nome", e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="j-tipo">
                Tipo
              </label>
              <select
                className={estilos.campo}
                id="j-tipo"
                required
                value={form.tipo}
                onChange={(e) => alterar("tipo", e.target.value)}
              >
                <option value="">selecione…</option>
                {TIPOS_JORNADA.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULOS_TIPO_JORNADA[valor]}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                ["carga_diaria", "Carga diária (HH:MM)"],
                ["carga_semanal", "Carga semanal (HH:MM)"],
                ["intervalo_minimo", "Intervalo mín. (min)"],
                ["tolerancia_entrada", "Toler. entrada (min)"],
                ["tolerancia_saida", "Toler. saída (min)"],
              ] as [keyof FormularioJornada, string][]
            ).map(([campo, rotulo]) => (
              <div className={estilos.campoGrupoCurto} key={campo}>
                <label className={estilos.rotulo} htmlFor={`j-${campo}`}>
                  {rotulo}
                </label>
                <input
                  className={estilos.campo}
                  id={`j-${campo}`}
                  required
                  value={String(form[campo])}
                  onChange={(e) => alterar(campo, e.target.value)}
                />
              </div>
            ))}
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="j-not-inicio">
                Noturno de
              </label>
              <input
                className={estilos.campo}
                id="j-not-inicio"
                type="time"
                required
                value={form.adicional_noturno_inicio}
                onChange={(e) =>
                  alterar("adicional_noturno_inicio", e.target.value)
                }
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="j-not-fim">
                até
              </label>
              <input
                className={estilos.campo}
                id="j-not-fim"
                type="time"
                required
                value={form.adicional_noturno_fim}
                onChange={(e) =>
                  alterar("adicional_noturno_fim", e.target.value)
                }
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="j-janela-arraste">
                Arraste até (min)
              </label>
              <input
                className={estilos.campo}
                id="j-janela-arraste"
                value={form.janela_arraste}
                onChange={(e) => alterar("janela_arraste", e.target.value)}
                placeholder="em branco = diária + intervalo"
                title={
                  "Até que minuto do dia seguinte a batida de fechamento ainda " +
                  "encerra o turno da véspera. Em branco, a jornada usa a própria " +
                  "amplitude (carga diária + intervalo mínimo); 0 desliga o arraste."
                }
              />
            </div>

            {/* ------------------------------------------------------------
                OS PARÂMETROS QUE O MOTOR SEMPRE USOU E A TELA NÃO OFERECIA.
                Enquanto não estavam aqui, o banco os adivinhava (trigger da
                0034) e a jornada nascia com hora noturna, divisor de DSR e dia
                de repouso que ninguém tinha escolhido — inclusive em loja de
                folga rotativa, onde o domingo presumido invertia 50% com 100%.
                A 0043 tirou a adivinhação do banco; estes campos são o outro
                lado dela.
            ------------------------------------------------------------- */}
            <div className={estilos.blocoLargo}>
              <p className={estilos.blocoTitulo}>
                Parâmetros legais da jornada — o motor usa os quatro em toda
                apuração
              </p>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="j-hora-noturna">
                  Hora noturna reduzida — segundos por hora ficta
                </label>
                <input
                  className={estilos.campo}
                  id="j-hora-noturna"
                  type="number"
                  min={1}
                  max={3600}
                  step={1}
                  required
                  value={form.hora_noturna_segundos}
                  onChange={(e) =>
                    alterar("hora_noturna_segundos", e.target.value)
                  }
                  placeholder="3150"
                />
                <small className={estilos.blocoExplicacao}>
                  Quanto dura, em segundos, uma hora trabalhada dentro da janela
                  noturna. Urbano: 3150 s (52min30s) — CLT art. 73 §1º, e é o que
                  faz 7 h de relógio valerem 8 h noturnas. Rural: 3600 s, porque
                  a Lei 5.889/73 art. 7º não tem hora reduzida. O sistema não
                  escolhe por você: escolher errado paga adicional a mais ou a
                  menos todo mês.
                </small>
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="j-repouso">
                  Dia de repouso semanal
                </label>
                <select
                  className={estilos.campo}
                  id="j-repouso"
                  required
                  value={form.dia_repouso_semana}
                  onChange={(e) =>
                    alterar("dia_repouso_semana", e.target.value)
                  }
                >
                  <option value="">selecione…</option>
                  {NOMES_DIA_SEMANA.map((nome, dia) => (
                    <option key={nome} value={String(dia)}>
                      {nome}
                    </option>
                  ))}
                  <option value="nenhum">
                    sem dia fixo (plantão 12x36, escala livre)
                  </option>
                </select>
                <small className={estilos.blocoExplicacao}>
                  É ele que decide se a hora trabalhada é extra de 50% ou de
                  100%, e é nele que a semana do DSR começa. Loja que folga na
                  quarta escolhe quarta — não domingo.
                </small>
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="j-dias-uteis">
                  Divisor do DSR (dias trabalhados na semana)
                </label>
                <input
                  className={estilos.campo}
                  id="j-dias-uteis"
                  type="number"
                  min={1}
                  max={7}
                  step={1}
                  required
                  value={form.dias_uteis_semana}
                  onChange={(e) => alterar("dias_uteis_semana", e.target.value)}
                />
                <small className={estilos.blocoExplicacao}>
                  Em quantos dias a carga da semana se reparte: 5 no
                  administrativo 5x2, 6 na loja 6x1, 3 no plantão. O desconto de
                  DSR por falta é carga semanal ÷ este número — pôr 6 onde são 5
                  desconta 440 min onde a lei manda 528.
                </small>
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="j-intervalo-obrig">
                  Intervalo obrigatório acima de (min)
                </label>
                <input
                  className={estilos.campo}
                  id="j-intervalo-obrig"
                  required
                  value={form.intervalo_obrigatorio_acima}
                  onChange={(e) =>
                    alterar("intervalo_obrigatorio_acima", e.target.value)
                  }
                  placeholder="360"
                />
                <small className={estilos.blocoExplicacao}>
                  Acima deste tempo de trabalho no dia, o intervalo passa a ser
                  exigido e a falta dele levanta intercorrência. Regra geral: 360
                  min (6 h), CLT art. 71 caput. Convenção e categoria mudam.
                </small>
              </div>
            </div>

            <div className={estilos.blocoLargo}>
              <p className={estilos.blocoTitulo}>
                Previsto de cada dia da semana (minutos ou HH:MM)
              </p>
              <p className={estilos.blocoExplicacao}>
                Quanto esta jornada manda trabalhar em cada dia — 0 no dia de
                folga. A soma tem de fechar com a carga semanal, e é o que
                impede uma jornada chamada &ldquo;sábado 4h&rdquo; de prever
                7h20 no sábado. Em branco nos 7, o banco deriva do tipo e da
                carga (segunda a sexta na diária, o resto no sábado); com dia de
                repouso escolhido, os 7 são obrigatórios, porque é só com eles
                que dá para conferir que o dia de repouso está com previsto
                zero.{" "}
                {previstoIniciado && (
                  <>
                    Soma atual: <strong>{somaPrevisto} min</strong> — a carga
                    semanal digitada é{" "}
                    <strong>{horaParaMinutos(form.carga_semanal) ?? 0} min</strong>
                    .
                  </>
                )}
              </p>
              {NOMES_DIA_SEMANA.map((nome, dia) => (
                <div className={estilos.campoGrupoMicro} key={nome}>
                  <label className={estilos.rotulo} htmlFor={`j-prev-${dia}`}>
                    {DIAS_DA_SEMANA[dia]}
                  </label>
                  <input
                    className={estilos.campo}
                    id={`j-prev-${dia}`}
                    required={form.dia_repouso_semana !== "nenhum"}
                    value={form.previsto[dia]}
                    onChange={(e) => alterarPrevisto(dia, e.target.value)}
                  />
                </div>
              ))}
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="j-ciclo">
                  Ciclo da escala (dias)
                </label>
                <input
                  className={estilos.campo}
                  id="j-ciclo"
                  type="number"
                  min={1}
                  max={31}
                  value={form.ciclo_dias}
                  onChange={(e) => alterar("ciclo_dias", e.target.value)}
                  placeholder="12x36 = 2"
                />
                <small className={estilos.blocoExplicacao}>
                  Só para jornada SEM padrão semanal: de quantos em quantos dias
                  o plantão se repete. Com ele e a âncora da escala do
                  colaborador, o motor sabe que dia era de trabalho.
                </small>
              </div>
            </div>

            <div className={estilos.blocoLargo}>
              <p className={estilos.blocoTitulo}>
                Horário contratual (opcional, mas é o que mede a variação do art.
                58 §1º)
              </p>
              <p className={estilos.blocoExplicacao}>
                Entrada e saída do contrato, em HH:MM. A saída de quem vira a
                noite passa de 24:00 e se escreve assim: quem entra 19:00 e sai
                07:20 do dia seguinte põe 19:00 e 31:20. Deixando os dois em
                branco, a jornada fica sem horário fixo e o motor compara o saldo
                do dia — e DIZ isso na memória de cálculo. Informe os dois ou
                nenhum.
              </p>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="j-hor-entrada">
                  Entrada
                </label>
                <input
                  className={estilos.campo}
                  id="j-hor-entrada"
                  value={form.horario_entrada}
                  onChange={(e) => alterar("horario_entrada", e.target.value)}
                  placeholder="HH:MM"
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="j-hor-saida">
                  Saída
                </label>
                <input
                  className={estilos.campo}
                  id="j-hor-saida"
                  value={form.horario_saida}
                  onChange={(e) => alterar("horario_saida", e.target.value)}
                  placeholder="HH:MM (passa de 24:00 se virar a noite)"
                />
              </div>
            </div>

            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="j-vigencia">
                Vigência
              </label>
              <input
                className={estilos.campo}
                id="j-vigencia"
                type="date"
                required
                value={form.inicio_vigencia}
                onChange={(e) => alterar("inicio_vigencia", e.target.value)}
              />
            </div>
            <button className={estilos.botao} type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Criar versão"}
            </button>
            <button
              className={estilos.botaoLinha}
              type="button"
              disabled={enviando}
              onClick={() => {
                setMostrarForm(false);
                setForm(JORNADA_EM_BRANCO);
                setBaseadaEm(null);
                setErro(null);
              }}
            >
              Cancelar
            </button>
          </form>
        </>
      )}
    </section>
  );
}

// ============================================================ regras de banco

/**
 * Também EM BRANCO, e pela mesma razão da jornada: prazo de compensação,
 * limites do banco e os fatores de hora extra vinham escritos aqui como "180",
 * "40:00", "20:00", "1.5" e "2", prontos em campos `required`. Limite, fator e
 * prazo — três dos números que o dono do sistema exige que sejam do usuário —
 * eram gravados com um clique, sem ninguém ter escolhido nada, e o 1.5 do
 * fator ainda contradizia o padrão da empresa que a demo semeia.
 */
const REGRA_EM_BRANCO = {
  escopo: "empresa",
  alvo_id: "",
  prazo_compensacao_dias: "",
  limite_positivo: "",
  limite_negativo: "",
  expira_saldo: false,
  tratamento_rescisao: "" as TratamentoRescisao | "",
  fator_he_50: "",
  fator_he_100: "",
  inicio_vigencia: "",
};

type FormularioRegra = typeof REGRA_EM_BRANCO;

const ESCOPO_POR_NIVEL = ["empresa", "unidade", "cargo", "pessoa"];

function semearDaRegra(base: Regra): FormularioRegra {
  return {
    escopo: ESCOPO_POR_NIVEL[base.nivel] ?? "empresa",
    alvo_id: String(
      base.colaborador_id ?? base.cargo_id ?? base.estabelecimento_id ?? ""
    ),
    prazo_compensacao_dias: String(base.prazo_compensacao_dias),
    limite_positivo: paraHhMm(base.limite_positivo_minutos),
    limite_negativo: paraHhMm(base.limite_negativo_minutos),
    expira_saldo: base.expira_saldo,
    tratamento_rescisao: base.tratamento_rescisao,
    fator_he_50: String(base.fator_he_50),
    fator_he_100: String(base.fator_he_100),
    inicio_vigencia: "",
  };
}

function SecaoRegras({
  regras,
  cargos,
  estabelecimentos,
  colaboradores,
  aoMudar,
}: {
  regras: Regra[];
  cargos: Opcao[];
  estabelecimentos: Opcao[];
  colaboradores: Pessoa[];
  aoMudar: () => void;
}) {
  const [form, setForm] = useState<FormularioRegra>(REGRA_EM_BRANCO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [baseadaEm, setBaseadaEm] = useState<Regra | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const padraoDaEmpresa = regras.find(
    (item) => item.status === "ativa" && item.nivel === 0
  );

  function abrirFormulario(base: Regra | null) {
    setForm(base ? semearDaRegra(base) : REGRA_EM_BRANCO);
    setBaseadaEm(base);
    setErro(null);
    setSucesso(null);
    setMostrarForm(true);
  }

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    const alvo = form.alvo_id === "" ? null : Number(form.alvo_id);
    const resultado = await enviarJson("/api/ponto/parametros/regras", {
      estabelecimento_id: form.escopo === "unidade" ? alvo : null,
      cargo_id: form.escopo === "cargo" ? alvo : null,
      colaborador_id: form.escopo === "pessoa" ? alvo : null,
      prazo_compensacao_dias: Number(form.prazo_compensacao_dias),
      limite_positivo: form.limite_positivo,
      limite_negativo: form.limite_negativo,
      expira_saldo: form.expira_saldo,
      tratamento_rescisao: form.tratamento_rescisao,
      fator_he_50: Number(form.fator_he_50),
      fator_he_100: Number(form.fator_he_100),
      inicio_vigencia: form.inicio_vigencia,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setMostrarForm(false);
    setForm(REGRA_EM_BRANCO);
    setBaseadaEm(null);
    setSucesso(
      "Versão de regra criada. A anterior do mesmo escopo foi encerrada na véspera."
    );
    aoMudar();
  }

  return (
    <section className={estilos.cartao}>
      <h2>Regras de banco de horas</h2>
      {!padraoDaEmpresa && (
        <div className={estilos.avisoCritico}>
          <strong>Não há regra ATIVA padrão da empresa.</strong> Sem ela a
          apuração recusa rodar: limite do banco, prazo de compensação, fatores
          de hora extra e o tratamento na rescisão não existem no sistema.
          Cadastre a versão inicial abaixo — os campos abrem em branco de
          propósito, porque cada um sai do acordo ou da convenção coletiva que a
          empresa aplica, e é o DP quem responde por ele.
        </div>
      )}
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Escopo</th>
              <th className={estilos.numero}>Limite +</th>
              <th className={estilos.numero}>Limite −</th>
              <th className={estilos.numero}>Prazo</th>
              <th className={estilos.numero}>Fator 50%</th>
              <th className={estilos.numero}>Fator 100%</th>
              <th>Rescisão</th>
              <th>Vigência</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {regras.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.escopo}</strong>
                </td>
                <td className={estilos.numero}>
                  {formatarMinutos(item.limite_positivo_minutos)}
                </td>
                <td className={estilos.numero}>
                  {formatarMinutos(item.limite_negativo_minutos)}
                </td>
                <td className={estilos.numero}>
                  {item.prazo_compensacao_dias} dias
                </td>
                <td className={estilos.numero}>{item.fator_he_50.toFixed(2)}</td>
                <td className={estilos.numero}>
                  {item.fator_he_100.toFixed(2)}
                </td>
                <td>{ROTULOS_TRATAMENTO_RESCISAO[item.tratamento_rescisao]}</td>
                <td>
                  {formatarData(item.inicio_vigencia)}
                  {item.fim_vigencia
                    ? ` até ${formatarData(item.fim_vigencia)}`
                    : ""}
                </td>
                <td>{item.status}</td>
                <td>
                  {item.status === "ativa" && (
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      onClick={() => abrirFormulario(item)}
                    >
                      Nova versão
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {regras.length === 0 && (
              <tr>
                <td colSpan={10}>
                  Nenhuma regra cadastrada — sem o padrão da empresa a apuração
                  recusa rodar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {erro && <p className={estilos.erro}>{erro}</p>}
      {sucesso && <p className={estilos.sucesso}>{sucesso}</p>}

      {!mostrarForm && (
        <div className={estilos.barraAcoes}>
          <button
            className={estilos.botao}
            type="button"
            onClick={() => abrirFormulario(null)}
          >
            {padraoDaEmpresa
              ? "Cadastrar regra de outro escopo"
              : "Cadastrar a regra padrão da empresa"}
          </button>
        </div>
      )}

      {mostrarForm && (
        <>
          <h3>
            {baseadaEm
              ? `Nova versão da regra de escopo ${baseadaEm.escopo}`
              : "Nova regra"}
          </h3>
          <p className={estilos.notaRodape}>
            {baseadaEm
              ? `Os números vieram da versão ativa em vigor desde ${formatarData(baseadaEm.inicio_vigencia)} — confira antes de gravar. A vigência não foi copiada.`
              : "Nada foi pré-preenchido: não existe versão de onde copiar. Todo número aqui é escolha sua."}
          </p>
          <form className={estilos.formulario} onSubmit={enviarFormulario}>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="r-escopo">
                Escopo
              </label>
              <select
                className={estilos.campo}
                id="r-escopo"
                value={form.escopo}
                onChange={(e) =>
                  setForm({ ...form, escopo: e.target.value, alvo_id: "" })
                }
              >
                <option value="empresa">Padrão da empresa</option>
                <option value="unidade">Unidade</option>
                <option value="cargo">Cargo</option>
                <option value="pessoa">Pessoa</option>
              </select>
            </div>
            {form.escopo !== "empresa" && (
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="r-alvo">
                  {form.escopo === "unidade"
                    ? "Unidade"
                    : form.escopo === "cargo"
                      ? "Cargo"
                      : "Pessoa"}
                </label>
                <select
                  className={estilos.campo}
                  id="r-alvo"
                  required
                  value={form.alvo_id}
                  onChange={(e) => setForm({ ...form, alvo_id: e.target.value })}
                >
                  <option value="">selecione…</option>
                  {form.escopo === "unidade" &&
                    estabelecimentos.map((opcao) => (
                      <option key={opcao.id} value={opcao.id}>
                        {opcao.nome}
                      </option>
                    ))}
                  {form.escopo === "cargo" &&
                    cargos.map((opcao) => (
                      <option key={opcao.id} value={opcao.id}>
                        {opcao.nome}
                      </option>
                    ))}
                  {form.escopo === "pessoa" &&
                    colaboradores.map((pessoa) => (
                      <option key={pessoa.id} value={pessoa.id}>
                        {pessoa.nome_completo} ({pessoa.matricula})
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="r-positivo">
                Limite + (HH:MM)
              </label>
              <input
                className={estilos.campo}
                id="r-positivo"
                required
                value={form.limite_positivo}
                onChange={(e) =>
                  setForm({ ...form, limite_positivo: e.target.value })
                }
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="r-negativo">
                Limite − (HH:MM)
              </label>
              <input
                className={estilos.campo}
                id="r-negativo"
                required
                value={form.limite_negativo}
                onChange={(e) =>
                  setForm({ ...form, limite_negativo: e.target.value })
                }
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="r-prazo">
                Prazo (dias)
              </label>
              <input
                className={estilos.campo}
                id="r-prazo"
                type="number"
                min={1}
                max={730}
                required
                value={form.prazo_compensacao_dias}
                onChange={(e) =>
                  setForm({ ...form, prazo_compensacao_dias: e.target.value })
                }
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="r-f50">
                Fator 50%
              </label>
              <input
                className={estilos.campo}
                id="r-f50"
                type="number"
                step="0.01"
                min={1}
                max={9}
                required
                value={form.fator_he_50}
                onChange={(e) =>
                  setForm({ ...form, fator_he_50: e.target.value })
                }
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="r-f100">
                Fator 100%
              </label>
              <input
                className={estilos.campo}
                id="r-f100"
                type="number"
                step="0.01"
                min={1}
                max={9}
                required
                value={form.fator_he_100}
                onChange={(e) =>
                  setForm({ ...form, fator_he_100: e.target.value })
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="r-rescisao">
                Na rescisão
              </label>
              <select
                className={estilos.campo}
                id="r-rescisao"
                required
                value={form.tratamento_rescisao}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tratamento_rescisao: e.target.value as TratamentoRescisao,
                  })
                }
              >
                <option value="">selecione…</option>
                {TRATAMENTOS_RESCISAO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULOS_TRATAMENTO_RESCISAO[valor]}
                  </option>
                ))}
              </select>
            </div>
            <label className={estilos.caixaMarcar}>
              <input
                type="checkbox"
                checked={form.expira_saldo}
                onChange={(e) =>
                  setForm({ ...form, expira_saldo: e.target.checked })
                }
              />
              saldo expira no fim do prazo
            </label>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="r-vigencia">
                Vigência
              </label>
              <input
                className={estilos.campo}
                id="r-vigencia"
                type="date"
                required
                value={form.inicio_vigencia}
                onChange={(e) =>
                  setForm({ ...form, inicio_vigencia: e.target.value })
                }
              />
            </div>
            <button className={estilos.botao} type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Criar versão"}
            </button>
            <button
              className={estilos.botaoLinha}
              type="button"
              disabled={enviando}
              onClick={() => {
                setMostrarForm(false);
                setForm(REGRA_EM_BRANCO);
                setBaseadaEm(null);
                setErro(null);
              }}
            >
              Cancelar
            </button>
          </form>
        </>
      )}
      <p className={estilos.notaRodape}>
        A regra é resolvida do mais específico para o mais geral: pessoa → cargo
        → unidade → padrão da empresa. O limite barra o lançamento no banco e o
        erro diz o número.
      </p>
    </section>
  );
}
