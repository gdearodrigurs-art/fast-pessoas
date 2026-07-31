"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  EstadoCompetencia,
  formatarCompetencia,
  formatarMoedaCentavos,
  NaturezaRubrica,
  OrigemVariavel,
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
  origem: OrigemVariavel;
}

interface RubricaLancavel {
  rubrica_id: number;
  codigo: string;
  nome: string;
  natureza: string;
  precisa: "referencia" | "valor" | "nenhum";
  /** Verba manual genérica (9001/9002): última da lista, com aviso. */
  excecao: boolean;
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

/**
 * Corpo devolvido por POST /api/folha/[id]/importar-ponto. Tudo aqui é NÚMERO
 * DA IMPORTAÇÃO que o DP precisa ver na hora — a rota já devolvia, a tela é que
 * jogava fora.
 */
interface RetornoImportacaoPonto {
  importadas: number;
  removidas: number;
  pessoas: number;
  intercorrencias_abertas: number;
  totais_horas: {
    he_50: number;
    he_100: number;
    adicional_noturno: number;
    faltas_dias: number;
  };
}

/**
 * Retorno de uma ação bem-sucedida. `texto` é o que ela fez; `alerta` é o que
 * continua pendente e pode mudar o número — vai em caixa de ALERTA, não na
 * linha verde de sucesso, porque não é boa notícia.
 */
interface AvisoAcao {
  texto: string;
  alerta?: string;
}

/** Horas e dias com vírgula decimal, como o DP lê no holerite. */
function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
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
  const [avisoAcao, setAvisoAcao] = useState<AvisoAcao | null>(null);
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

  /**
   * `aviso` aceita texto fixo ou uma função do CORPO da resposta: ação que
   * devolve número (quantas variáveis, quantas pendências) tem que mostrar o
   * número, não uma frase genérica.
   */
  async function executarAcao<T>(
    chave: string,
    caminho: string,
    metodo: "POST" | "DELETE",
    confirmacao?: string,
    aviso?: string | ((dados: T) => AvisoAcao),
    corpo?: Record<string, unknown>,
    // 409 que o servidor manda como PERGUNTA, não como recusa final: a
    // mensagem dele vira a confirmação e o corpo daqui é o "sim, prossiga"
    // (hoje: importar ponto com intercorrência aberta). Sem isto o usuário via
    // um erro vermelho sem saída, e o 409 viraria bloqueio absoluto.
    //
    // `chave` casa com o campo `confirmacao` do corpo do erro: a mesma rota
    // devolve 409 por motivos que reenviar NÃO resolve (competência não
    // aberta, ponto sem apuração), e perguntar "prosseguir assim mesmo?" neles
    // prometeria uma saída que não existe.
    insistirNoConflito?: {
      chave: string;
      pergunta: string;
      corpo: Record<string, unknown>;
    }
  ) {
    if (confirmacao && !window.confirm(confirmacao)) return;
    setErroAcao(null);
    setAvisoAcao(null);
    setAcaoEmCurso(chave);
    const enviar = async (comCorpo?: Record<string, unknown>) => {
      const resposta = await fetch(caminho, {
        method: metodo,
        ...(comCorpo
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(comCorpo),
            }
          : {}),
      });
      return { resposta, dados: await resposta.json().catch(() => ({})) };
    };
    try {
      let { resposta, dados } = await enviar(corpo);
      if (
        resposta.status === 409 &&
        insistirNoConflito &&
        dados.confirmacao === insistirNoConflito.chave &&
        window.confirm(`${dados.erro}\n\n${insistirNoConflito.pergunta}`)
      ) {
        ({ resposta, dados } = await enviar({
          ...corpo,
          ...insistirNoConflito.corpo,
        }));
      }
      if (resposta.ok) {
        if (aviso) {
          setAvisoAcao(typeof aviso === "string" ? { texto: aviso } : aviso(dados));
        }
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
                  {/*
                    F5 — ligação ponto → folha. Mesmo padrão do botão acima:
                    reimportar substitui só o lote da própria origem ('ponto'),
                    o que o DP lançou à mão fica. O DSR não é importado: a
                    rubrica 1202 é automática e o motor a deriva das faltas.

                    O aviso mostra os TOTAIS LANÇADOS (os mesmos que somam na
                    coluna Referência da tabela abaixo) e, se a fila de ponto
                    ainda tem intercorrência aberta, alerta que o número pode
                    mudar.

                    Com fila aberta a API devolve 409 e a importação PARA: dia
                    com intercorrência é dia cujo número ainda muda quando o DP
                    tratar a fila — uns estão pendentes e não lançaram nada,
                    outros já lançaram falta, atraso ou hora extra que o
                    tratamento altera. Como competência de folha tem
                    prazo legal, o 409 não é recusa final — vira a pergunta do
                    `insistirNoConflito`, e o "sim" do DP fica gravado na trilha.
                  */}
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    disabled={acaoEmCurso !== null}
                    onClick={() =>
                      executarAcao<RetornoImportacaoPonto>(
                        "importar-ponto",
                        `/api/folha/${id}/importar-ponto`,
                        "POST",
                        `Importar a apuração de ponto de ${rotuloCompetencia} (hora extra 50% e 100%, adicional noturno e faltas)? O lote importado anteriormente do ponto será substituído; os lançamentos manuais não são tocados.`,
                        (dados) => ({
                          texto:
                            `Ponto importado: ${dados.importadas} variável(is) em ${dados.pessoas} colaborador(es)` +
                            ` (${dados.removidas} do lote anterior substituída(s)). Total lançado —` +
                            ` HE 50%: ${formatarQuantidade(dados.totais_horas.he_50)} h;` +
                            ` HE 100%: ${formatarQuantidade(dados.totais_horas.he_100)} h;` +
                            ` adicional noturno: ${formatarQuantidade(dados.totais_horas.adicional_noturno)} h;` +
                            ` faltas: ${formatarQuantidade(dados.totais_horas.faltas_dias)} dia(s).`,
                          alerta:
                            dados.intercorrencias_abertas > 0
                              ? `${dados.intercorrencias_abertas} intercorrência(s) de ponto continuam ABERTAS em ${rotuloCompetencia}: os números acima ainda podem mudar. Trate a fila em Ponto (DP) e importe de novo antes de calcular a folha.`
                              : undefined,
                        }),
                        undefined,
                        {
                          chave: "intercorrencias_abertas",
                          pergunta:
                            "Importar assim mesmo? A confirmação fica registrada na trilha da competência, com o número de pendências que havia agora.",
                          corpo: { confirmar_intercorrencias_abertas: true },
                        }
                      )
                    }
                  >
                    {acaoEmCurso === "importar-ponto"
                      ? "Importando…"
                      : "Importar do ponto"}
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
            {avisoAcao && <p className={estilos.sucesso}>{avisoAcao.texto}</p>}
            {avisoAcao?.alerta && (
              <div className={estilos.aviso}>{avisoAcao.alerta}</div>
            )}

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
                      <optgroup label="Rubricas próprias">
                        {visao.rubricas_lancaveis
                          .filter((rubrica) => !rubrica.excecao)
                          .map((rubrica) => (
                            <option
                              key={rubrica.rubrica_id}
                              value={rubrica.rubrica_id}
                            >
                              {rubrica.codigo} — {rubrica.nome}
                            </option>
                          ))}
                      </optgroup>
                      {/* Genéricas por ÚLTIMO e separadas: a diretoria pediu
                          para eliminar os proventos manuais o máximo. */}
                      <optgroup label="Exceção — verbas manuais genéricas">
                        {visao.rubricas_lancaveis
                          .filter((rubrica) => rubrica.excecao)
                          .map((rubrica) => (
                            <option
                              key={rubrica.rubrica_id}
                              value={rubrica.rubrica_id}
                            >
                              {rubrica.codigo} — {rubrica.nome}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                  {rubricaEscolhida?.excecao && (
                    <p className={estilos.notaRodape} style={{ flexBasis: "100%" }}>
                      Atenção: <strong>{rubricaEscolhida.nome}</strong> é verba
                      genérica de exceção. Se este lançamento se repete todo
                      mês, crie uma rubrica própria em Parâmetros — verba com
                      rubrica própria tem incidência correta de INSS, IRRF e
                      FGTS, e aparece nomeada no holerite.
                    </p>
                  )}
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
