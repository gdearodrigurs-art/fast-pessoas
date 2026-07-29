"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  formatarMoedaReais,
  NaturezaRubrica,
  ROTULOS_NATUREZA,
  ROTULOS_TABELA_LEGAL,
  ROTULOS_TIPO_CALCULO,
  TipoCalculo,
  TIPOS_CALCULO,
  TipoTabelaLegal,
} from "@/dominios/folha/esquemas";
import estilos from "../folha.module.css";

type StatusVersao = "rascunho" | "ativa" | "encerrada";

interface VersaoRubrica {
  id: number;
  rubrica_id: number;
  incide_inss: boolean;
  incide_irrf: boolean;
  incide_fgts: boolean;
  tipo_calculo: TipoCalculo;
  parametro: number | null;
  status: StatusVersao;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface Rubrica {
  id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  ativo: boolean;
  versoes: VersaoRubrica[];
}

interface VersaoInss {
  id: number;
  faixas: { ate: number; aliquota: number }[];
  teto_contribuicao: number;
  status: StatusVersao;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  conferido_dp: boolean;
}

interface VersaoIrrf {
  id: number;
  faixas: { ate: number | null; aliquota: number; deducao: number }[];
  deducao_por_dependente: number;
  desconto_simplificado: number;
  status: StatusVersao;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  conferido_dp: boolean;
}

interface VersaoGerais {
  id: number;
  salario_minimo: number;
  aliquota_fgts: number;
  status: StatusVersao;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  conferido_dp: boolean;
}

interface SituacaoConferencia {
  tipo: TipoTabelaLegal;
  versao_id: number | null;
  conferido_dp: boolean;
}

interface Visao {
  rubricas: Rubrica[];
  inss: VersaoInss[];
  irrf: VersaoIrrf[];
  gerais: VersaoGerais[];
  conferencia: SituacaoConferencia[];
}

interface DiferencaCaso {
  campo: string;
  esperado: number | null;
  obtido: number | null;
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
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function etiquetaStatus(status: StatusVersao): string {
  if (status === "ativa") return `${estilos.etiqueta} ${estilos.etiquetaAprovada}`;
  if (status === "encerrada") return `${estilos.etiqueta} ${estilos.etiquetaCalculo}`;
  return `${estilos.etiqueta} ${estilos.etiquetaAberta}`;
}

export function PainelParametros() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [suite, setSuite] = useState<ResultadoSuite | null>(null);
  const [rodandoSuite, setRodandoSuite] = useState(false);
  const [erroSuite, setErroSuite] = useState<string | null>(null);

  const [conferindo, setConferindo] = useState<string | null>(null);
  const [erroConferir, setErroConferir] = useState<string | null>(null);

  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/folha/parametros");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os parâmetros.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [versao]);

  async function rodarSuite() {
    setErroSuite(null);
    setRodandoSuite(true);
    try {
      const resposta = await fetch("/api/folha/suite", { method: "POST" });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setSuite(dados as ResultadoSuite);
      } else {
        setErroSuite(dados.erro ?? "Não foi possível rodar a suite.");
      }
    } catch {
      setErroSuite("Falha de conexão. Tente novamente.");
    } finally {
      setRodandoSuite(false);
    }
  }

  async function conferir(tipo: TipoTabelaLegal, versaoId: number) {
    const confirmado = window.confirm(
      `Confirmar que a versão vigente de "${ROTULOS_TABELA_LEGAL[tipo]}" foi conferida pelo DP contra a fonte oficial? Esta confirmação libera a aprovação de competências e fica auditada.`
    );
    if (!confirmado) return;
    setErroConferir(null);
    setConferindo(`${tipo}-${versaoId}`);
    try {
      const resposta = await fetch(
        `/api/folha/parametros/tabelas/${tipo}/${versaoId}/conferir`,
        { method: "POST" }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        recarregar();
      } else {
        setErroConferir(dados.erro ?? "Não foi possível marcar como conferida.");
      }
    } catch {
      setErroConferir("Falha de conexão. Tente novamente.");
    } finally {
      setConferindo(null);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/folha">
          Competências
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Parâmetros da folha</h1>
        <p className={estilos.subtitulo}>
          Rubricas e tabelas legais versionadas com vigência — mudança é sempre
          versão NOVA; o que já vigorou nunca é editado.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

        {!carregando && visao && (
          <>
            <SecaoConferencia
              visao={visao}
              conferindo={conferindo}
              erroConferir={erroConferir}
              aoConferir={conferir}
            />

            <section className={estilos.cartao}>
              <h2>Suite de casos de teste do motor</h2>
              <p className={estilos.notaRodape}>
                Roda os casos de rh_folha.caso_teste_folha contra o motor com as
                versões vigentes. Tabela nova derrubando a suite é o alarme
                desenhado — revise os casos junto da tabela.
              </p>
              <div className={estilos.barraAcoes}>
                <button
                  className={estilos.botao}
                  type="button"
                  disabled={rodandoSuite}
                  onClick={rodarSuite}
                >
                  {rodandoSuite ? "Rodando…" : "Rodar suite"}
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
                          <th>Diferenças (esperado → obtido)</th>
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
                                  {diferenca.esperado ?? "ausente"} →{" "}
                                  {diferenca.obtido ?? "ausente"}
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

            <SecaoRubricas rubricas={visao.rubricas} aoMudar={recarregar} />
            <SecaoTabelaInss versoes={visao.inss} aoMudar={recarregar} />
            <SecaoTabelaIrrf versoes={visao.irrf} aoMudar={recarregar} />
            <SecaoParametrosGerais versoes={visao.gerais} aoMudar={recarregar} />
          </>
        )}

        <p className={estilos.notaRodape}>
          Toda versão nova de tabela legal entra NÃO conferida — a aprovação de
          competências fica bloqueada até o DP conferir contra a fonte oficial.
        </p>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ conferência do DP

function SecaoConferencia({
  visao,
  conferindo,
  erroConferir,
  aoConferir,
}: {
  visao: Visao;
  conferindo: string | null;
  erroConferir: string | null;
  aoConferir: (tipo: TipoTabelaLegal, versaoId: number) => void;
}) {
  return (
    <section className={estilos.cartao}>
      <h2>Conferência do DP — gate da aprovação</h2>
      {erroConferir && <p className={estilos.erro}>{erroConferir}</p>}
      <div className={estilos.cartoesResumo}>
        {visao.conferencia.map((situacao) => (
          <div
            key={situacao.tipo}
            className={
              situacao.versao_id === null || !situacao.conferido_dp
                ? `${estilos.cartaoResumo} ${estilos.cartaoResumoDestaque}`
                : estilos.cartaoResumo
            }
          >
            <strong>
              {situacao.versao_id === null
                ? "SEM VIGENTE"
                : situacao.conferido_dp
                  ? "Conferida"
                  : "NÃO conferida"}
            </strong>
            <span>{ROTULOS_TABELA_LEGAL[situacao.tipo]}</span>
            {situacao.versao_id !== null && !situacao.conferido_dp && (
              <div>
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  disabled={conferindo !== null}
                  onClick={() => aoConferir(situacao.tipo, situacao.versao_id as number)}
                >
                  {conferindo === `${situacao.tipo}-${situacao.versao_id}`
                    ? "Marcando…"
                    : "Marcar como conferida pelo DP"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ envio genérico

async function enviarJson(
  caminho: string,
  corpo: unknown
): Promise<{ ok: boolean; erro: string | null }> {
  try {
    const resposta = await fetch(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok) return { ok: true, erro: null };
    return { ok: false, erro: dados.erro ?? "A operação falhou." };
  } catch {
    return { ok: false, erro: "Falha de conexão. Tente novamente." };
  }
}

// ------------------------------------------------------------------ rubricas

function SecaoRubricas({
  rubricas,
  aoMudar,
}: {
  rubricas: Rubrica[];
  aoMudar: () => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [incideInss, setIncideInss] = useState(true);
  const [incideIrrf, setIncideIrrf] = useState(true);
  const [incideFgts, setIncideFgts] = useState(true);
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculo>("valor_informado");
  const [parametro, setParametro] = useState("");
  const [inicio, setInicio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  function comecarEdicao(rubrica: Rubrica) {
    const ativa = rubrica.versoes.find((item) => item.status === "ativa");
    setEditando(rubrica.id);
    setIncideInss(ativa?.incide_inss ?? true);
    setIncideIrrf(ativa?.incide_irrf ?? true);
    setIncideFgts(ativa?.incide_fgts ?? true);
    setTipoCalculo(ativa?.tipo_calculo ?? "valor_informado");
    setParametro(ativa?.parametro !== null && ativa !== undefined ? String(ativa?.parametro ?? "") : "");
    setInicio("");
    setErroEnvio(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (editando === null) return;
    setErroEnvio(null);
    setEnviando(true);
    const precisaParametro =
      tipoCalculo === "percentual_salario" || tipoCalculo === "horas_adicional";
    const resultado = await enviarJson(
      `/api/folha/parametros/rubricas/${editando}/versoes`,
      {
        incide_inss: incideInss,
        incide_irrf: incideIrrf,
        incide_fgts: incideFgts,
        tipo_calculo: tipoCalculo,
        parametro: precisaParametro && parametro !== "" ? Number(parametro) : null,
        inicio_vigencia: inicio,
      }
    );
    setEnviando(false);
    if (resultado.ok) {
      setEditando(null);
      aoMudar();
    } else {
      setErroEnvio(resultado.erro);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>Catálogo de rubricas</h2>
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Rubrica</th>
              <th>Natureza</th>
              <th>Versão vigente</th>
              <th>Incidências</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rubricas.map((rubrica) => {
              const ativa = rubrica.versoes.find((item) => item.status === "ativa");
              return (
                <tr key={rubrica.id}>
                  <td>
                    <strong>{rubrica.codigo}</strong>
                  </td>
                  <td>
                    {rubrica.nome}
                    {!rubrica.ativo && (
                      <span className={estilos.etiqueta}> inativa</span>
                    )}
                  </td>
                  <td>{ROTULOS_NATUREZA[rubrica.natureza]}</td>
                  <td>
                    {ativa ? (
                      <>
                        {ROTULOS_TIPO_CALCULO[ativa.tipo_calculo]}
                        {ativa.parametro !== null && ` (parâmetro ${ativa.parametro})`}
                        <br />
                        <span className={estilos.notaRodape}>
                          desde {formatarData(ativa.inicio_vigencia)} —{" "}
                          {rubrica.versoes.length} versão(ões)
                        </span>
                      </>
                    ) : (
                      "sem versão vigente"
                    )}
                  </td>
                  <td>
                    {ativa
                      ? `INSS ${ativa.incide_inss ? "✓" : "✗"} · IRRF ${ativa.incide_irrf ? "✓" : "✗"} · FGTS ${ativa.incide_fgts ? "✓" : "✗"}`
                      : "—"}
                  </td>
                  <td>
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      onClick={() => comecarEdicao(rubrica)}
                    >
                      Nova versão
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando !== null && (
        <form className={estilos.formulario} onSubmit={enviar}>
          <h3 style={{ flexBasis: "100%" }}>
            Nova versão de{" "}
            {rubricas.find((rubrica) => rubrica.id === editando)?.codigo} —{" "}
            {rubricas.find((rubrica) => rubrica.id === editando)?.nome}
          </h3>
          <label className={estilos.caixaMarcar}>
            <input
              type="checkbox"
              checked={incideInss}
              onChange={(e) => setIncideInss(e.target.checked)}
            />
            Incide INSS
          </label>
          <label className={estilos.caixaMarcar}>
            <input
              type="checkbox"
              checked={incideIrrf}
              onChange={(e) => setIncideIrrf(e.target.checked)}
            />
            Incide IRRF
          </label>
          <label className={estilos.caixaMarcar}>
            <input
              type="checkbox"
              checked={incideFgts}
              onChange={(e) => setIncideFgts(e.target.checked)}
            />
            Incide FGTS
          </label>
          <div className={estilos.campoGrupo}>
            <label className={estilos.rotulo} htmlFor="tipo-calculo">
              Tipo de cálculo
            </label>
            <select
              className={estilos.campo}
              id="tipo-calculo"
              value={tipoCalculo}
              onChange={(e) => setTipoCalculo(e.target.value as TipoCalculo)}
            >
              {TIPOS_CALCULO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ROTULOS_TIPO_CALCULO[tipo]}
                </option>
              ))}
            </select>
          </div>
          {(tipoCalculo === "percentual_salario" ||
            tipoCalculo === "horas_adicional") && (
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="parametro">
                {tipoCalculo === "horas_adicional" ? "Fator (ex.: 1.5)" : "Percentual"}
              </label>
              <input
                className={estilos.campo}
                id="parametro"
                type="number"
                min={0.0001}
                step={0.0001}
                required
                value={parametro}
                onChange={(e) => setParametro(e.target.value)}
              />
            </div>
          )}
          <div className={estilos.campoGrupoCurto}>
            <label className={estilos.rotulo} htmlFor="inicio-rubrica">
              Início de vigência
            </label>
            <input
              className={estilos.campo}
              id="inicio-rubrica"
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <button className={estilos.botao} type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Criar versão"}
          </button>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => setEditando(null)}
          >
            Cancelar
          </button>
          {erroEnvio && (
            <p className={estilos.erro} style={{ flexBasis: "100%" }}>
              {erroEnvio}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ tabela INSS

function SecaoTabelaInss({
  versoes,
  aoMudar,
}: {
  versoes: VersaoInss[];
  aoMudar: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [faixas, setFaixas] = useState<{ ate: string; aliquota: string }[]>([
    { ate: "", aliquota: "" },
  ]);
  const [inicio, setInicio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroEnvio(null);
    setEnviando(true);
    const faixasNumericas = faixas.map((faixa) => ({
      ate: Number(faixa.ate),
      aliquota: Number(faixa.aliquota),
    }));
    const resultado = await enviarJson("/api/folha/parametros/tabelas/inss", {
      faixas: faixasNumericas,
      // A última faixa fecha no teto de contribuição — regra da tabela.
      teto_contribuicao: faixasNumericas[faixasNumericas.length - 1]?.ate ?? 0,
      inicio_vigencia: inicio,
    });
    setEnviando(false);
    if (resultado.ok) {
      setMostrarForm(false);
      setFaixas([{ ate: "", aliquota: "" }]);
      setInicio("");
      aoMudar();
    } else {
      setErroEnvio(resultado.erro);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>Tabela INSS (progressiva, com teto)</h2>
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Situação</th>
              <th>Faixas</th>
              <th className={estilos.numero}>Teto</th>
              <th>Vigência</th>
              <th>Conferida pelo DP</th>
            </tr>
          </thead>
          <tbody>
            {versoes.map((versaoTabela) => (
              <tr key={versaoTabela.id}>
                <td>
                  <span className={etiquetaStatus(versaoTabela.status)}>
                    {versaoTabela.status}
                  </span>
                </td>
                <td>
                  {versaoTabela.faixas.map((faixa, indice) => (
                    <div key={indice}>
                      até {formatarMoedaReais(faixa.ate)}: {faixa.aliquota}%
                    </div>
                  ))}
                </td>
                <td className={estilos.numero}>
                  {formatarMoedaReais(versaoTabela.teto_contribuicao)}
                </td>
                <td>
                  {formatarData(versaoTabela.inicio_vigencia)}
                  {versaoTabela.fim_vigencia
                    ? ` a ${formatarData(versaoTabela.fim_vigencia)}`
                    : " em diante"}
                </td>
                <td>{versaoTabela.conferido_dp ? "Sim" : "NÃO"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mostrarForm && (
        <div className={estilos.barraAcoes}>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => setMostrarForm(true)}
          >
            Nova versão da tabela INSS
          </button>
        </div>
      )}
      {mostrarForm && (
        <form onSubmit={enviar}>
          <h3>Nova versão — faixas em ordem crescente; a última é o teto</h3>
          {faixas.map((faixa, indice) => (
            <div key={indice} className={estilos.faixaLinha}>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo}>Até (R$)</label>
                <input
                  className={estilos.campo}
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={faixa.ate}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((atual, i) =>
                        i === indice ? { ...atual, ate: e.target.value } : atual
                      )
                    )
                  }
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo}>Alíquota (%)</label>
                <input
                  className={estilos.campo}
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={faixa.aliquota}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((atual, i) =>
                        i === indice
                          ? { ...atual, aliquota: e.target.value }
                          : atual
                      )
                    )
                  }
                />
              </div>
              <button
                className={estilos.botaoLinha}
                type="button"
                onClick={() => setFaixas(faixas.filter((_, i) => i !== indice))}
                disabled={faixas.length === 1}
              >
                Remover
              </button>
            </div>
          ))}
          <div className={estilos.formulario}>
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={() => setFaixas([...faixas, { ate: "", aliquota: "" }])}
            >
              Adicionar faixa
            </button>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="inicio-inss">
                Início de vigência
              </label>
              <input
                className={estilos.campo}
                id="inicio-inss"
                type="date"
                required
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <button className={estilos.botao} type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Criar versão (entra NÃO conferida)"}
            </button>
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={() => setMostrarForm(false)}
            >
              Cancelar
            </button>
          </div>
          {erroEnvio && <p className={estilos.erro}>{erroEnvio}</p>}
        </form>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ tabela IRRF

function SecaoTabelaIrrf({
  versoes,
  aoMudar,
}: {
  versoes: VersaoIrrf[];
  aoMudar: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [faixas, setFaixas] = useState<
    { ate: string; aliquota: string; deducao: string }[]
  >([{ ate: "", aliquota: "", deducao: "" }]);
  const [deducaoDependente, setDeducaoDependente] = useState("");
  const [descontoSimplificado, setDescontoSimplificado] = useState("");
  const [inicio, setInicio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroEnvio(null);
    setEnviando(true);
    const resultado = await enviarJson("/api/folha/parametros/tabelas/irrf", {
      faixas: faixas.map((faixa, indice) => ({
        // Última faixa sempre aberta (sem teto) — campo "até" ignorado nela.
        ate: indice === faixas.length - 1 ? null : Number(faixa.ate),
        aliquota: Number(faixa.aliquota),
        deducao: Number(faixa.deducao || 0),
      })),
      deducao_por_dependente: Number(deducaoDependente),
      desconto_simplificado: Number(descontoSimplificado),
      inicio_vigencia: inicio,
    });
    setEnviando(false);
    if (resultado.ok) {
      setMostrarForm(false);
      setFaixas([{ ate: "", aliquota: "", deducao: "" }]);
      setDeducaoDependente("");
      setDescontoSimplificado("");
      setInicio("");
      aoMudar();
    } else {
      setErroEnvio(resultado.erro);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>Tabela IRRF (faixas, dedução por dependente, desconto simplificado)</h2>
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Situação</th>
              <th>Faixas (alíquota − parcela a deduzir)</th>
              <th className={estilos.numero}>Dedução/dependente</th>
              <th className={estilos.numero}>Desc. simplificado</th>
              <th>Vigência</th>
              <th>Conferida pelo DP</th>
            </tr>
          </thead>
          <tbody>
            {versoes.map((versaoTabela) => (
              <tr key={versaoTabela.id}>
                <td>
                  <span className={etiquetaStatus(versaoTabela.status)}>
                    {versaoTabela.status}
                  </span>
                </td>
                <td>
                  {versaoTabela.faixas.map((faixa, indice) => (
                    <div key={indice}>
                      até {faixa.ate === null ? "∞" : formatarMoedaReais(faixa.ate)}:{" "}
                      {faixa.aliquota}% − {formatarMoedaReais(faixa.deducao)}
                    </div>
                  ))}
                </td>
                <td className={estilos.numero}>
                  {formatarMoedaReais(versaoTabela.deducao_por_dependente)}
                </td>
                <td className={estilos.numero}>
                  {formatarMoedaReais(versaoTabela.desconto_simplificado)}
                </td>
                <td>
                  {formatarData(versaoTabela.inicio_vigencia)}
                  {versaoTabela.fim_vigencia
                    ? ` a ${formatarData(versaoTabela.fim_vigencia)}`
                    : " em diante"}
                </td>
                <td>{versaoTabela.conferido_dp ? "Sim" : "NÃO"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mostrarForm && (
        <div className={estilos.barraAcoes}>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => setMostrarForm(true)}
          >
            Nova versão da tabela IRRF
          </button>
        </div>
      )}
      {mostrarForm && (
        <form onSubmit={enviar}>
          <h3>Nova versão — a última faixa é aberta (sem teto)</h3>
          {faixas.map((faixa, indice) => (
            <div key={indice} className={estilos.faixaLinha}>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo}>
                  {indice === faixas.length - 1 ? "Até (∞)" : "Até (R$)"}
                </label>
                <input
                  className={estilos.campo}
                  type="number"
                  min={0.01}
                  step={0.01}
                  required={indice !== faixas.length - 1}
                  disabled={indice === faixas.length - 1}
                  value={indice === faixas.length - 1 ? "" : faixa.ate}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((atual, i) =>
                        i === indice ? { ...atual, ate: e.target.value } : atual
                      )
                    )
                  }
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo}>Alíquota (%)</label>
                <input
                  className={estilos.campo}
                  type="number"
                  min={0}
                  step={0.01}
                  required
                  value={faixa.aliquota}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((atual, i) =>
                        i === indice
                          ? { ...atual, aliquota: e.target.value }
                          : atual
                      )
                    )
                  }
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo}>Parcela a deduzir (R$)</label>
                <input
                  className={estilos.campo}
                  type="number"
                  min={0}
                  step={0.01}
                  value={faixa.deducao}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((atual, i) =>
                        i === indice
                          ? { ...atual, deducao: e.target.value }
                          : atual
                      )
                    )
                  }
                />
              </div>
              <button
                className={estilos.botaoLinha}
                type="button"
                onClick={() => setFaixas(faixas.filter((_, i) => i !== indice))}
                disabled={faixas.length === 1}
              >
                Remover
              </button>
            </div>
          ))}
          <div className={estilos.formulario}>
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={() =>
                setFaixas([...faixas, { ate: "", aliquota: "", deducao: "" }])
              }
            >
              Adicionar faixa
            </button>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="deducao-dependente">
                Dedução/dependente (R$)
              </label>
              <input
                className={estilos.campo}
                id="deducao-dependente"
                type="number"
                min={0}
                step={0.01}
                required
                value={deducaoDependente}
                onChange={(e) => setDeducaoDependente(e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="desconto-simplificado">
                Desconto simplificado (R$)
              </label>
              <input
                className={estilos.campo}
                id="desconto-simplificado"
                type="number"
                min={0}
                step={0.01}
                required
                value={descontoSimplificado}
                onChange={(e) => setDescontoSimplificado(e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="inicio-irrf">
                Início de vigência
              </label>
              <input
                className={estilos.campo}
                id="inicio-irrf"
                type="date"
                required
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <button className={estilos.botao} type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Criar versão (entra NÃO conferida)"}
            </button>
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={() => setMostrarForm(false)}
            >
              Cancelar
            </button>
          </div>
          {erroEnvio && <p className={estilos.erro}>{erroEnvio}</p>}
        </form>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ parâmetros gerais

function SecaoParametrosGerais({
  versoes,
  aoMudar,
}: {
  versoes: VersaoGerais[];
  aoMudar: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salarioMinimo, setSalarioMinimo] = useState("");
  const [aliquotaFgts, setAliquotaFgts] = useState("8");
  const [inicio, setInicio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroEnvio(null);
    setEnviando(true);
    const resultado = await enviarJson("/api/folha/parametros/tabelas/gerais", {
      salario_minimo: Number(salarioMinimo),
      aliquota_fgts: Number(aliquotaFgts),
      inicio_vigencia: inicio,
    });
    setEnviando(false);
    if (resultado.ok) {
      setMostrarForm(false);
      setSalarioMinimo("");
      setAliquotaFgts("8");
      setInicio("");
      aoMudar();
    } else {
      setErroEnvio(resultado.erro);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>Parâmetros gerais (salário mínimo, alíquota FGTS)</h2>
      <div className={estilos.tabelaEnvolucro}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Situação</th>
              <th className={estilos.numero}>Salário mínimo</th>
              <th className={estilos.numero}>Alíquota FGTS</th>
              <th>Vigência</th>
              <th>Conferida pelo DP</th>
            </tr>
          </thead>
          <tbody>
            {versoes.map((versaoTabela) => (
              <tr key={versaoTabela.id}>
                <td>
                  <span className={etiquetaStatus(versaoTabela.status)}>
                    {versaoTabela.status}
                  </span>
                </td>
                <td className={estilos.numero}>
                  {formatarMoedaReais(versaoTabela.salario_minimo)}
                </td>
                <td className={estilos.numero}>{versaoTabela.aliquota_fgts}%</td>
                <td>
                  {formatarData(versaoTabela.inicio_vigencia)}
                  {versaoTabela.fim_vigencia
                    ? ` a ${formatarData(versaoTabela.fim_vigencia)}`
                    : " em diante"}
                </td>
                <td>{versaoTabela.conferido_dp ? "Sim" : "NÃO"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mostrarForm && (
        <div className={estilos.barraAcoes}>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => setMostrarForm(true)}
          >
            Nova versão dos parâmetros
          </button>
        </div>
      )}
      {mostrarForm && (
        <form className={estilos.formulario} onSubmit={enviar}>
          <div className={estilos.campoGrupoCurto}>
            <label className={estilos.rotulo} htmlFor="salario-minimo">
              Salário mínimo (R$)
            </label>
            <input
              className={estilos.campo}
              id="salario-minimo"
              type="number"
              min={0.01}
              step={0.01}
              required
              value={salarioMinimo}
              onChange={(e) => setSalarioMinimo(e.target.value)}
            />
          </div>
          <div className={estilos.campoGrupoCurto}>
            <label className={estilos.rotulo} htmlFor="aliquota-fgts">
              Alíquota FGTS (%)
            </label>
            <input
              className={estilos.campo}
              id="aliquota-fgts"
              type="number"
              min={0.01}
              step={0.01}
              required
              value={aliquotaFgts}
              onChange={(e) => setAliquotaFgts(e.target.value)}
            />
          </div>
          <div className={estilos.campoGrupoCurto}>
            <label className={estilos.rotulo} htmlFor="inicio-gerais">
              Início de vigência
            </label>
            <input
              className={estilos.campo}
              id="inicio-gerais"
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <button className={estilos.botao} type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Criar versão (entra NÃO conferida)"}
          </button>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={() => setMostrarForm(false)}
          >
            Cancelar
          </button>
          {erroEnvio && <p className={estilos.erro}>{erroEnvio}</p>}
        </form>
      )}
    </section>
  );
}
