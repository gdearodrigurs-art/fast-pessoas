"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  Direcao,
  DIRECOES,
  ESCOPO_GLOBAL,
  formatarValorMeta,
  ROTULOS_DIRECAO,
  ROTULOS_UNIDADE_MEDIDA,
  UNIDADES_MEDIDA,
  UnidadeMedida,
} from "@/dominios/indicadores/esquemas";
import estilos from "./page.module.css";

interface MetaVigente {
  id: number;
  escopo: string;
  valor: number;
  inicio_vigencia: string;
}

interface Indicador {
  id: number;
  chave: string;
  nome: string;
  area: string;
  descricao: string;
  unidade: UnidadeMedida;
  direcao: Direcao;
  meta_global: MetaVigente | null;
  metas_unidade: MetaVigente[];
}

interface ValorIndicador {
  chave: string;
  valor: number | null;
  valor_formatado: string | null;
  detalhe: string | null;
  situacao: "dentro" | "fora" | "sem_meta" | "sem_dados";
}

interface VersaoMeta {
  id: number;
  escopo: string;
  valor: number;
  inicio_vigencia: string;
  status: "ativa" | "encerrada";
  criado_em: string;
  criado_por_nome: string;
}

interface Central {
  indicadores: Indicador[];
  unidades: string[];
  pode_administrar: boolean;
}

const OPCAO_NOVA_AREA = "__nova_area__";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export function PainelMetas() {
  const [central, setCentral] = useState<Central | null>(null);
  const [valores, setValores] = useState<Record<string, ValorIndicador>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [historicos, setHistoricos] = useState<
    Record<number, VersaoMeta[] | "carregando" | "erro">
  >({});

  const [indicadorEmEdicao, setIndicadorEmEdicao] = useState<Indicador | null>(
    null
  );
  const [fEscopo, setFEscopo] = useState(ESCOPO_GLOBAL);
  const [fValor, setFValor] = useState("");
  const [fVigencia, setFVigencia] = useState("");
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [erroMeta, setErroMeta] = useState<string | null>(null);

  const [criandoIndicador, setCriandoIndicador] = useState(false);
  const [iNome, setINome] = useState("");
  const [iArea, setIArea] = useState("");
  const [iAreaNova, setIAreaNova] = useState("");
  const [iDescricao, setIDescricao] = useState("");
  const [iUnidade, setIUnidade] = useState<UnidadeMedida>("%");
  const [iDirecao, setIDirecao] = useState<Direcao>("maior");
  const [salvandoIndicador, setSalvandoIndicador] = useState(false);
  const [erroIndicador, setErroIndicador] = useState<string | null>(null);

  const carregarCentral = useCallback(async (): Promise<Central | null> => {
    const resposta = await fetch("/api/indicadores");
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(dados.erro ?? "Não foi possível carregar as metas.");
    }
    return dados as Central;
  }, []);

  // Valores atuais são complemento: falha aqui não derruba a página —
  // as linhas sem valor apenas mostram "sem dados".
  const carregarValores = useCallback(async (): Promise<
    Record<string, ValorIndicador>
  > => {
    try {
      const resposta = await fetch("/api/indicadores/valores");
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) return {};
      const porChave: Record<string, ValorIndicador> = {};
      for (const valor of (dados.valores ?? []) as ValorIndicador[]) {
        porChave[valor.chave] = valor;
      }
      return porChave;
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [dados, valoresAtuais] = await Promise.all([
          carregarCentral(),
          carregarValores(),
        ]);
        if (ativo) {
          setCentral(dados);
          setValores(valoresAtuais);
        }
      } catch (falha) {
        if (ativo) {
          setErro(
            falha instanceof Error
              ? falha.message
              : "Falha de conexão. Recarregue a página."
          );
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [carregarCentral, carregarValores]);

  async function recarregar() {
    try {
      const [dados, valoresAtuais] = await Promise.all([
        carregarCentral(),
        carregarValores(),
      ]);
      setCentral(dados);
      setValores(valoresAtuais);
      setErro(null);
    } catch (falha) {
      setErro(
        falha instanceof Error
          ? falha.message
          : "Falha de conexão. Recarregue a página."
      );
    }
  }

  async function buscarHistorico(indicadorId: number) {
    setHistoricos((atual) => ({ ...atual, [indicadorId]: "carregando" }));
    try {
      const resposta = await fetch(`/api/indicadores/${indicadorId}/metas`);
      const dados = await resposta.json().catch(() => ({}));
      setHistoricos((atual) => ({
        ...atual,
        [indicadorId]: resposta.ok
          ? ((dados.versoes ?? []) as VersaoMeta[])
          : "erro",
      }));
    } catch {
      setHistoricos((atual) => ({ ...atual, [indicadorId]: "erro" }));
    }
  }

  function alternarHistorico(indicadorId: number) {
    if (historicos[indicadorId] !== undefined) {
      setHistoricos((atual) => {
        const proximo = { ...atual };
        delete proximo[indicadorId];
        return proximo;
      });
      return;
    }
    void buscarHistorico(indicadorId);
  }

  function abrirDialogoMeta(indicador: Indicador) {
    setIndicadorEmEdicao(indicador);
    setFEscopo(ESCOPO_GLOBAL);
    setFValor(
      indicador.meta_global ? String(indicador.meta_global.valor) : ""
    );
    setFVigencia(hojeEmSaoPaulo());
    setErroMeta(null);
  }

  function aoTrocarEscopo(indicador: Indicador, escopo: string) {
    setFEscopo(escopo);
    const vigente =
      escopo === ESCOPO_GLOBAL
        ? indicador.meta_global
        : indicador.metas_unidade.find((meta) => meta.escopo === escopo);
    setFValor(vigente ? String(vigente.valor) : "");
  }

  async function salvarMeta(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!indicadorEmEdicao) return;
    const valorNumerico = Number(fValor);
    if (!Number.isFinite(valorNumerico)) {
      setErroMeta("Informe um valor numérico para a meta.");
      return;
    }
    setSalvandoMeta(true);
    setErroMeta(null);
    try {
      const resposta = await fetch(
        `/api/indicadores/${indicadorEmEdicao.id}/metas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            escopo: fEscopo,
            valor: valorNumerico,
            inicio_vigencia: fVigencia,
          }),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroMeta(dados.erro ?? "Não foi possível salvar a meta.");
        return;
      }
      const indicadorId = indicadorEmEdicao.id;
      setIndicadorEmEdicao(null);
      await recarregar();
      if (historicos[indicadorId] !== undefined) {
        await buscarHistorico(indicadorId);
      }
    } catch {
      setErroMeta("Falha de conexão. Tente novamente.");
    } finally {
      setSalvandoMeta(false);
    }
  }

  function abrirDialogoIndicador() {
    setINome("");
    setIArea(areas[0] ?? OPCAO_NOVA_AREA);
    setIAreaNova("");
    setIDescricao("");
    setIUnidade("%");
    setIDirecao("maior");
    setErroIndicador(null);
    setCriandoIndicador(true);
  }

  async function salvarIndicador(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const area = iArea === OPCAO_NOVA_AREA ? iAreaNova.trim() : iArea;
    if (!area) {
      setErroIndicador("Informe a área do indicador.");
      return;
    }
    setSalvandoIndicador(true);
    setErroIndicador(null);
    try {
      const resposta = await fetch("/api/indicadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: iNome,
          area,
          descricao: iDescricao.trim() || undefined,
          unidade: iUnidade,
          direcao: iDirecao,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroIndicador(dados.erro ?? "Não foi possível criar o indicador.");
        return;
      }
      setCriandoIndicador(false);
      await recarregar();
    } catch {
      setErroIndicador("Falha de conexão. Tente novamente.");
    } finally {
      setSalvandoIndicador(false);
    }
  }

  const areas: string[] = [];
  for (const indicador of central?.indicadores ?? []) {
    if (!areas.includes(indicador.area)) {
      areas.push(indicador.area);
    }
  }
  const podeAdministrar = central?.pode_administrar ?? false;

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.tituloLinha}>
          <div>
            <h1>Metas de Indicadores</h1>
            <p className={estilos.subtitulo}>
              Catálogo de indicadores de RH com metas versionadas por vigência.
            </p>
          </div>
          {podeAdministrar && (
            <button
              className={estilos.botao}
              type="button"
              onClick={abrirDialogoIndicador}
            >
              + Novo indicador
            </button>
          )}
        </div>

        <div className={estilos.aviso}>
          Nenhuma meta é fixa no sistema: tudo nesta página é{" "}
          <b>dado administrável pelo RH</b>. Alterar uma meta nunca sobrescreve
          a anterior — <b>cria uma nova versão com data de início de vigência</b>;
          períodos já apurados continuam avaliados pela meta que valia na época.
          Metas podem ser globais ou específicas por unidade.
        </div>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}
        {!carregando && central && central.indicadores.length === 0 && (
          <p className={estilos.subtitulo}>Nenhum indicador cadastrado.</p>
        )}

        {areas.map((area) => (
          <section className={estilos.area} key={area}>
            <h2 className={estilos.tituloArea}>{area}</h2>
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th className={estilos.colunaIndicador}>Indicador</th>
                    <th>Meta vigente</th>
                    <th>Valor atual</th>
                    <th>Vigência</th>
                    <th className={estilos.colunaAcoes}></th>
                  </tr>
                </thead>
                <tbody>
                  {central?.indicadores
                    .filter((indicador) => indicador.area === area)
                    .map((indicador) => {
                      const historico = historicos[indicador.id];
                      return (
                        <IndicadorLinha
                          key={indicador.id}
                          indicador={indicador}
                          valorAtual={valores[indicador.chave]}
                          historico={historico}
                          podeAdministrar={podeAdministrar}
                          aoDefinirMeta={() => abrirDialogoMeta(indicador)}
                          aoAlternarHistorico={() =>
                            alternarHistorico(indicador.id)
                          }
                        />
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </main>

      {indicadorEmEdicao && (
        <div className={estilos.fundoDialogo}>
          <div
            className={estilos.dialogo}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-dialogo-meta"
          >
            <h3 id="titulo-dialogo-meta">Meta — {indicadorEmEdicao.nome}</h3>
            <p className={estilos.subDialogo}>
              Salvar cria uma NOVA versão com vigência; a anterior é encerrada,
              nunca apagada.
            </p>
            <form onSubmit={salvarMeta}>
              <label className={estilos.rotulo} htmlFor="meta-escopo">
                Escopo
              </label>
              <select
                className={estilos.campo}
                id="meta-escopo"
                value={fEscopo}
                onChange={(e) =>
                  aoTrocarEscopo(indicadorEmEdicao, e.target.value)
                }
              >
                <option value={ESCOPO_GLOBAL}>
                  Global (todas as unidades)
                </option>
                {central?.unidades.map((unidade) => (
                  <option key={unidade} value={unidade}>
                    {unidade}
                  </option>
                ))}
              </select>

              <label className={estilos.rotulo} htmlFor="meta-valor">
                Meta ({indicadorEmEdicao.unidade}) —{" "}
                {ROTULOS_DIRECAO[indicadorEmEdicao.direcao].toLowerCase()}
              </label>
              <input
                className={estilos.campo}
                id="meta-valor"
                type="number"
                step="0.1"
                min="0"
                required
                placeholder="ex.: 90"
                value={fValor}
                onChange={(e) => setFValor(e.target.value)}
              />

              <label className={estilos.rotulo} htmlFor="meta-vigencia">
                Início de vigência
              </label>
              <input
                className={estilos.campo}
                id="meta-vigencia"
                type="date"
                required
                value={fVigencia}
                onChange={(e) => setFVigencia(e.target.value)}
              />

              {erroMeta && <p className={estilos.erro}>{erroMeta}</p>}
              <div className={estilos.acoesDialogo}>
                <button
                  className={estilos.botaoSecundario}
                  type="button"
                  onClick={() => setIndicadorEmEdicao(null)}
                >
                  Cancelar
                </button>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={salvandoMeta}
                >
                  {salvandoMeta ? "Salvando…" : "Salvar nova versão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {criandoIndicador && (
        <div className={estilos.fundoDialogo}>
          <div
            className={estilos.dialogo}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-dialogo-indicador"
          >
            <h3 id="titulo-dialogo-indicador">Novo indicador</h3>
            <p className={estilos.subDialogo}>
              Entra no catálogo; a meta é definida depois, na própria página.
            </p>
            <form onSubmit={salvarIndicador}>
              <label className={estilos.rotulo} htmlFor="ind-nome">
                Nome
              </label>
              <input
                className={estilos.campo}
                id="ind-nome"
                required
                minLength={3}
                maxLength={200}
                placeholder="ex.: % de holerites com ciência no prazo"
                value={iNome}
                onChange={(e) => setINome(e.target.value)}
              />

              <label className={estilos.rotulo} htmlFor="ind-area">
                Área
              </label>
              <select
                className={estilos.campo}
                id="ind-area"
                value={iArea}
                onChange={(e) => setIArea(e.target.value)}
              >
                {areas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
                <option value={OPCAO_NOVA_AREA}>Outra área…</option>
              </select>
              {iArea === OPCAO_NOVA_AREA && (
                <input
                  className={estilos.campo}
                  aria-label="Nome da nova área"
                  required
                  maxLength={100}
                  placeholder="Nome da nova área"
                  value={iAreaNova}
                  onChange={(e) => setIAreaNova(e.target.value)}
                />
              )}

              <label className={estilos.rotulo} htmlFor="ind-descricao">
                Descrição (opcional)
              </label>
              <input
                className={estilos.campo}
                id="ind-descricao"
                maxLength={500}
                placeholder="Como o indicador é apurado"
                value={iDescricao}
                onChange={(e) => setIDescricao(e.target.value)}
              />

              <label className={estilos.rotulo} htmlFor="ind-unidade">
                Unidade de medida
              </label>
              <select
                className={estilos.campo}
                id="ind-unidade"
                value={iUnidade}
                onChange={(e) => setIUnidade(e.target.value as UnidadeMedida)}
              >
                {UNIDADES_MEDIDA.map((unidade) => (
                  <option key={unidade} value={unidade}>
                    {ROTULOS_UNIDADE_MEDIDA[unidade]}
                  </option>
                ))}
              </select>

              <label className={estilos.rotulo} htmlFor="ind-direcao">
                Direção
              </label>
              <select
                className={estilos.campo}
                id="ind-direcao"
                value={iDirecao}
                onChange={(e) => setIDirecao(e.target.value as Direcao)}
              >
                {DIRECOES.map((direcao) => (
                  <option key={direcao} value={direcao}>
                    {ROTULOS_DIRECAO[direcao]}
                  </option>
                ))}
              </select>

              {erroIndicador && <p className={estilos.erro}>{erroIndicador}</p>}
              <div className={estilos.acoesDialogo}>
                <button
                  className={estilos.botaoSecundario}
                  type="button"
                  onClick={() => setCriandoIndicador(false)}
                >
                  Cancelar
                </button>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={salvandoIndicador}
                >
                  {salvandoIndicador ? "Adicionando…" : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const ROTULOS_FAROL: Record<ValorIndicador["situacao"], string> = {
  dentro: "dentro da meta",
  fora: "fora da meta",
  sem_meta: "sem meta definida",
  sem_dados: "sem dados",
};

function IndicadorLinha({
  indicador,
  valorAtual,
  historico,
  podeAdministrar,
  aoDefinirMeta,
  aoAlternarHistorico,
}: {
  indicador: Indicador;
  valorAtual: ValorIndicador | undefined;
  historico: VersaoMeta[] | "carregando" | "erro" | undefined;
  podeAdministrar: boolean;
  aoDefinirMeta: () => void;
  aoAlternarHistorico: () => void;
}) {
  const metaGlobal = indicador.meta_global;
  const classesFarol: Record<ValorIndicador["situacao"], string> = {
    dentro: estilos.farolDentro,
    fora: estilos.farolFora,
    sem_meta: estilos.farolNeutro,
    sem_dados: estilos.farolNeutro,
  };
  return (
    <>
      <tr>
        <td>
          <div className={estilos.nomeIndicador}>{indicador.nome}</div>
          <div className={estilos.descricaoIndicador}>
            {indicador.descricao}
          </div>
          <div className={estilos.direcao}>
            {indicador.direcao === "maior"
              ? "▲ quanto maior, melhor"
              : "▼ quanto menor, melhor"}
          </div>
        </td>
        <td>
          {metaGlobal ? (
            <span className={estilos.valorMeta}>
              {formatarValorMeta(metaGlobal.valor, indicador.unidade)}
            </span>
          ) : (
            <span className={estilos.semMeta}>meta não definida</span>
          )}
          {indicador.metas_unidade.map((meta) => (
            <span className={estilos.chipUnidade} key={meta.id}>
              {meta.escopo}:{" "}
              {formatarValorMeta(meta.valor, indicador.unidade)}
            </span>
          ))}
        </td>
        <td className={estilos.celulaValor}>
          {valorAtual && valorAtual.valor_formatado !== null ? (
            <>
              <span
                className={`${estilos.farol} ${classesFarol[valorAtual.situacao]}`}
                title={ROTULOS_FAROL[valorAtual.situacao]}
                role="img"
                aria-label={ROTULOS_FAROL[valorAtual.situacao]}
              />
              <span className={estilos.valorAtual}>
                {valorAtual.valor_formatado}
              </span>
              {valorAtual.detalhe && (
                <div className={estilos.detalheValor}>{valorAtual.detalhe}</div>
              )}
            </>
          ) : (
            <span className={estilos.semMeta}>sem dados</span>
          )}
        </td>
        <td className={estilos.vigencia}>
          {metaGlobal ? `desde ${formatarData(metaGlobal.inicio_vigencia)}` : "—"}
        </td>
        <td className={estilos.celulaAcoes}>
          {podeAdministrar && (
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={aoDefinirMeta}
            >
              {metaGlobal || indicador.metas_unidade.length > 0
                ? "Alterar meta"
                : "Definir meta"}
            </button>
          )}
          <button
            className={estilos.botaoLeve}
            type="button"
            onClick={aoAlternarHistorico}
          >
            {historico === undefined ? "histórico" : "ocultar histórico"}
          </button>
        </td>
      </tr>
      {historico !== undefined && (
        <tr>
          <td colSpan={5} className={estilos.celulaHistorico}>
            <div className={estilos.historico}>
              {historico === "carregando" && <div>Carregando histórico…</div>}
              {historico === "erro" && (
                <div>Não foi possível carregar o histórico.</div>
              )}
              {Array.isArray(historico) && historico.length === 0 && (
                <div>Nenhuma versão registrada ainda.</div>
              )}
              {Array.isArray(historico) &&
                historico.map((versao) => (
                  <div
                    key={versao.id}
                    className={
                      versao.status === "encerrada"
                        ? estilos.versaoEncerrada
                        : undefined
                    }
                  >
                    {versao.escopo === "global" ? "Global" : versao.escopo} ·
                    meta {formatarValorMeta(versao.valor, indicador.unidade)} ·
                    vigência a partir de {formatarData(versao.inicio_vigencia)}{" "}
                    · definida por {versao.criado_por_nome} em{" "}
                    {formatarDataHoraSaoPaulo(versao.criado_em)}
                    {versao.status === "ativa" ? (
                      <>
                        {" "}
                        · <b>ativa</b>
                      </>
                    ) : (
                      " · encerrada"
                    )}
                  </div>
                ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
