"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  EstadoCompetencia,
  formatarCompetencia,
  formatarMoedaCentavos,
  NaturezaRubrica,
  ROTULOS_ESTADO_COMPETENCIA,
  ROTULOS_NATUREZA,
  ROTULOS_ORIGEM_VARIAVEL,
  ROTULOS_TABELA_LEGAL,
  TipoTabelaLegal,
} from "@/dominios/folha/esquemas";
import { classeEtiquetaEstado } from "../painel-competencias";
import estilos from "../folha.module.css";

interface Competencia {
  id: number;
  ano: number;
  mes: number;
  tipo: string;
  estado: EstadoCompetencia;
  total_calculadas: number;
}

interface Impedido {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  motivo: string;
}

interface Variavel {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  rubrica_id: number;
  codigo: string;
  rubrica_nome: string;
  natureza: NaturezaRubrica;
  referencia: number | null;
  valor_centavos: number | null;
  origem: "manual" | "beneficio";
}

interface RubricaLancavel {
  rubrica_id: number;
  codigo: string;
  nome: string;
  natureza: string;
  precisa: "referencia" | "valor" | "nenhum";
}

interface ColaboradorOpcao {
  id: number;
  nome_completo: string;
  matricula: string;
}

interface SituacaoConferencia {
  tipo: TipoTabelaLegal;
  versao_id: number | null;
  conferido_dp: boolean;
}

interface ItemFolha {
  id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  referencia: number | null;
  base_centavos: number | null;
  valor_centavos: number;
  memoria: Record<string, unknown>;
}

interface Folha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  salario_base_centavos: number;
  dependentes_irrf: number;
  total_proventos_centavos: number;
  total_descontos_centavos: number;
  liquido_centavos: number;
  itens: ItemFolha[];
}

interface Visao {
  pode: {
    ver: boolean;
    operar: boolean;
    aprovar: boolean;
    parametros: boolean;
  };
  competencia: Competencia;
  impedidos: Impedido[];
  variaveis: Variavel[];
  rubricas_lancaveis: RubricaLancavel[];
  colaboradores: ColaboradorOpcao[];
  tabelas_conferidas: SituacaoConferencia[];
  folhas: Folha[];
  totais: {
    total_proventos_centavos: number;
    total_descontos_centavos: number;
    liquido_centavos: number;
  };
}

function classeEtiquetaNatureza(natureza: NaturezaRubrica): string {
  const porNatureza: Record<NaturezaRubrica, string> = {
    provento: estilos.etiquetaProvento,
    desconto: estilos.etiquetaDesconto,
    informativa: estilos.etiquetaInformativa,
  };
  return `${estilos.etiqueta} ${porNatureza[natureza]}`;
}

export function PainelCompetencia({ id }: { id: number }) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [colaboradorId, setColaboradorId] = useState("");
  const [rubricaId, setRubricaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [valor, setValor] = useState("");
  const [lancando, setLancando] = useState(false);
  const [erroLancar, setErroLancar] = useState<string | null>(null);

  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [avisoAcao, setAvisoAcao] = useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = useState<number | null>(null);
  const [codigoAprovacao, setCodigoAprovacao] = useState("");

  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/folha/${id}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar a competência.");
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
  }, [id, versao]);

  const rubricaEscolhida = visao?.rubricas_lancaveis.find(
    (rubrica) => rubrica.rubrica_id === Number(rubricaId)
  );

  async function lancar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroLancar(null);
    setLancando(true);
    try {
      const corpo: Record<string, number> = {
        colaborador_id: Number(colaboradorId),
        rubrica_id: Number(rubricaId),
      };
      if (rubricaEscolhida?.precisa === "referencia") {
        corpo.referencia = Number(referencia);
      }
      if (rubricaEscolhida?.precisa === "valor") {
        corpo.valor = Number(valor);
      }
      const resposta = await fetch(`/api/folha/${id}/variaveis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setColaboradorId("");
        setRubricaId("");
        setReferencia("");
        setValor("");
        recarregar();
      } else {
        setErroLancar(dados.erro ?? "Não foi possível lançar a variável.");
      }
    } catch {
      setErroLancar("Falha de conexão. Tente novamente.");
    } finally {
      setLancando(false);
    }
  }

  async function executarAcao(
    chave: string,
    caminho: string,
    metodo: "POST" | "DELETE",
    confirmacao?: string,
    aviso?: string,
    corpo?: Record<string, unknown>
  ) {
    if (confirmacao && !window.confirm(confirmacao)) return;
    setErroAcao(null);
    setAvisoAcao(null);
    setAcaoEmCurso(chave);
    try {
      const resposta = await fetch(caminho, {
        method: metodo,
        ...(corpo
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(corpo),
            }
          : {}),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        if (aviso) setAvisoAcao(aviso);
        recarregar();
      } else {
        setErroAcao(dados.erro ?? "A operação falhou.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setAcaoEmCurso(null);
    }
  }

  const competencia = visao?.competencia;
  const rotuloCompetencia = competencia
    ? formatarCompetencia(competencia.ano, competencia.mes)
    : "";
  const tabelasPendentes = (visao?.tabelas_conferidas ?? []).filter(
    (tabela) => tabela.versao_id === null || !tabela.conferido_dp
  );

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/folha">
          Competências
        </Link>
        {visao?.pode.parametros && (
          <Link className={acaoCabecalho} href="/folha/parametros">
            Parâmetros
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>
          Competência {rotuloCompetencia}{" "}
          {competencia && (
            <span className={classeEtiquetaEstado(competencia.estado)}>
              {ROTULOS_ESTADO_COMPETENCIA[competencia.estado]}
            </span>
          )}
        </h1>
        <p className={estilos.subtitulo}>
          Esteira: aberta → cálculo → conferência → aprovada → fechada. Fechada
          não reabre — correção é competência futura.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

        {!carregando && visao && competencia && (
          <>
            <div className={estilos.barraAcoes}>
              {visao.pode.operar && competencia.estado === "aberta" && (
                <>
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    disabled={acaoEmCurso !== null}
                    onClick={() =>
                      executarAcao(
                        "importar",
                        `/api/folha/${id}/importar-beneficios`,
                        "POST",
                        "Importar os descontos das adesões de benefício ativas? O lote importado anteriormente será substituído.",
                        "Descontos de benefícios importados."
                      )
                    }
                  >
                    {acaoEmCurso === "importar"
                      ? "Importando…"
                      : "Importar descontos de benefícios"}
                  </button>
                  <button
                    className={estilos.botao}
                    type="button"
                    disabled={acaoEmCurso !== null}
                    onClick={() =>
                      executarAcao(
                        "calcular",
                        `/api/folha/${id}/calcular`,
                        "POST",
                        `Calcular a folha de ${rotuloCompetencia} para todos os colaboradores ativos? O salário da posição vigente será congelado.`
                      )
                    }
                  >
                    {acaoEmCurso === "calcular" ? "Calculando…" : "Calcular"}
                  </button>
                </>
              )}
              {visao.pode.operar && competencia.estado === "conferencia" && (
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  disabled={acaoEmCurso !== null}
                  onClick={() =>
                    executarAcao(
                      "calcular",
                      `/api/folha/${id}/calcular`,
                      "POST",
                      "Recalcular apaga o resultado atual e regrava. Continuar?"
                    )
                  }
                >
                  {acaoEmCurso === "calcular" ? "Recalculando…" : "Recalcular"}
                </button>
              )}
              {visao.pode.aprovar && competencia.estado === "conferencia" && (
                <span className={estilos.campoGrupoCurto}>
                  <input
                    className={estilos.campo}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="Código 2FA"
                    autoComplete="one-time-code"
                    value={codigoAprovacao}
                    onChange={(e) => setCodigoAprovacao(e.target.value)}
                  />
                  <button
                    className={estilos.botao}
                    type="button"
                    disabled={
                      acaoEmCurso !== null || !/^\d{6}$/.test(codigoAprovacao)
                    }
                    onClick={() =>
                      executarAcao(
                        "aprovar",
                        `/api/folha/${id}/aprovar`,
                        "POST",
                        `Aprovar a competência ${rotuloCompetencia}? Exige tabelas conferidas pelo DP, código do autenticador e aprovador diferente de quem calculou.`,
                        undefined,
                        { codigo_totp: codigoAprovacao }
                      )
                    }
                  >
                    {acaoEmCurso === "aprovar" ? "Aprovando…" : "Aprovar"}
                  </button>
                </span>
              )}
              {visao.pode.aprovar && competencia.estado === "aprovada" && (
                <button
                  className={estilos.botao}
                  type="button"
                  disabled={acaoEmCurso !== null}
                  onClick={() =>
                    executarAcao(
                      "fechar",
                      `/api/folha/${id}/fechar`,
                      "POST",
                      `FECHAR a competência ${rotuloCompetencia}? O resultado congela para sempre — fechada NÃO reabre; correção é competência futura.`
                    )
                  }
                >
                  {acaoEmCurso === "fechar" ? "Fechando…" : "Fechar competência"}
                </button>
              )}
            </div>
            {erroAcao && <p className={estilos.erro}>{erroAcao}</p>}
            {avisoAcao && <p className={estilos.sucesso}>{avisoAcao}</p>}

            {competencia.estado === "conferencia" && tabelasPendentes.length > 0 && (
              <div className={estilos.avisoCritico}>
                Aprovação bloqueada: tabelas legais não conferidas pelo DP (
                {tabelasPendentes
                  .map((tabela) => ROTULOS_TABELA_LEGAL[tabela.tipo])
                  .join(", ")}
                ). Confira em Parâmetros.
              </div>
            )}

            {visao.impedidos.length > 0 && competencia.estado !== "fechada" && (
              <section className={estilos.cartao}>
                <h2>Impedidos de calcular ({visao.impedidos.length})</h2>
                <div className={estilos.aviso}>
                  Estas pessoas estão ativas mas SEM posição/salário vigente —
                  ficam fora do cálculo até o DP regularizar a posição na ficha.
                </div>
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th>Matrícula</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visao.impedidos.map((impedido) => (
                        <tr key={impedido.colaborador_id}>
                          <td>{impedido.nome_completo}</td>
                          <td>{impedido.matricula}</td>
                          <td>{impedido.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {competencia.estado === "aberta" && visao.pode.operar && (
              <section className={estilos.cartao}>
                <h2>Lançar variável</h2>
                <form className={estilos.formulario} onSubmit={lancar}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="colaborador">
                      Colaborador
                    </label>
                    <select
                      className={estilos.campo}
                      id="colaborador"
                      required
                      value={colaboradorId}
                      onChange={(e) => setColaboradorId(e.target.value)}
                    >
                      <option value="">Escolha…</option>
                      {visao.colaboradores.map((colaborador) => (
                        <option key={colaborador.id} value={colaborador.id}>
                          {colaborador.nome_completo} ({colaborador.matricula})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="rubrica">
                      Rubrica
                    </label>
                    <select
                      className={estilos.campo}
                      id="rubrica"
                      required
                      value={rubricaId}
                      onChange={(e) => setRubricaId(e.target.value)}
                    >
                      <option value="">Escolha…</option>
                      {visao.rubricas_lancaveis.map((rubrica) => (
                        <option key={rubrica.rubrica_id} value={rubrica.rubrica_id}>
                          {rubrica.codigo} — {rubrica.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  {rubricaEscolhida?.precisa === "referencia" && (
                    <div className={estilos.campoGrupoCurto}>
                      <label className={estilos.rotulo} htmlFor="referencia">
                        Horas/dias
                      </label>
                      <input
                        className={estilos.campo}
                        id="referencia"
                        type="number"
                        min={0.01}
                        step={0.01}
                        required
                        value={referencia}
                        onChange={(e) => setReferencia(e.target.value)}
                      />
                    </div>
                  )}
                  {rubricaEscolhida?.precisa === "valor" && (
                    <div className={estilos.campoGrupoCurto}>
                      <label className={estilos.rotulo} htmlFor="valor">
                        Valor (R$)
                      </label>
                      <input
                        className={estilos.campo}
                        id="valor"
                        type="number"
                        min={0.01}
                        step={0.01}
                        required
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                      />
                    </div>
                  )}
                  <button
                    className={estilos.botao}
                    type="submit"
                    disabled={lancando}
                  >
                    {lancando ? "Lançando…" : "Lançar"}
                  </button>
                </form>
                {erroLancar && <p className={estilos.erro}>{erroLancar}</p>}
              </section>
            )}

            <section className={estilos.cartao}>
              <h2>Variáveis lançadas ({visao.variaveis.length})</h2>
              {competencia.estado !== "aberta" && (
                <p className={estilos.notaRodape}>
                  Variáveis são somente-leitura fora do estado &quot;Aberta&quot;.
                </p>
              )}
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Rubrica</th>
                      <th className={estilos.numero}>Referência</th>
                      <th className={estilos.numero}>Valor</th>
                      <th>Origem</th>
                      {competencia.estado === "aberta" && visao.pode.operar && (
                        <th></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visao.variaveis.map((variavel) => (
                      <tr key={variavel.id}>
                        <td>
                          {variavel.colaborador_nome} ({variavel.matricula})
                        </td>
                        <td>
                          {variavel.codigo} — {variavel.rubrica_nome}{" "}
                          <span className={classeEtiquetaNatureza(variavel.natureza)}>
                            {ROTULOS_NATUREZA[variavel.natureza]}
                          </span>
                        </td>
                        <td className={estilos.numero}>
                          {variavel.referencia ?? "—"}
                        </td>
                        <td className={estilos.numero}>
                          {variavel.valor_centavos !== null
                            ? formatarMoedaCentavos(variavel.valor_centavos)
                            : "—"}
                        </td>
                        <td>{ROTULOS_ORIGEM_VARIAVEL[variavel.origem]}</td>
                        {competencia.estado === "aberta" && visao.pode.operar && (
                          <td>
                            <button
                              className={estilos.botaoLinha}
                              type="button"
                              disabled={acaoEmCurso !== null}
                              onClick={() =>
                                executarAcao(
                                  `remover-${variavel.id}`,
                                  `/api/folha/${id}/variaveis/${variavel.id}`,
                                  "DELETE",
                                  `Remover a variável ${variavel.codigo} de ${variavel.colaborador_nome}?`
                                )
                              }
                            >
                              {acaoEmCurso === `remover-${variavel.id}`
                                ? "Removendo…"
                                : "Remover"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {visao.variaveis.length === 0 && (
                      <tr>
                        <td colSpan={6}>Nenhuma variável lançada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {visao.folhas.length > 0 && (
              <section className={estilos.cartao}>
                <h2>Folhas calculadas ({visao.folhas.length})</h2>
                <div className={estilos.cartoesResumo}>
                  <div className={estilos.cartaoResumo}>
                    <strong>
                      {formatarMoedaCentavos(visao.totais.total_proventos_centavos)}
                    </strong>
                    <span>Total de proventos</span>
                  </div>
                  <div className={estilos.cartaoResumo}>
                    <strong>
                      {formatarMoedaCentavos(visao.totais.total_descontos_centavos)}
                    </strong>
                    <span>Total de descontos</span>
                  </div>
                  <div
                    className={`${estilos.cartaoResumo} ${estilos.cartaoResumoDestaque}`}
                  >
                    <strong>
                      {formatarMoedaCentavos(visao.totais.liquido_centavos)}
                    </strong>
                    <span>Líquido total</span>
                  </div>
                </div>
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th className={estilos.numero}>Salário congelado</th>
                        <th className={estilos.numero}>Dep. IRRF</th>
                        <th className={estilos.numero}>Proventos</th>
                        <th className={estilos.numero}>Descontos</th>
                        <th className={estilos.numero}>Líquido</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visao.folhas.map((folha) => (
                        <FragmentoFolha
                          key={folha.id}
                          folha={folha}
                          aberto={detalheAberto === folha.id}
                          aoAlternar={() =>
                            setDetalheAberto(
                              detalheAberto === folha.id ? null : folha.id
                            )
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        <p className={estilos.notaRodape}>
          Valores em reais (BRL); salário congelado da posição vigente no
          momento do cálculo. Cada item traz a memória de cálculo — a conta
          aberta que explica o valor. Leituras desta tela ficam na trilha de
          acesso a dado sensível.
        </p>
      </main>
    </div>
  );
}

function FragmentoFolha({
  folha,
  aberto,
  aoAlternar,
}: {
  folha: Folha;
  aberto: boolean;
  aoAlternar: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          {folha.colaborador_nome} ({folha.matricula})
        </td>
        <td className={estilos.numero}>
          {formatarMoedaCentavos(folha.salario_base_centavos)}
        </td>
        <td className={estilos.numero}>{folha.dependentes_irrf}</td>
        <td className={estilos.numero}>
          {formatarMoedaCentavos(folha.total_proventos_centavos)}
        </td>
        <td className={estilos.numero}>
          {formatarMoedaCentavos(folha.total_descontos_centavos)}
        </td>
        <td className={estilos.numero}>
          <strong>{formatarMoedaCentavos(folha.liquido_centavos)}</strong>
        </td>
        <td>
          <button
            className={estilos.botaoLinha}
            type="button"
            onClick={aoAlternar}
          >
            {aberto ? "Ocultar itens" : "Ver itens"}
          </button>
        </td>
      </tr>
      {aberto && (
        <tr className={estilos.linhaDetalhe}>
          <td colSpan={7}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Rubrica</th>
                  <th>Natureza</th>
                  <th className={estilos.numero}>Referência</th>
                  <th className={estilos.numero}>Base</th>
                  <th className={estilos.numero}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {folha.itens.map((item) => (
                  <tr key={item.id}>
                    <td>{item.codigo}</td>
                    <td>
                      {item.nome}
                      <details className={estilos.memoria}>
                        <summary>Memória de cálculo</summary>
                        <pre className={estilos.memoriaConteudo}>
                          {JSON.stringify(item.memoria, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td>
                      <span className={classeEtiquetaNatureza(item.natureza)}>
                        {ROTULOS_NATUREZA[item.natureza]}
                      </span>
                    </td>
                    <td className={estilos.numero}>{item.referencia ?? "—"}</td>
                    <td className={estilos.numero}>
                      {item.base_centavos !== null
                        ? formatarMoedaCentavos(item.base_centavos)
                        : "—"}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMoedaCentavos(item.valor_centavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
