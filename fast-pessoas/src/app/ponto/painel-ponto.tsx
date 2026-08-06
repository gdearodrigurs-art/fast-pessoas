"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  formatarCompetencia,
  formatarMinutos,
  ROTULOS_STATUS_INTERCORRENCIA,
  ROTULOS_TIPO_INTERCORRENCIA,
  ROTULOS_TIPO_MARCACAO,
  StatusIntercorrencia,
} from "@/dominios/ponto/esquemas";
import estilos from "./ponto.module.css";

// Contratos das rotas de /api/ponto — repetidos aqui de propósito (convenção
// das outras telas): o cliente conhece o contrato da rota, não o módulo do
// servidor.

interface Competencia {
  ano: number;
  mes: number;
  pessoas: number;
  he_minutos: number;
  saldo_minutos: number;
  ultima_apuracao_em: string;
}

interface LinhaApuracao {
  apuracao_id: number;
  colaborador_id: number;
  nome: string;
  matricula: string;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  intercorrencias_abertas: number;
  calculada_em: string;
}

interface Intercorrencia {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data: string;
  tipo: keyof typeof ROTULOS_TIPO_INTERCORRENCIA;
  status: StatusIntercorrencia;
  detalhe: string;
  observacao: string | null;
}

type TipoMarcacao = keyof typeof ROTULOS_TIPO_MARCACAO;

/** Corpo de GET /api/ponto/dia/[colaboradorId]?data=AAAA-MM-DD. */
interface BatidaDoDia {
  id: number;
  minuto: number;
  hora: string;
  /** Dia CIVIL da batida — é a data que o ajuste tem de gravar. */
  data_civil: string;
  dia_seguinte: boolean;
}

interface RegistroDoDia {
  tipo: TipoMarcacao;
  /** Vazio = essa batida NÃO EXISTE no dia. Não é zero, é ausência. */
  batidas: BatidaDoDia[];
  /** A jornada daquele dia prevê este registro? (6h não tem intervalo) */
  esperado: boolean;
}

interface DiaParaAjuste {
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data: string;
  data_seguinte: string;
  jornada: string | null;
  tem_escala: boolean;
  previsto_minutos: number;
  /** Turno que pode fechar depois da meia-noite: a tela pergunta o dia civil. */
  vira_a_noite: boolean;
  registros: RegistroDoDia[];
  intercorrencias: { data: string; tipo: string; detalhe: string }[];
  sequencia: string;
}

interface Visao {
  competencia: { ano: number; mes: number };
  pode: {
    administrar: boolean;
    ajustar: boolean;
    parametros: boolean;
    importar: boolean;
    ver_equipe: boolean;
  };
  competencias: Competencia[];
  apuracoes: LinhaApuracao[];
  /** Uma PÁGINA da fila — não a fila inteira. Ver os três campos abaixo. */
  intercorrencias: Intercorrencia[];
  /** Quantas abertas existem de verdade, ignorando o limite da página. */
  intercorrencias_total: number;
  intercorrencias_limite: number;
  /** Data da mais antiga que existe — é ela que a ordenação por data DESC corta. */
  intercorrencia_mais_antiga: string | null;
}

interface ResultadoImportacao {
  lote_id: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  rejeicoes: { linha: number; motivo: string; conteudo: string }[];
}

interface ResultadoApuracao {
  ano: number;
  mes: number;
  apurados: number;
  sem_escala: number;
  intercorrencias: number;
  saldo_total_minutos: number;
  /**
   * Cadastro que mudou DURANTE a rodada sem impedir a gravação (desligamento,
   * escala encerrada). O mês foi apurado com o cadastro do início — quem for
   * fechar precisa ver isso, senão só descobre na rescisão.
   */
  avisos_cadastro?: {
    colaborador_id: number;
    nome: string;
    matricula: string;
    aviso: string;
  }[];
}

/** Corpo de GET/POST /api/ponto/banco/expiracao. */
interface Expiracao {
  data_referencia: string;
  total_minutos: number;
  movimentos: number;
  pessoas: {
    colaborador_id: number;
    nome: string;
    matricula: string;
    saldo_minutos: number;
    minutos_vencidos: number;
    creditos_vencidos: { data: string; minutos: number; vence_em: string }[];
    proximo_vencimento: { data: string; minutos: number } | null;
  }[];
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * TIMESTAMPTZ do Postgres chega como "2026-07-30 14:23:45.12+00": espaço no
 * lugar do T e fuso com dois dígitos, que o Date do JS não aceita. Normaliza
 * antes de formatar — senão a coluna vira "—" sem ninguém entender por quê.
 */
function formatarDataHora(iso: string): string {
  const comT = iso.includes("T") ? iso : iso.replace(" ", "T");
  const data = new Date(/[+-]\d{2}$/.test(comT) ? `${comT}:00` : comT);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeSaldo(minutos: number): string {
  if (minutos > 0) return estilos.saldoPositivo;
  if (minutos < 0) return estilos.saldoNegativo;
  return "";
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível concluir.";
}

export function PainelPonto() {
  const hoje = new Date();
  const anteriorMes = hoje.getUTCMonth() === 0 ? 12 : hoje.getUTCMonth();
  const anteriorAno =
    hoje.getUTCMonth() === 0 ? hoje.getUTCFullYear() - 1 : hoje.getUTCFullYear();

  const [ano, setAno] = useState(anteriorAno);
  const [mes, setMes] = useState(anteriorMes);
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [apurando, setApurando] = useState(false);
  const [resultadoApuracao, setResultadoApuracao] =
    useState<ResultadoApuracao | null>(null);

  const [arquivoNome, setArquivoNome] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [separador, setSeparador] = useState(";");
  const [importando, setImportando] = useState(false);
  const [relatorio, setRelatorio] = useState<ResultadoImportacao | null>(null);
  const [erroImportacao, setErroImportacao] = useState<string | null>(null);

  const [tratando, setTratando] = useState<number | null>(null);
  const [erroFila, setErroFila] = useState<string | null>(null);
  const [sucessoFila, setSucessoFila] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});

  // ------------------------------------------------ correção pela própria fila
  const [corrigindo, setCorrigindo] = useState<Intercorrencia | null>(null);
  const [dia, setDia] = useState<DiaParaAjuste | null>(null);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [erroCorrecao, setErroCorrecao] = useState<string | null>(null);
  const [salvandoCorrecao, setSalvandoCorrecao] = useState(false);
  const [passoCorrecao, setPassoCorrecao] = useState<string | null>(null);
  /** "id:<n>" = a batida que existe; "falta:<tipo>" = a que não existe. */
  const [escolha, setEscolha] = useState("");
  const [horaNova, setHoraNova] = useState("");
  const [noDiaSeguinte, setNoDiaSeguinte] = useState(false);
  const [anular, setAnular] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  /** A página não deu conta da fila inteira — e isso tem que aparecer. */
  const filaCortada =
    visao != null &&
    visao.intercorrencias_total > visao.intercorrencias.length &&
    visao.intercorrencia_mais_antiga !== null;

  const [expiracao, setExpiracao] = useState<Expiracao | null>(null);
  const [expirando, setExpirando] = useState(false);
  const [erroExpiracao, setErroExpiracao] = useState<string | null>(null);
  const [expirou, setExpirou] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/ponto?ano=${ano}&mes=${mes}`, {
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
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [ano, mes, versao]);

  async function apurar(colaboradorId?: number) {
    setApurando(true);
    setResultadoApuracao(null);
    setErro(null);
    try {
      const resposta = await fetch("/api/ponto/apurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano,
          mes,
          colaborador_id: colaboradorId ?? null,
        }),
      });
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        return;
      }
      setResultadoApuracao((await resposta.json()) as ResultadoApuracao);
      setVersao((v) => v + 1);
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setApurando(false);
    }
  }

  async function importar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setImportando(true);
    setErroImportacao(null);
    setRelatorio(null);
    try {
      const resposta = await fetch("/api/ponto/importacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivo: arquivoNome || "colado-na-tela.csv",
          ano,
          mes,
          conteudo,
          separador,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroImportacao(
          (dados as { erro?: string }).erro ?? "Não foi possível importar."
        );
        return;
      }
      setRelatorio(dados as ResultadoImportacao);
      setVersao((v) => v + 1);
    } catch {
      setErroImportacao("Falha de conexão. Tente novamente.");
    } finally {
      setImportando(false);
    }
  }

  // Prévia da expiração: quem tem hora vencida pelo prazo de compensação da
  // regra vigente. Só leitura — nada é gravado até o DP mandar.
  useEffect(() => {
    if (!visao?.pode.administrar) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/ponto/banco/expiracao", {
          cache: "no-store",
        });
        if (!ativo || !resposta.ok) return;
        setExpiracao((await resposta.json()) as Expiracao);
      } catch {
        /* a prévia é acessório da tela: erro aqui não derruba o painel */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [visao?.pode.administrar, versao]);

  async function expirar() {
    if (
      !window.confirm(
        "Lançar a expiração das horas que passaram do prazo de compensação? " +
          "O movimento é definitivo: o livro é append-only e só se desfaz " +
          "lançando o contrário."
      )
    ) {
      return;
    }
    setExpirando(true);
    setErroExpiracao(null);
    setExpirou(null);
    try {
      const resposta = await fetch("/api/ponto/banco/expiracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resposta.ok) {
        setErroExpiracao(await lerErro(resposta));
        return;
      }
      const dados = (await resposta.json()) as Expiracao;
      setExpirou(
        `${dados.movimentos} movimento(s) de expiração lançado(s), somando ` +
          `${formatarMinutos(dados.total_minutos)}.`
      );
      setVersao((v) => v + 1);
    } catch {
      setErroExpiracao("Falha de conexão. Tente novamente.");
    } finally {
      setExpirando(false);
    }
  }

  // ---------------------------------------------------------------- correção
  //
  // Corrigir é gravar marcação NOVA (origem ajuste manual) apontando para a que
  // ela troca — nunca editar a batida anterior, que o banco recusa por trigger.
  // O formulário se preenche sozinho porque as opções saem do DIA DAQUELA
  // PESSOA (rota /api/ponto/dia), e não de uma lista fixa de quatro campos.

  function opcaoDaBatida(id: number): string {
    return `id:${id}`;
  }

  function opcaoQueFalta(tipo: TipoMarcacao): string {
    return `falta:${tipo}`;
  }

  /** O registro e a batida por trás da opção escolhida no seletor. */
  function alvoDaEscolha(
    diaAtual: DiaParaAjuste | null,
    valor: string
  ): { registro: RegistroDoDia; batida: BatidaDoDia | null } | null {
    if (!diaAtual || valor === "") return null;
    if (valor.startsWith("falta:")) {
      const tipo = valor.slice("falta:".length);
      const registro = diaAtual.registros.find((item) => item.tipo === tipo);
      return registro ? { registro, batida: null } : null;
    }
    const id = Number(valor.slice("id:".length));
    for (const registro of diaAtual.registros) {
      const batida = registro.batidas.find((item) => item.id === id);
      if (batida) return { registro, batida };
    }
    return null;
  }

  /**
   * A opção que o tipo da intercorrência já indica — o resto do formulário é
   * consequência dela. Batida a mais quer a segunda do tipo repetido (e sai
   * anulada); batida que falta quer o registro que o dia espera e não tem.
   */
  function sugerirEscolha(
    diaAtual: DiaParaAjuste,
    tipo: Intercorrencia["tipo"]
  ): { valor: string; anular: boolean } {
    if (tipo === "marcacao_duplicada") {
      const repetido = diaAtual.registros.find(
        (registro) => registro.batidas.length > 1
      );
      if (repetido) {
        const ultima = repetido.batidas[repetido.batidas.length - 1];
        return { valor: opcaoDaBatida(ultima.id), anular: true };
      }
    }
    const faltando = diaAtual.registros.find(
      (registro) => registro.esperado && registro.batidas.length === 0
    );
    if (faltando) return { valor: opcaoQueFalta(faltando.tipo), anular: false };
    const primeiraExistente = diaAtual.registros.find(
      (registro) => registro.batidas.length > 0
    );
    if (primeiraExistente) {
      return {
        valor: opcaoDaBatida(primeiraExistente.batidas[0].id),
        anular: false,
      };
    }
    return { valor: opcaoQueFalta(diaAtual.registros[0].tipo), anular: false };
  }

  function aplicarEscolha(diaAtual: DiaParaAjuste, valor: string): void {
    setEscolha(valor);
    const alvo = alvoDaEscolha(diaAtual, valor);
    // A "hora que está" vira o ponto de partida da hora nova: quem corrige
    // 16:22 costuma escrever 16:2… e não a jornada inteira do zero.
    setHoraNova(alvo?.batida ? alvo.batida.hora : "");
    setNoDiaSeguinte(alvo?.batida ? alvo.batida.dia_seguinte : false);
    if (!alvo?.batida) setAnular(false);
  }

  async function carregarDia(
    item: Intercorrencia,
    sugerir: boolean
  ): Promise<void> {
    setCarregandoDia(true);
    try {
      const resposta = await fetch(
        `/api/ponto/dia/${item.colaborador_id}?data=${item.data.slice(0, 10)}`,
        { cache: "no-store" }
      );
      if (!resposta.ok) {
        setErroCorrecao(await lerErro(resposta));
        setDia(null);
        return;
      }
      const dados = (await resposta.json()) as DiaParaAjuste;
      setDia(dados);
      // Recarregar depois de um ajuste troca os ids do dia (a batida trocada
      // fica superada e sai da lista). Escolha que não existe mais volta para a
      // sugestão, senão o seletor mostraria uma opção e o envio usaria outra.
      if (sugerir || alvoDaEscolha(dados, escolha) === null) {
        const sugestao = sugerirEscolha(dados, item.tipo);
        aplicarEscolha(dados, sugestao.valor);
        setAnular(sugestao.anular);
      }
    } catch {
      setErroCorrecao("Falha de conexão. Recarregue a página.");
      setDia(null);
    } finally {
      setCarregandoDia(false);
    }
  }

  function abrirCorrecao(item: Intercorrencia) {
    setCorrigindo(item);
    setDia(null);
    setErroCorrecao(null);
    setEscolha("");
    setHoraNova("");
    setNoDiaSeguinte(false);
    setAnular(false);
    setJustificativa("");
    void carregarDia(item, true);
  }

  function fecharCorrecao() {
    setCorrigindo(null);
    setDia(null);
    setErroCorrecao(null);
    setPassoCorrecao(null);
  }

  /** Reapura a competência de UMA pessoa. Devolve o erro, ou null se deu certo. */
  async function reapurar(
    ano: number,
    mes: number,
    colaboradorId: number
  ): Promise<string | null> {
    const resposta = await fetch("/api/ponto/apurar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ano, mes, colaborador_id: colaboradorId }),
    });
    return resposta.ok ? null : await lerErro(resposta);
  }

  /**
   * Os três atos de uma correção, nesta ordem: gravar a marcação, FECHAR a
   * intercorrência como corrigida e só então reapurar a competência.
   *
   * POR QUE FECHAR ANTES DE REAPURAR. A ordem intuitiva é reapurar primeiro,
   * mas a reapuração fecha sozinha toda linha aberta cujo fato ela não acha
   * mais — como `resolvida_por_reapuracao`, o carimbo da máquina. Medido em
   * 06/08/2026 contra a intercorrência 4 (Márcio Santana Macedo, 22/07): com a
   * reapuração na frente, o PATCH seguinte voltava 409 "a linha saiu da fila
   * sozinha" e o desfecho `corrigida` NUNCA acontecia — quem corrigiu ficava
   * fora da própria correção. Fechando antes, a linha guarda quem fechou e a
   * conferência do motor como prova, e a reapuração que vem depois não a
   * reabre (só reabre o que o motor voltar a acusar).
   *
   * A trava continua inteira: `tratarIntercorrencia` reconfere o dia com o
   * MESMO motor e RECUSA se o fato ainda estiver de pé. Quando recusa, quem
   * explica o que fazer é a mensagem dele, que aparece inteira aqui.
   */
  async function corrigir() {
    if (!corrigindo || !dia) return;
    const alvo = alvoDaEscolha(dia, escolha);
    if (!alvo) return;
    const anulando = anular && alvo.batida !== null;
    const dataDaBatida = anulando
      ? alvo.batida!.data_civil
      : noDiaSeguinte
        ? dia.data_seguinte
        : dia.data;
    const hora = anulando ? alvo.batida!.hora : horaNova;

    setSalvandoCorrecao(true);
    setErroCorrecao(null);
    setSucessoFila(null);
    const ano = Number(corrigindo.data.slice(0, 4));
    const mes = Number(corrigindo.data.slice(5, 7));
    try {
      setPassoCorrecao("1 de 3 — gravando a marcação de ajuste…");
      const gravacao = await fetch("/api/ponto/marcacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: corrigindo.colaborador_id,
          // O fuso vai EXPLÍCITO: o servidor guarda em UTC e o dia de apuração
          // é o dia civil em America/Sao_Paulo.
          momento: `${dataDaBatida}T${hora}:00-03:00`,
          tipo: alvo.registro.tipo,
          justificativa,
          substitui_marcacao_id: alvo.batida?.id ?? null,
          anular: anulando,
        }),
      });
      if (!gravacao.ok) {
        setErroCorrecao(await lerErro(gravacao));
        return;
      }

      setPassoCorrecao("2 de 3 — conferindo o dia e fechando a linha…");
      const fechamento = await fetch(
        `/api/ponto/intercorrencias/${corrigindo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "corrigida" }),
        }
      );
      const mensagemFechamento = fechamento.ok
        ? null
        : await lerErro(fechamento);
      // 409 é sempre "essa linha já não está aberta": outra reapuração a tirou
      // da fila antes, ou alguém a tratou. Saiu da fila do mesmo jeito — não é
      // falha, é a mensagem do servidor contando o que aconteceu.
      const saiuDaFila = fechamento.ok || fechamento.status === 409;

      // A marcação já mudou o dia: reapurar não é opcional nem depende do
      // desfecho acima. Se o fato continuar de pé, a reapuração é justamente
      // quem atualiza o detalhe da linha que ficou aberta.
      setPassoCorrecao("3 de 3 — reapurando a competência da pessoa…");
      const erroApuracao = await reapurar(ano, mes, corrigindo.colaborador_id);

      if (saiuDaFila) {
        const desfecho =
          mensagemFechamento ??
          `a intercorrência de ${formatarData(corrigindo.data)} saiu da fila como corrigida`;
        setSucessoFila(
          erroApuracao
            ? `Marcação gravada e ${desfecho} — mas a reapuração de ` +
                `${formatarCompetencia(ano, mes)} falhou: ${erroApuracao}. ` +
                `Os números só mudam depois de apurar a competência.`
            : `Marcação gravada, ${desfecho}, e ${formatarCompetencia(ano, mes)} ` +
                `reapurada para esta pessoa.`
        );
        fecharCorrecao();
        setVersao((v) => v + 1);
        return;
      }

      // 422: o fato continua de pé. A mensagem do servidor já diz o que fazer,
      // e o dia recarregado mostra as batidas depois do que acabou de entrar.
      setErroCorrecao(
        mensagemFechamento ?? "Não foi possível fechar a intercorrência."
      );
      setJustificativa("");
      await carregarDia(corrigindo, false);
      setVersao((v) => v + 1);
    } catch {
      setErroCorrecao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvandoCorrecao(false);
      setPassoCorrecao(null);
    }
  }

  async function tratar(id: number, status: "justificada" | "ignorada") {
    setTratando(id);
    setErroFila(null);
    setSucessoFila(null);
    try {
      const resposta = await fetch(`/api/ponto/intercorrencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          observacao: observacoes[id] ?? "",
        }),
      });
      if (!resposta.ok) {
        setErroFila(await lerErro(resposta));
        return;
      }
      setVersao((v) => v + 1);
    } catch {
      setErroFila("Falha de conexão. Tente novamente.");
    } finally {
      setTratando(null);
    }
  }

  const totais = (visao?.apuracoes ?? []).reduce(
    (acumulado, linha) => ({
      trabalhado: acumulado.trabalhado + linha.minutos_trabalhados,
      he: acumulado.he + linha.he_50_minutos + linha.he_100_minutos,
      faltas: acumulado.faltas + linha.faltas_minutos,
      saldo: acumulado.saldo + linha.saldo_banco_minutos,
    }),
    { trabalhado: 0, he: 0, faltas: 0, saldo: 0 }
  );

  // Estado derivado do diálogo de correção. Três dos quatro campos saem daqui
  // sem ninguém digitar: o dia vem da intercorrência, a "hora que está" vem da
  // marcação existente e o tipo vem da opção escolhida.
  const alvoCorrecao = alvoDaEscolha(dia, escolha);
  const anulando = anular && alvoCorrecao?.batida != null;
  const dataDaBatida = anulando
    ? alvoCorrecao!.batida!.data_civil
    : noDiaSeguinte && dia
      ? dia.data_seguinte
      : (dia?.data ?? "");
  const horaDaBatida = anulando ? alvoCorrecao!.batida!.hora : horaNova;
  const podeCorrigir =
    dia !== null &&
    alvoCorrecao !== null &&
    justificativa.trim().length >= 10 &&
    (anulando || /^\d{2}:\d{2}$/.test(horaNova)) &&
    !salvandoCorrecao;

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        {visao?.pode.parametros && (
          <Link className={acaoCabecalho} href="/ponto/parametros">
            Parâmetros
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Ponto e banco de horas</h1>
        <p className={estilos.subtitulo}>
          Importar marcações, apurar a competência, tratar intercorrências e
          abrir o espelho de cada pessoa. Horas em minutos inteiros; valor em
          reais da hora extra é assunto da folha.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}

        {/* ------------------------------------------------ competência */}
        <section className={estilos.cartao}>
          <h2>Competência</h2>
          <div className={estilos.formulario}>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="mes">
                Mês
              </label>
              <select
                className={estilos.campo}
                id="mes"
                value={mes}
                onChange={(evento) => setMes(Number(evento.target.value))}
              >
                {MESES.map((nome, indice) => (
                  <option key={nome} value={indice + 1}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="ano">
                Ano
              </label>
              <input
                className={estilos.campo}
                id="ano"
                type="number"
                min={2020}
                max={2100}
                value={ano}
                onChange={(evento) => setAno(Number(evento.target.value))}
              />
            </div>
            <button
              className={estilos.botao}
              type="button"
              disabled={apurando || carregando}
              onClick={() => void apurar()}
            >
              {apurando ? "Apurando…" : "Apurar competência"}
            </button>
          </div>
          <p className={estilos.notaRodape}>
            Reapurar a mesma competência é permitido: o banco de horas recebe o
            estorno do lançamento anterior e o novo, e a intercorrência já
            justificada não reabre.
          </p>

          {resultadoApuracao && (
            <p className={estilos.sucesso}>
              {resultadoApuracao.apurados} pessoa(s) apurada(s) em{" "}
              {formatarCompetencia(resultadoApuracao.ano, resultadoApuracao.mes)}{" "}
              · {resultadoApuracao.intercorrencias} intercorrência(s) ·{" "}
              {resultadoApuracao.sem_escala} sem escala vigente · saldo somado{" "}
              {formatarMinutos(resultadoApuracao.saldo_total_minutos)}
            </p>
          )}

          {resultadoApuracao &&
            resultadoApuracao.avisos_cadastro &&
            resultadoApuracao.avisos_cadastro.length > 0 && (
              <div className={estilos.aviso}>
                <strong>
                  Cadastro mudou enquanto a competência era apurada
                </strong>
                <ul>
                  {resultadoApuracao.avisos_cadastro.map((item) => (
                    <li key={item.colaborador_id}>
                      {item.nome} (matrícula {item.matricula}): {item.aviso}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {visao && visao.competencias.length > 0 && (
            <>
              <h3>Competências já apuradas</h3>
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Competência</th>
                      <th className={estilos.numero}>Pessoas</th>
                      <th className={estilos.numero}>Hora extra</th>
                      <th className={estilos.numero}>Saldo ao banco</th>
                      <th>Última apuração</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.competencias.map((item) => (
                      <tr key={`${item.ano}-${item.mes}`}>
                        <td>
                          <strong>
                            {formatarCompetencia(item.ano, item.mes)}
                          </strong>
                        </td>
                        <td className={estilos.numero}>{item.pessoas}</td>
                        <td className={estilos.numero}>
                          {formatarMinutos(item.he_minutos)}
                        </td>
                        <td
                          className={`${estilos.numero} ${classeSaldo(item.saldo_minutos)}`}
                        >
                          {formatarMinutos(item.saldo_minutos)}
                        </td>
                        <td>{formatarDataHora(item.ultima_apuracao_em)}</td>
                        <td>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            onClick={() => {
                              setAno(item.ano);
                              setMes(item.mes);
                            }}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ------------------------------------------------ prazo e expiração */}
        {visao?.pode.administrar && expiracao && expiracao.pessoas.length > 0 && (
          <section className={estilos.cartao}>
            <h2>Prazo de compensação</h2>
            <p className={estilos.notaRodape}>
              A hora guardada tem prazo: o da regra vigente de cada pessoa
              (empresa → unidade ou cargo → pessoa, em Parâmetros). A conta é
              FIFO — folga e atraso consomem o crédito mais antigo primeiro —, e
              o que sobra de pé além do prazo está vencido. Referência:{" "}
              {formatarData(expiracao.data_referencia)}.
            </p>

            {erroExpiracao && <p className={estilos.erro}>{erroExpiracao}</p>}
            {expirou && <p className={estilos.sucesso}>{expirou}</p>}

            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th className={estilos.numero}>Saldo</th>
                    <th className={estilos.numero}>Vencido</th>
                    <th>Próximo vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {expiracao.pessoas.map((pessoa) => (
                    <tr key={pessoa.colaborador_id}>
                      <td>
                        {pessoa.nome}
                        <br />
                        <span className={estilos.notaRodape}>
                          {pessoa.matricula}
                          {pessoa.creditos_vencidos.length > 0 &&
                            ` · ${pessoa.creditos_vencidos
                              .map(
                                (credito) =>
                                  `${formatarMinutos(credito.minutos)} de ${formatarData(credito.data)} (venceu ${formatarData(credito.vence_em)})`
                              )
                              .join("; ")}`}
                        </span>
                      </td>
                      <td
                        className={`${estilos.numero} ${classeSaldo(pessoa.saldo_minutos)}`}
                      >
                        {formatarMinutos(pessoa.saldo_minutos)}
                      </td>
                      <td className={estilos.numero}>
                        {pessoa.minutos_vencidos > 0
                          ? formatarMinutos(pessoa.minutos_vencidos)
                          : "—"}
                      </td>
                      <td>
                        {pessoa.proximo_vencimento
                          ? `${formatarMinutos(pessoa.proximo_vencimento.minutos)} em ${formatarData(pessoa.proximo_vencimento.data)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expiracao.total_minutos > 0 ? (
              <>
                <button
                  className={estilos.botao}
                  type="button"
                  disabled={expirando}
                  onClick={() => void expirar()}
                >
                  {expirando
                    ? "Expirando…"
                    : `Expirar ${formatarMinutos(expiracao.total_minutos)} vencidos`}
                </button>
                <p className={estilos.notaRodape}>
                  Lança um movimento de origem &quot;Expiração de saldo&quot; por
                  pessoa, com os créditos vencidos na observação. Rodar de novo
                  no mesmo dia não expira nada: o débito já consumiu esses
                  créditos.
                </p>
              </>
            ) : (
              <p className={estilos.notaRodape}>
                Nada vencido hoje — a coluna acima mostra o que vence a seguir.
              </p>
            )}
          </section>
        )}

        {/* ------------------------------------------------ importação */}
        {visao?.pode.importar && (
          <section className={estilos.cartao}>
            <h2>Importar marcações</h2>
            <p className={estilos.notaRodape}>
              Quatro colunas, com ou sem cabeçalho:{" "}
              <code>matricula ; data ; hora ; tipo</code>. Linha ruim vira
              rejeição COM MOTIVO e o resto do arquivo entra normalmente —
              reimportar o mesmo arquivo não duplica batida.
            </p>
            <form className={estilos.formulario} onSubmit={importar}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="arquivo">
                  Arquivo (CSV do relógio)
                </label>
                <input
                  className={estilos.campo}
                  id="arquivo"
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];
                    if (!arquivo) return;
                    setArquivoNome(arquivo.name);
                    setConteudo(await arquivo.text());
                  }}
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="separador">
                  Separador
                </label>
                <select
                  className={estilos.campo}
                  id="separador"
                  value={separador}
                  onChange={(evento) => setSeparador(evento.target.value)}
                >
                  <option value=";">ponto e vírgula</option>
                  <option value=",">vírgula</option>
                  <option value={"\t"}>tabulação</option>
                </select>
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={importando || conteudo.trim() === ""}
              >
                {importando ? "Importando…" : "Importar para a competência"}
              </button>
            </form>
            <div className={estilos.campoGrupo} style={{ marginTop: 12 }}>
              <label className={estilos.rotulo} htmlFor="conteudo">
                …ou cole o conteúdo aqui
              </label>
              <textarea
                className={estilos.campo}
                id="conteudo"
                rows={4}
                value={conteudo}
                onChange={(evento) => setConteudo(evento.target.value)}
                placeholder={"1001;2026-06-01;08:00;entrada"}
              />
            </div>

            {erroImportacao && <p className={estilos.erro}>{erroImportacao}</p>}

            {relatorio && (
              <div className={estilos.blocoImportacao}>
                <strong>
                  Lote {relatorio.lote_id}: {relatorio.linhas_lidas} linha(s)
                  lida(s), {relatorio.linhas_aceitas} aceita(s),{" "}
                  {relatorio.linhas_rejeitadas} rejeitada(s).
                </strong>
                {relatorio.rejeicoes.length > 0 && (
                  <ul className={estilos.rejeicoes}>
                    {relatorio.rejeicoes.slice(0, 50).map((rejeicao) => (
                      <li key={rejeicao.linha}>
                        linha {rejeicao.linha}: {rejeicao.motivo} —{" "}
                        <code>{rejeicao.conteudo}</code>
                      </li>
                    ))}
                    {relatorio.rejeicoes.length > 50 && (
                      <li>
                        … e mais {relatorio.rejeicoes.length - 50} rejeição(ões)
                        no relatório do lote.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------ intercorrências */}
        <section className={estilos.cartao}>
          <h2>
            Intercorrências abertas ({visao?.intercorrencias_total ?? 0})
          </h2>
          {/*
            O título mostra o TOTAL, não o tamanho da lista: a fila vem paginada
            e o corte é por data DESC, então o que fica de fora são as MAIS
            ANTIGAS — as que estão vencendo. Quando corta, a tela diz que cortou
            e diz desde quando existe pendência, senão o DP trabalha achando que
            a fila acabou.
          */}
          {filaCortada && (
            <div className={estilos.aviso}>
              Mostrando {visao?.intercorrencias.length} das{" "}
              {visao?.intercorrencias_total} abertas — as mais recentes. Há
              pendência aberta desde{" "}
              {formatarData(visao!.intercorrencia_mais_antiga!)}, que não cabe
              nesta lista. Trate por competência (o espelho de cada pessoa mostra
              a fila do mês dela) para chegar às mais antigas.
            </div>
          )}
          <p className={estilos.notaRodape}>
            <strong>Corrigir</strong> resolve daqui mesmo: o formulário grava
            marcação nova (origem <em>ajuste manual</em>) apontando para a que
            ela troca, reapura a competência e só então fecha a linha — nunca
            editar a batida anterior, que é append-only. As opções saem das
            batidas que aquele dia daquela pessoa tem de verdade. O espelho
            continua aberto para quem quiser ver a trilha inteira do mês.{" "}
            <strong>Justificar</strong> ou <strong>ignorar</strong> assume o
            fato de pé e exige observação: é o texto que a fiscalização lê.
          </p>
          {erroFila && <p className={estilos.erro}>{erroFila}</p>}
          {sucessoFila && <p className={estilos.sucesso}>{sucessoFila}</p>}
          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Colaborador</th>
                  <th>Tipo</th>
                  <th>Detalhe</th>
                  <th>Observação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(visao?.intercorrencias ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{formatarData(item.data)}</td>
                    <td>
                      <Link
                        className={estilos.ligacao}
                        href={`/ponto/espelho/${item.colaborador_id}?ano=${item.data.slice(0, 4)}&mes=${Number(item.data.slice(5, 7))}`}
                      >
                        {item.colaborador_nome}
                      </Link>
                      <br />
                      <span className={estilos.notaRodape}>
                        matrícula {item.matricula}
                      </span>
                    </td>
                    <td>{ROTULOS_TIPO_INTERCORRENCIA[item.tipo]}</td>
                    <td>{item.detalhe}</td>
                    <td>
                      <input
                        className={estilos.campo}
                        type="text"
                        value={observacoes[item.id] ?? ""}
                        placeholder="por que foi assim?"
                        onChange={(evento) =>
                          setObservacoes((atual) => ({
                            ...atual,
                            [item.id]: evento.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      {visao?.pode.ajustar && (
                        <>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={tratando === item.id}
                            onClick={() => abrirCorrecao(item)}
                          >
                            Corrigir
                          </button>{" "}
                        </>
                      )}
                      <button
                        className={estilos.botaoLinha}
                        type="button"
                        disabled={tratando === item.id}
                        onClick={() => void tratar(item.id, "justificada")}
                      >
                        Justificar
                      </button>{" "}
                      <button
                        className={estilos.botaoLinha}
                        type="button"
                        disabled={tratando === item.id}
                        onClick={() => void tratar(item.id, "ignorada")}
                      >
                        Ignorar
                      </button>
                    </td>
                  </tr>
                ))}
                {(visao?.intercorrencias.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6}>
                      {carregando
                        ? "Carregando…"
                        : "Nenhuma intercorrência aberta. Fila limpa."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className={estilos.notaRodape}>
            Situações possíveis:{" "}
            {Object.values(ROTULOS_STATUS_INTERCORRENCIA).join(" · ")}.
          </p>
        </section>

        {/* ------------------------------------------------ apuração da competência */}
        <section className={estilos.cartao}>
          <h2>
            Apuração de {formatarCompetencia(ano, mes)} (
            {visao?.apuracoes.length ?? 0} pessoa(s))
          </h2>

          {visao && visao.apuracoes.length > 0 && (
            <div className={estilos.cartoesResumo}>
              <div className={estilos.cartaoResumo}>
                <strong>{formatarMinutos(totais.trabalhado)}</strong>
                <span>horas trabalhadas na competência</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>{formatarMinutos(totais.he)}</strong>
                <span>hora extra (50% + 100%)</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>{formatarMinutos(totais.faltas)}</strong>
                <span>faltas apuradas</span>
              </div>
              <div
                className={`${estilos.cartaoResumo} ${totais.saldo < 0 ? estilos.cartaoResumoDestaque : ""}`}
              >
                <strong className={classeSaldo(totais.saldo)}>
                  {formatarMinutos(totais.saldo)}
                </strong>
                <span>saldo mandado ao banco de horas</span>
              </div>
            </div>
          )}

          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th className={estilos.numero}>Previsto</th>
                  <th className={estilos.numero}>Trabalhado</th>
                  <th className={estilos.numero}>HE 50%</th>
                  <th className={estilos.numero}>HE 100%</th>
                  <th className={estilos.numero}>Noturno</th>
                  <th className={estilos.numero}>Faltas</th>
                  <th className={estilos.numero}>Atrasos</th>
                  <th className={estilos.numero}>DSR</th>
                  <th className={estilos.numero}>Banco</th>
                  <th className={estilos.numero}>Pend.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(visao?.apuracoes ?? []).map((linha) => (
                  <tr key={linha.apuracao_id}>
                    <td>
                      <strong>{linha.nome}</strong>
                      <br />
                      <span className={estilos.notaRodape}>
                        matrícula {linha.matricula}
                      </span>
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.minutos_previstos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.minutos_trabalhados)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.he_50_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.he_100_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.adicional_noturno_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.faltas_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.atrasos_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.dsr_desconto_minutos)}
                    </td>
                    <td
                      className={`${estilos.numero} ${classeSaldo(linha.saldo_banco_minutos)}`}
                    >
                      {formatarMinutos(linha.saldo_banco_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {linha.intercorrencias_abertas > 0 ? (
                        <span
                          className={`${estilos.etiqueta} ${estilos.etiquetaConferencia}`}
                        >
                          {linha.intercorrencias_abertas}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link
                        className={estilos.ligacao}
                        href={`/ponto/espelho/${linha.colaborador_id}?ano=${ano}&mes=${mes}`}
                      >
                        Espelho
                      </Link>
                    </td>
                  </tr>
                ))}
                {(visao?.apuracoes.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={12}>
                      {carregando
                        ? "Carregando…"
                        : "Competência ainda não apurada. Importe as marcações e clique em “Apurar competência”."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className={estilos.notaRodape}>
          Datas e horas no horário de Brasília (America/Sao_Paulo). Marcação é
          append-only: correção é batida nova apontando para a anterior, e o
          saldo do banco é a soma dos movimentos — nunca um campo editável.
        </p>
      </main>

      {/* ------------------------------------------------ corrigir (diálogo) */}
      {corrigindo && (
        <div className={estilos.fundoDialogo}>
          <div className={estilos.dialogo} role="dialog" aria-modal="true">
            <h3>Corrigir a batida</h3>
            <p className={estilos.subDialogo}>
              {corrigindo.colaborador_nome} · matrícula {corrigindo.matricula} ·{" "}
              {ROTULOS_TIPO_INTERCORRENCIA[corrigindo.tipo]} em{" "}
              {formatarData(corrigindo.data)}
              <br />
              {corrigindo.detalhe}
            </p>

            {carregandoDia && !dia && (
              <p className={estilos.notaRodape}>Lendo as batidas do dia…</p>
            )}

            {dia && !dia.tem_escala && (
              <div className={estilos.aviso}>
                Sem escala vigente em {formatarData(dia.data)}: a lista abaixo é
                o que está gravado no dia civil, sem a jornada para amarrar o
                turno que vira a noite nem para dizer o que o dia esperava. O
                fechamento como corrigida vai recusar — trate como justificada,
                explicando o caso.
              </div>
            )}

            {dia && (
              <>
                <p className={estilos.notaRodape} style={{ marginTop: 0 }}>
                  Jornada: {dia.jornada ?? "sem escala vigente"} · previsto{" "}
                  {formatarMinutos(dia.previsto_minutos)} · o dia hoje:{" "}
                  {dia.sequencia}
                </p>

                <label className={estilos.rotuloCampo} htmlFor="correcao-dia">
                  Dia do ajuste
                </label>
                <div className={estilos.leituraFixa} id="correcao-dia">
                  {formatarData(dia.data)} — vem da intercorrência, não se
                  digita
                </div>

                <label
                  className={estilos.rotuloCampo}
                  htmlFor="correcao-registro"
                >
                  Qual registro
                </label>
                <select
                  className={estilos.campoLargo}
                  id="correcao-registro"
                  value={escolha}
                  onChange={(evento) => aplicarEscolha(dia, evento.target.value)}
                >
                  {/*
                    A lista NÃO é fixa: sai das batidas que ESTE dia desta
                    pessoa tem. Jornada de 6h não tem intervalo, e o turno que
                    atravessa a meia-noite traz a batida da madrugada amarrada
                    aqui — quem amarra é o mesmo motor que apura.
                  */}
                  {dia.registros.map((registro) =>
                    registro.batidas.length > 0
                      ? registro.batidas.map((batida) => (
                          <option
                            key={batida.id}
                            value={opcaoDaBatida(batida.id)}
                          >
                            {ROTULOS_TIPO_MARCACAO[registro.tipo]} — existe às{" "}
                            {batida.hora}
                            {batida.dia_seguinte ? " do dia seguinte" : ""}
                          </option>
                        ))
                      : [
                          <option
                            key={registro.tipo}
                            value={opcaoQueFalta(registro.tipo)}
                          >
                            {ROTULOS_TIPO_MARCACAO[registro.tipo]} — não existe
                            {registro.esperado
                              ? " (o dia esperava)"
                              : " (a jornada deste dia não prevê)"}
                          </option>,
                        ]
                  )}
                </select>

                <div className={estilos.paresDialogo}>
                  <div>
                    <label
                      className={estilos.rotuloCampo}
                      htmlFor="correcao-atual"
                    >
                      Hora que está
                    </label>
                    {/*
                      Batida que não existe não tem hora — e o formulário diz
                      isso em vez de exigir número. É este campo vazio que faz o
                      envio ir SEM substitui_marcacao_id: inclusão, não troca.
                    */}
                    <div
                      className={`${estilos.leituraFixa} ${
                        alvoCorrecao?.batida ? "" : estilos.leituraVazia
                      }`}
                      id="correcao-atual"
                    >
                      {alvoCorrecao?.batida
                        ? `${alvoCorrecao.batida.hora}${
                            alvoCorrecao.batida.dia_seguinte
                              ? " (dia seguinte)"
                              : ""
                          }`
                        : "não existe"}
                    </div>
                  </div>
                  <span className={estilos.setaPar} aria-hidden="true">
                    →
                  </span>
                  <div>
                    <label
                      className={estilos.rotuloCampo}
                      htmlFor="correcao-nova"
                    >
                      Hora que vai virar
                    </label>
                    {anulando ? (
                      <div
                        className={`${estilos.leituraFixa} ${estilos.leituraVazia}`}
                        id="correcao-nova"
                      >
                        nenhuma — a batida sai da apuração
                      </div>
                    ) : (
                      <input
                        className={estilos.campoLargo}
                        id="correcao-nova"
                        type="time"
                        value={horaNova}
                        onChange={(evento) => setHoraNova(evento.target.value)}
                      />
                    )}
                  </div>
                </div>

                {alvoCorrecao?.batida && (
                  <label className={estilos.caixaMarcar} htmlFor="correcao-anular">
                    <input
                      id="correcao-anular"
                      type="checkbox"
                      checked={anular}
                      onChange={(evento) => setAnular(evento.target.checked)}
                    />
                    Batida a mais: anular esta, sem virar hora nenhuma
                  </label>
                )}

                {dia.vira_a_noite && !anulando && (
                  <>
                    <label
                      className={estilos.rotuloCampo}
                      htmlFor="correcao-dia-civil"
                    >
                      Em que dia essa hora cai
                    </label>
                    <select
                      className={estilos.campoLargo}
                      id="correcao-dia-civil"
                      value={noDiaSeguinte ? "seguinte" : "mesmo"}
                      onChange={(evento) =>
                        setNoDiaSeguinte(evento.target.value === "seguinte")
                      }
                    >
                      <option value="mesmo">
                        {formatarData(dia.data)} — o próprio dia
                      </option>
                      <option value="seguinte">
                        {formatarData(dia.data_seguinte)} — madrugada seguinte
                        (turno que vira a noite)
                      </option>
                    </select>
                  </>
                )}

                <label
                  className={estilos.rotuloCampo}
                  htmlFor="correcao-justificativa"
                >
                  Justificativa (mínimo 10 caracteres — a fiscalização lê)
                </label>
                <textarea
                  className={estilos.campoLargo}
                  id="correcao-justificativa"
                  rows={3}
                  value={justificativa}
                  placeholder="por que a batida ficou assim e o que comprova a correção"
                  onChange={(evento) => setJustificativa(evento.target.value)}
                />

                <p className={estilos.notaRodape}>
                  {anulando
                    ? `Vai gravar uma ANULAÇÃO da batida de ${horaDaBatida} em ${formatarData(dataDaBatida)} (${ROTULOS_TIPO_MARCACAO[alvoCorrecao!.registro.tipo]}) — a original continua no espelho, riscada.`
                    : horaDaBatida
                      ? `Vai gravar ${ROTULOS_TIPO_MARCACAO[alvoCorrecao?.registro.tipo ?? "entrada"]} às ${horaDaBatida} de ${formatarData(dataDaBatida)}` +
                        (alvoCorrecao?.batida
                          ? `, substituindo a de ${alvoCorrecao.batida.hora}.`
                          : ", como batida nova (não substitui nenhuma).")
                      : "Informe a hora nova."}
                </p>
              </>
            )}

            {erroCorrecao && <p className={estilos.erro}>{erroCorrecao}</p>}
            {passoCorrecao && (
              <p className={estilos.passoCorrecao}>{passoCorrecao}</p>
            )}

            <div className={estilos.acoesDialogo}>
              <button
                className={estilos.botaoSecundario}
                type="button"
                disabled={salvandoCorrecao}
                onClick={fecharCorrecao}
              >
                Fechar
              </button>
              <button
                className={estilos.botao}
                type="button"
                disabled={!podeCorrigir}
                onClick={() => void corrigir()}
              >
                {salvandoCorrecao
                  ? "Corrigindo…"
                  : "Gravar, reapurar e fechar como corrigida"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
