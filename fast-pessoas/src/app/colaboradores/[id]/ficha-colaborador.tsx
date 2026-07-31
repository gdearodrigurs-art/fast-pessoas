"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import {
  GENEROS,
  Genero,
  MOTIVOS_POSICAO,
  MotivoPosicao,
  ROTULOS_GENERO,
  ROTULOS_MOTIVO_POSICAO,
  ROTULOS_OCORRENCIA,
  ROTULOS_STATUS,
  ROTULOS_STATUS_ACAO,
  ROTULOS_VINCULO,
  STATUS_COLABORADOR,
  StatusAcao,
  StatusColaborador,
  TIPOS_OCORRENCIA,
  TIPOS_VINCULO,
  TipoOcorrencia,
  TipoVinculo,
} from "@/dominios/colaboradores/esquemas";
import { formatarMinutos } from "@/dominios/ponto/esquemas";
import type { PermissoesFicha } from "./page";
import estilos from "./page.module.css";

/**
 * Bloco de ponto da ficha. Busca o próprio dado no domínio DONO
 * (`/api/ponto/resumo/[id]`, chave `ponto.ver.proprio` + alcance conferido no
 * serviço). Quem não alcança recebe 403 e o cartão simplesmente não aparece —
 * ausência, não máscara.
 */
interface ResumoPontoFicha {
  saldo_banco_minutos: number;
  media_he_por_dia_util_minutos_ultimo_mes: number;
  total_he_ultimo_mes_minutos: number;
  ultima_apuracao: { competencia: string } | null;
  intercorrencias_abertas: number;
  espelho_href: string;
}

function BlocoPontoFicha({ colaboradorId }: { colaboradorId: number }) {
  const [resumo, setResumo] = useState<ResumoPontoFicha | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/ponto/resumo/${colaboradorId}`, {
          cache: "no-store",
        });
        if (!ativo || !resposta.ok) return;
        setResumo((await resposta.json()) as ResumoPontoFicha);
      } catch {
        /* ficha segue sem o bloco de ponto */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [colaboradorId]);

  if (resumo === null) return null;
  return (
    <div className={estilos.cartao} style={{ marginTop: 16 }}>
      <h2>Ponto e banco de horas</h2>
      <div className={estilos.gradeDados}>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Saldo do banco de horas</div>
          <div className={estilos.val}>
            {formatarMinutos(resumo.saldo_banco_minutos)}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Hora extra no último mês</div>
          <div className={estilos.val}>
            {formatarMinutos(resumo.total_he_ultimo_mes_minutos)}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Média de HE por dia</div>
          <div className={estilos.val}>
            {formatarMinutos(resumo.media_he_por_dia_util_minutos_ultimo_mes)}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Última competência apurada</div>
          <div className={estilos.val}>
            {resumo.ultima_apuracao?.competencia ?? "—"}
          </div>
        </div>
        <div className={estilos.campoDado}>
          <div className={estilos.rot}>Intercorrências abertas</div>
          <div className={estilos.val}>{resumo.intercorrencias_abertas}</div>
        </div>
      </div>
      <p style={{ marginTop: 12 }}>
        <Link className={estilos.botaoLinha} href={resumo.espelho_href}>
          Abrir espelho de ponto
        </Link>
      </p>
    </div>
  );
}

/** RCF vigente do cargo da posição atual — documento de gestão, não sensível. */
interface Rcf {
  cargo_id: number;
  versao_id: number;
  nome: string;
  setor: string | null;
  cargo_lider_nome: string | null;
  tipo_contrato_previsto: TipoVinculo | null;
  missao: string | null;
  atividades: string[];
  cha: {
    conhecimentos?: string[];
    habilidades?: string[];
    atitudes?: string[];
  };
  observacoes: string | null;
  descricao: string | null;
  inicio_vigencia: string;
}

interface Ficha {
  id: number;
  matricula: string;
  matricula_esocial: string;
  cpf: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  data_nascimento: string | null;
  rcf: Rcf | null;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  email: string;
  usuario_ativo: boolean;
  cargo_nome: string | null;
  unidade: string | null;
  centro_custo: string | null;
  gestor_id: number | null;
  gestor_nome: string | null;
  ultimo_feedback_em: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
  feedback_vencido: boolean;
}

interface Evento {
  id: number;
  tipo: string;
  ocorrido_em: string;
  resumo: string;
}

interface Ocorrencia {
  id: number;
  tipo: TipoOcorrencia;
  restrita: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  ocorrida_em: string;
  registrado_por_nome: string;
}

interface Feedback {
  id: number;
  realizado_em: string;
  resumo: string;
  registrado_por_nome: string;
}

interface Cadencia {
  ultimo_em: string | null;
  dias_desde: number | null;
  vencido: boolean;
  parametro_dias: number;
}

interface Acao {
  id: number;
  descricao: string;
  prazo: string;
  status: StatusAcao;
  responsavel_nome: string;
  vencida: boolean;
}

interface Posicao {
  id: number;
  cargo_id: number;
  cargo_nome: string;
  salario: number;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface RelacaoGestor {
  id: number;
  gestor_colaborador_id: number;
  gestor_nome: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface Lotacao {
  id: number;
  estabelecimento_id: number;
  unidade: string | null;
  centro_custo: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface CargoOpcao {
  id: number;
  nome: string | null;
}

interface EstabelecimentoOpcao {
  id: number;
  unidade: string | null;
  cnpj: string;
}

interface ColaboradorOpcao {
  id: number;
  nome_completo: string;
  matricula: string;
}

type Aba = "dados" | "linha" | "ocorrencias" | "feedbacks" | "admin";

const ESTILO_PILL: Record<StatusColaborador, string> = {
  ativo: estilos.pillAtivo,
  afastado: estilos.pillAfastado,
  desligado: estilos.pillDesligado,
};

const ESTILO_CLF: Record<TipoOcorrencia, string> = {
  positivo: estilos.clfPositivo,
  negativo: estilos.clfNegativo,
  neutro: estilos.clfNeutro,
  alerta: estilos.clfAlerta,
};

const ESTILO_ACAO: Record<StatusAcao, string> = {
  aberta: estilos.etiquetaAberta,
  concluida: estilos.etiquetaConcluida,
  cancelada: estilos.etiquetaCancelada,
};

const TIPOS_EVENTO: Record<string, { rotulo: string; simbolo: string; cor: string }> = {
  admissao: { rotulo: "Admissão", simbolo: "⚑", cor: "#1a7f37" },
  desligamento: { rotulo: "Desligamento", simbolo: "✕", cor: "#c62828" },
  promocao: { rotulo: "Mudança de cargo", simbolo: "▲", cor: "#6d4fc2" },
  posicao_inicial: { rotulo: "Posição inicial", simbolo: "★", cor: "#6d4fc2" },
  reajuste: { rotulo: "Reajuste", simbolo: "$", cor: "#b58500" },
  feedback: { rotulo: "Feedback", simbolo: "✎", cor: "#1565c0" },
  ocorrencia: { rotulo: "Ocorrência", simbolo: "⚠", cor: "#c96f00" },
  mudanca_gestor: { rotulo: "Mudança de gestor", simbolo: "⇄", cor: "#00838f" },
  transferencia: { rotulo: "Transferência", simbolo: "➜", cor: "#00838f" },
  alteracao_status: { rotulo: "Status", simbolo: "•", cor: "#6b6763" },
  alteracao_vinculo: { rotulo: "Vínculo", simbolo: "•", cor: "#6b6763" },
};

const EVENTO_PADRAO = { rotulo: "Evento", simbolo: "•", cor: "#6b6763" };

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Datas de evento vêm em UTC; instantes reais são exibidos em
// America/Sao_Paulo. Fato datado (sem hora) é gravado à meia-noite UTC —
// nesse caso exibimos a própria data do fato, sem deslocar o fuso.
const formatoDataSp = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatoDataUtc = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatarDataEvento(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const fatoDatado = /T00:00:00(\.000)?Z$/.test(iso);
  return (fatoDatado ? formatoDataUtc : formatoDataSp).format(data);
}

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Operação falhou. Tente novamente.";
}

export function FichaColaborador({
  colaboradorId,
  permissoes,
}: {
  colaboradorId: number;
  permissoes: PermissoesFicha;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [linhaDoTempo, setLinhaDoTempo] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");

  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[] | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[] | null>(null);
  const [cadencia, setCadencia] = useState<Cadencia | null>(null);
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [posicoes, setPosicoes] = useState<Posicao[] | null>(null);
  const [relacoesGestor, setRelacoesGestor] = useState<RelacaoGestor[] | null>(null);
  const [lotacoes, setLotacoes] = useState<Lotacao[] | null>(null);
  const [cargos, setCargos] = useState<CargoOpcao[] | null>(null);
  const [estabelecimentos, setEstabelecimentos] = useState<EstabelecimentoOpcao[] | null>(null);
  const [colaboradoresOpcoes, setColaboradoresOpcoes] = useState<ColaboradorOpcao[] | null>(null);

  const [erroAba, setErroAba] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [formOcorrenciaAberto, setFormOcorrenciaAberto] = useState(false);
  const [formFeedbackAberto, setFormFeedbackAberto] = useState(false);
  const [formEdicaoAberto, setFormEdicaoAberto] = useState(false);

  const [novaOcorrencia, setNovaOcorrencia] = useState({
    ocorrida_em: "",
    tipo: "positivo" as TipoOcorrencia,
    restrita: false,
    descricao: "",
    impacto: "",
    acao_combinada: "",
  });
  const [novoFeedback, setNovoFeedback] = useState({ realizado_em: "", resumo: "" });
  const [novaAcao, setNovaAcao] = useState({ descricao: "", prazo: "" });
  const [edicao, setEdicao] = useState({
    nome_completo: "",
    tipo_vinculo: "clt" as TipoVinculo,
    status: "ativo" as StatusColaborador,
    data_desligamento: "",
    data_nascimento: "",
    // "" = não alterar. O valor guardado NUNCA vem no payload da ficha (LGPD:
    // gênero autodeclarado só existe em agregado), então o campo é de escrita.
    genero: "" as Genero | "",
    retrato: "",
    contexto: "",
  });
  const [novaPosicao, setNovaPosicao] = useState({
    cargo_id: "",
    salario: "",
    inicio_vigencia: "",
    motivo: "promocao" as MotivoPosicao,
  });
  const [novoGestor, setNovoGestor] = useState({ gestor_colaborador_id: "", inicio_vigencia: "" });
  const [novaLotacao, setNovaLotacao] = useState({
    estabelecimento_id: "",
    centro_custo: "",
    inicio_vigencia: "",
  });

  const carregarFicha = useCallback(async () => {
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}`);
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        setFicha(null);
        return;
      }
      const dados = await resposta.json();
      setFicha(dados.colaborador);
      setLinhaDoTempo(dados.linha_do_tempo ?? []);
      setErro(null);
      setEdicao({
        nome_completo: dados.colaborador.nome_completo,
        tipo_vinculo: dados.colaborador.tipo_vinculo,
        status: dados.colaborador.status,
        data_desligamento: dados.colaborador.data_desligamento ?? "",
        data_nascimento: dados.colaborador.data_nascimento ?? "",
        genero: "",
        retrato: dados.colaborador.retrato ?? "",
        contexto: dados.colaborador.contexto ?? "",
      });
    } catch {
      setErro("Falha de conexão. Recarregue a página.");
    } finally {
      setCarregando(false);
    }
  }, [colaboradorId]);

  const carregarOcorrencias = useCallback(async () => {
    const resposta = await fetch(`/api/colaboradores/${colaboradorId}/ocorrencias`);
    if (resposta.ok) {
      const dados = await resposta.json();
      setOcorrencias(dados.ocorrencias ?? []);
    }
  }, [colaboradorId]);

  const carregarFeedbacks = useCallback(async () => {
    const [respostaFeedbacks, respostaAcoes] = await Promise.all([
      fetch(`/api/colaboradores/${colaboradorId}/feedbacks`),
      fetch(`/api/colaboradores/${colaboradorId}/acoes`),
    ]);
    if (respostaFeedbacks.ok) {
      const dados = await respostaFeedbacks.json();
      setFeedbacks(dados.feedbacks ?? []);
      setCadencia(dados.cadencia ?? null);
    }
    if (respostaAcoes.ok) {
      const dados = await respostaAcoes.json();
      setAcoes(dados.acoes ?? []);
    }
  }, [colaboradorId]);

  const carregarPosicoes = useCallback(async () => {
    const resposta = await fetch(`/api/colaboradores/${colaboradorId}/posicao`);
    if (resposta.ok) {
      const dados = await resposta.json();
      setPosicoes(dados.posicoes ?? []);
    }
  }, [colaboradorId]);

  const carregarAdministracao = useCallback(async () => {
    if (permissoes.podeAdminGestor) {
      fetch(`/api/colaboradores/${colaboradorId}/gestor`).then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setRelacoesGestor(dados.historico ?? []);
        }
      });
      fetch("/api/colaboradores").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setColaboradoresOpcoes(dados.colaboradores ?? []);
        }
      });
    }
    if (permissoes.podeAdminLotacao) {
      fetch(`/api/colaboradores/${colaboradorId}/lotacao`).then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setLotacoes(dados.historico ?? []);
        }
      });
      fetch("/api/estabelecimentos").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setEstabelecimentos(dados.estabelecimentos ?? []);
        }
      });
    }
    if (permissoes.podeAdminCargo) {
      fetch("/api/cargos").then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setCargos(dados.cargos ?? []);
        }
      });
    }
  }, [colaboradorId, permissoes]);

  useEffect(() => {
    void (async () => {
      await carregarFicha();
    })();
  }, [carregarFicha]);

  useEffect(() => {
    void (async () => {
      if (aba === "dados" && permissoes.podeVerSalario && posicoes === null) {
        await carregarPosicoes();
      }
      if (aba === "ocorrencias" && ocorrencias === null) {
        await carregarOcorrencias();
      }
      if (aba === "feedbacks" && feedbacks === null) {
        await carregarFeedbacks();
      }
      if (aba === "admin") {
        if (permissoes.podeVerSalario && posicoes === null) {
          await carregarPosicoes();
        }
        if (relacoesGestor === null && lotacoes === null) {
          carregarAdministracao();
        }
      }
    })();
    // Dependências intencionais: dispara só na troca de aba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  async function enviarOcorrencia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/ocorrencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocorrida_em: novaOcorrencia.ocorrida_em,
          tipo: novaOcorrencia.tipo,
          restrita: novaOcorrencia.restrita,
          descricao: novaOcorrencia.descricao,
          impacto: novaOcorrencia.impacto.trim() || undefined,
          acao_combinada: novaOcorrencia.acao_combinada.trim() || undefined,
        }),
      });
      if (!resposta.ok) {
        setErroAba(await lerErro(resposta));
        return;
      }
      setNovaOcorrencia({
        ocorrida_em: "",
        tipo: "positivo",
        restrita: false,
        descricao: "",
        impacto: "",
        acao_combinada: "",
      });
      setFormOcorrenciaAberto(false);
      await Promise.all([carregarOcorrencias(), carregarFicha()]);
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarFeedback(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/feedbacks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoFeedback),
      });
      if (!resposta.ok) {
        setErroAba(await lerErro(resposta));
        return;
      }
      setNovoFeedback({ realizado_em: "", resumo: "" });
      setFormFeedbackAberto(false);
      await Promise.all([carregarFeedbacks(), carregarFicha()]);
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAcao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/acoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaAcao),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível criar a ação.");
        return;
      }
      setAcoes(dados.acoes ?? []);
      setNovaAcao({ descricao: "", prazo: "" });
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatusAcao(acaoId: number, status: "concluida" | "cancelada") {
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(
        `/api/colaboradores/${colaboradorId}/acoes/${acaoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível atualizar a ação.");
        return;
      }
      setAcoes(dados.acoes ?? []);
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const corpo: Record<string, unknown> = {
        nome_completo: edicao.nome_completo,
        tipo_vinculo: edicao.tipo_vinculo,
        status: edicao.status,
        retrato: edicao.retrato.trim() || null,
        contexto: edicao.contexto.trim() || null,
      };
      if (edicao.status === "desligado" && edicao.data_desligamento) {
        corpo.data_desligamento = edicao.data_desligamento;
      }
      if (edicao.data_nascimento) {
        corpo.data_nascimento = edicao.data_nascimento;
      }
      if (edicao.genero !== "") {
        corpo.genero = edicao.genero;
      }
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        setErroAba(await lerErro(resposta));
        return;
      }
      setFormEdicaoAberto(false);
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarPosicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/posicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cargo_id: Number(novaPosicao.cargo_id),
          salario: Number(novaPosicao.salario),
          inicio_vigencia: novaPosicao.inicio_vigencia,
          motivo: novaPosicao.motivo,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível registrar a posição.");
        return;
      }
      setPosicoes(dados.posicoes ?? []);
      setNovaPosicao({ cargo_id: "", salario: "", inicio_vigencia: "", motivo: "promocao" });
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarGestor(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await definirGestor(
      novoGestor.gestor_colaborador_id ? Number(novoGestor.gestor_colaborador_id) : null,
      novoGestor.inicio_vigencia
    );
  }

  async function definirGestor(gestorId: number | null, inicioVigencia: string) {
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/gestor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestor_colaborador_id: gestorId,
          inicio_vigencia: inicioVigencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível atualizar o gestor.");
        return;
      }
      setRelacoesGestor(dados.historico ?? []);
      setNovoGestor({ gestor_colaborador_id: "", inicio_vigencia: "" });
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarLotacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroAba(null);
    try {
      const resposta = await fetch(`/api/colaboradores/${colaboradorId}/lotacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estabelecimento_id: Number(novaLotacao.estabelecimento_id),
          centro_custo: novaLotacao.centro_custo,
          inicio_vigencia: novaLotacao.inicio_vigencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAba(dados.erro ?? "Não foi possível atualizar a lotação.");
        return;
      }
      setLotacoes(dados.historico ?? []);
      setNovaLotacao({ estabelecimento_id: "", centro_custo: "", inicio_vigencia: "" });
      await carregarFicha();
    } catch {
      setErroAba("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const mostrarAdmin =
    permissoes.podeVerSalario ||
    permissoes.podeEditarPosicao ||
    permissoes.podeAdminGestor ||
    permissoes.podeAdminLotacao;

  const posicaoVigente = posicoes?.find((posicao) => posicao.fim_vigencia === null) ?? null;

  if (carregando) {
    return (
      <div className={estilos.pagina}>
        <Cabecalho>
          <Link className={acaoCabecalho} href="/colaboradores">
            Colaboradores
          </Link>
        </Cabecalho>
        <main className={estilos.conteudo}>
          <p className={estilos.vazio}>Carregando…</p>
        </main>
      </div>
    );
  }

  if (erro || !ficha) {
    return (
      <div className={estilos.pagina}>
        <Cabecalho>
          <Link className={acaoCabecalho} href="/colaboradores">
            Colaboradores
          </Link>
        </Cabecalho>
        <main className={estilos.conteudo}>
          <p className={estilos.erro}>{erro ?? "Colaborador não encontrado."}</p>
          <Link className={estilos.voltar} href="/colaboradores">
            ← Voltar à lista
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/colaboradores">
          Colaboradores
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <Link className={estilos.voltar} href="/colaboradores">
          ← Voltar à lista
        </Link>

        <div className={estilos.cabecalhoFicha}>
          <div className={estilos.avatar}>{iniciais(ficha.nome_completo)}</div>
          <div className={estilos.info}>
            <h1>{ficha.nome_completo}</h1>
            <div className={estilos.chips}>
              <span className={estilos.chip}>matrícula {ficha.matricula}</span>
              {ficha.cargo_nome && <span className={estilos.chip}>{ficha.cargo_nome}</span>}
              {ficha.unidade && <span className={estilos.chip}>{ficha.unidade}</span>}
              <span className={`${estilos.pill} ${ESTILO_PILL[ficha.status]}`}>
                {ROTULOS_STATUS[ficha.status]}
              </span>
              <span className={estilos.chip}>
                admissão {formatarData(ficha.data_admissao)}
              </span>
              <span className={estilos.chip}>{ROTULOS_VINCULO[ficha.tipo_vinculo]}</span>
            </div>
            {ficha.retrato && (
              <div className={estilos.retrato}>
                <b>Retrato atual</b>
                {ficha.retrato}
              </div>
            )}
            {ficha.contexto && (
              <div className={estilos.retrato}>
                <b>Contexto histórico</b>
                {ficha.contexto}
              </div>
            )}
          </div>
          <div className={estilos.acoesTopo}>
            {permissoes.podeRegistrarOcorrencia && (
              <button
                className={estilos.botao}
                type="button"
                onClick={() => {
                  setAba("ocorrencias");
                  setFormOcorrenciaAberto(true);
                }}
              >
                + Registrar ocorrência
              </button>
            )}
            {permissoes.podeRegistrarFeedback && (
              <button
                className={estilos.botao}
                type="button"
                onClick={() => {
                  setAba("feedbacks");
                  setFormFeedbackAberto(true);
                }}
              >
                + Registrar feedback
              </button>
            )}
          </div>
        </div>

        {ficha.feedback_vencido &&
          ficha.status === "ativo" &&
          (permissoes.podeRegistrarFeedback || permissoes.podeEditar) && (
            <div className={estilos.banner90}>
              {ficha.ultimo_feedback_em
                ? `Feedback formal vencido: último em ${formatarData(ficha.ultimo_feedback_em)}, há ${ficha.dias_desde_feedback} dias (cadência padrão: 90 dias).`
                : "Nenhum feedback formal registrado — cadência de 90 dias vencida desde a admissão."}
            </div>
          )}

        <div className={estilos.abas}>
          {(
            [
              ["dados", "Dados"],
              ["linha", "Linha do tempo"],
              ["ocorrencias", "Ocorrências"],
              ["feedbacks", "Feedbacks/Ações"],
            ] as [Aba, string][]
          )
            .concat(mostrarAdmin ? [["admin", "Administração"] as [Aba, string]] : [])
            .map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                className={`${estilos.aba} ${aba === id ? estilos.abaAtiva : ""}`}
                onClick={() => {
                  setErroAba(null);
                  setAba(id);
                }}
              >
                {rotulo}
              </button>
            ))}
        </div>

        {erroAba && <p className={estilos.erro}>{erroAba}</p>}

        {aba === "dados" && (
          <>
            <div className={estilos.gradeDados}>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Matrícula própria</div>
                <div className={estilos.val}>{ficha.matricula}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Matrícula eSocial</div>
                <div className={estilos.val}>{ficha.matricula_esocial}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>CPF</div>
                <div className={estilos.val}>{formatarCpf(ficha.cpf)}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>E-mail</div>
                <div className={estilos.val}>{ficha.email}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Tipo de vínculo</div>
                <div className={estilos.val}>{ROTULOS_VINCULO[ficha.tipo_vinculo]}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Data de admissão</div>
                <div className={estilos.val}>{formatarData(ficha.data_admissao)}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Data de nascimento</div>
                <div className={estilos.val}>
                  {ficha.data_nascimento
                    ? formatarData(ficha.data_nascimento)
                    : "não cadastrada"}
                </div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Status</div>
                <div className={estilos.val}>
                  {ROTULOS_STATUS[ficha.status]}
                  {ficha.data_desligamento
                    ? ` em ${formatarData(ficha.data_desligamento)}`
                    : ""}
                </div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Unidade (lotação vigente)</div>
                <div className={estilos.val}>
                  {ficha.unidade ?? "—"}
                  {ficha.centro_custo ? ` · CC ${ficha.centro_custo}` : ""}
                </div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Cargo (posição vigente)</div>
                <div className={estilos.val}>{ficha.cargo_nome ?? "—"}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Gestor atual (relação vigente)</div>
                <div className={estilos.val}>{ficha.gestor_nome ?? "—"}</div>
              </div>
              <div className={estilos.campoDado}>
                <div className={estilos.rot}>Último feedback formal (derivado)</div>
                <div className={estilos.val}>
                  {ficha.ultimo_feedback_em
                    ? `${formatarData(ficha.ultimo_feedback_em)} — há ${ficha.dias_desde_feedback} dias`
                    : "nenhum"}
                </div>
              </div>
              {permissoes.podeVerSalario && (
                <div className={`${estilos.campoDado} ${estilos.campoRestrito}`}>
                  <div className={estilos.rot}>Salário — chave rh.posicao.ver</div>
                  <div className={estilos.val}>
                    {posicaoVigente ? formatarSalario(posicaoVigente.salario) : "—"}
                  </div>
                  <div className={estilos.notaRestrito}>
                    dado sensível · leitura gravada na trilha
                  </div>
                </div>
              )}
            </div>

            <BlocoPontoFicha colaboradorId={colaboradorId} />

            {/* RCF do cargo — pedido explícito da analista de RH. Vem da versão
                VIGENTE do cargo da posição atual; documento de gestão (não é
                dado sensível), visível a quem já vê a ficha. */}
            <div className={estilos.cartao} style={{ marginTop: 16 }}>
              <div className={estilos.rcfTopo}>
                <h2>
                  RCF do cargo
                  {ficha.rcf ? ` — ${ficha.rcf.nome}` : ""}
                </h2>
                {ficha.rcf && (
                  <Link
                    className={estilos.botaoLinha}
                    href={`/cargos/${ficha.rcf.cargo_id}/rcf`}
                  >
                    Abrir versão imprimível
                  </Link>
                )}
              </div>
              {!ficha.rcf ? (
                <p className={estilos.vazio}>
                  Sem RCF: esta pessoa não tem posição vigente ou o cargo não tem
                  versão ativa.
                </p>
              ) : (
                <>
                  <p className={estilos.rcfMeta}>
                    Responsabilidade Chave da Função · vigente desde{" "}
                    {formatarData(ficha.rcf.inicio_vigencia)}
                    {ficha.rcf.setor ? ` · setor ${ficha.rcf.setor}` : ""}
                    {ficha.rcf.cargo_lider_nome
                      ? ` · líder direto: ${ficha.rcf.cargo_lider_nome}`
                      : ""}
                    {ficha.rcf.tipo_contrato_previsto
                      ? ` · contrato previsto: ${ROTULOS_VINCULO[ficha.rcf.tipo_contrato_previsto]}`
                      : ""}
                  </p>
                  <h3 className={estilos.rcfTitulo}>Missão do cargo</h3>
                  {ficha.rcf.missao ? (
                    <p className={estilos.rcfTexto}>{ficha.rcf.missao}</p>
                  ) : (
                    <p className={estilos.vazio}>
                      Missão ainda não preenchida pelo gestor.
                    </p>
                  )}
                  {ficha.rcf.atividades.length > 0 && (
                    <>
                      <h3 className={estilos.rcfTitulo}>Atividades</h3>
                      <ol className={estilos.rcfLista}>
                        {ficha.rcf.atividades.map((atividade, indice) => (
                          <li key={`${indice}-${atividade}`}>{atividade}</li>
                        ))}
                      </ol>
                    </>
                  )}
                  <h3 className={estilos.rcfTitulo}>CHA</h3>
                  <div className={estilos.rcfCha}>
                    {(
                      [
                        ["Conhecimentos", ficha.rcf.cha.conhecimentos ?? []],
                        ["Habilidades", ficha.rcf.cha.habilidades ?? []],
                        ["Atitudes", ficha.rcf.cha.atitudes ?? []],
                      ] as [string, string[]][]
                    ).map(([titulo, itens]) => (
                      <div key={titulo} className={estilos.rcfChaColuna}>
                        <div className={estilos.rot}>{titulo}</div>
                        {itens.length > 0 ? (
                          <ul className={estilos.rcfLista}>
                            {itens.map((item, indice) => (
                              <li key={`${indice}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className={estilos.vazio}>—</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {ficha.rcf.observacoes && (
                    <>
                      <h3 className={estilos.rcfTitulo}>
                        Observações importantes
                      </h3>
                      <p className={estilos.rcfTexto}>{ficha.rcf.observacoes}</p>
                    </>
                  )}
                </>
              )}
            </div>

            {permissoes.podeEditar && (
              <div className={estilos.cartao} style={{ marginTop: 16 }}>
                <h2>Editar ficha</h2>
                {!formEdicaoAberto ? (
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    onClick={() => setFormEdicaoAberto(true)}
                  >
                    Editar dados cadastrais
                  </button>
                ) : (
                  <form className={estilos.formulario} onSubmit={enviarEdicao}>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edNome">
                        Nome completo
                      </label>
                      <input
                        className={estilos.campo}
                        id="edNome"
                        type="text"
                        required
                        maxLength={200}
                        value={edicao.nome_completo}
                        onChange={(e) =>
                          setEdicao((atual) => ({ ...atual, nome_completo: e.target.value }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edVinculo">
                        Tipo de vínculo
                      </label>
                      <select
                        className={estilos.campo}
                        id="edVinculo"
                        value={edicao.tipo_vinculo}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            tipo_vinculo: e.target.value as TipoVinculo,
                          }))
                        }
                      >
                        {TIPOS_VINCULO.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_VINCULO[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edStatus">
                        Status
                      </label>
                      <select
                        className={estilos.campo}
                        id="edStatus"
                        value={edicao.status}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            status: e.target.value as StatusColaborador,
                          }))
                        }
                      >
                        {STATUS_COLABORADOR.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_STATUS[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {edicao.status === "desligado" && (
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="edDesligamento">
                          Data de desligamento
                        </label>
                        <input
                          className={estilos.campo}
                          id="edDesligamento"
                          type="date"
                          required
                          value={edicao.data_desligamento}
                          onChange={(e) =>
                            setEdicao((atual) => ({
                              ...atual,
                              data_desligamento: e.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edNascimento">
                        Data de nascimento
                      </label>
                      <input
                        className={estilos.campo}
                        id="edNascimento"
                        type="date"
                        value={edicao.data_nascimento}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            data_nascimento: e.target.value,
                          }))
                        }
                      />
                    </div>
                    {/* Campo de ESCRITA: o valor guardado não é exibido em
                        lugar nenhum da ficha (gênero autodeclarado só aparece
                        em agregado, no relatório de diversidade). */}
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="edGenero">
                        Gênero (autodeclarado)
                      </label>
                      <select
                        className={estilos.campo}
                        id="edGenero"
                        value={edicao.genero}
                        onChange={(e) =>
                          setEdicao((atual) => ({
                            ...atual,
                            genero: e.target.value as Genero | "",
                          }))
                        }
                      >
                        <option value="">Não alterar</option>
                        {GENEROS.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_GENERO[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupoLargo}>
                      <label className={estilos.rotulo} htmlFor="edRetrato">
                        Retrato atual
                      </label>
                      <textarea
                        className={estilos.campo}
                        id="edRetrato"
                        rows={2}
                        maxLength={2000}
                        value={edicao.retrato}
                        onChange={(e) =>
                          setEdicao((atual) => ({ ...atual, retrato: e.target.value }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupoLargo}>
                      <label className={estilos.rotulo} htmlFor="edContexto">
                        Contexto histórico
                      </label>
                      <textarea
                        className={estilos.campo}
                        id="edContexto"
                        rows={2}
                        maxLength={4000}
                        value={edicao.contexto}
                        onChange={(e) =>
                          setEdicao((atual) => ({ ...atual, contexto: e.target.value }))
                        }
                      />
                    </div>
                    <button className={estilos.botao} type="submit" disabled={salvando}>
                      {salvando ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      onClick={() => setFormEdicaoAberto(false)}
                    >
                      Cancelar
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {aba === "linha" &&
          (linhaDoTempo.length === 0 ? (
            <p className={estilos.vazio}>Nenhum evento visível para o seu papel.</p>
          ) : (
            <div className={estilos.linhaTempo}>
              {linhaDoTempo.map((evento) => {
                const tipo = TIPOS_EVENTO[evento.tipo] ?? EVENTO_PADRAO;
                return (
                  <div key={evento.id} className={estilos.evento}>
                    <div
                      className={estilos.eventoPonto}
                      style={{ background: tipo.cor }}
                    >
                      {tipo.simbolo}
                    </div>
                    <div className={estilos.eventoCartao}>
                      <div className={estilos.eventoMeta}>
                        <span className={estilos.eventoTipo} style={{ color: tipo.cor }}>
                          {tipo.rotulo}
                        </span>
                        <span>{formatarDataEvento(evento.ocorrido_em)}</span>
                      </div>
                      <div className={estilos.eventoResumo}>{evento.resumo}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {aba === "ocorrencias" && (
          <>
            {permissoes.podeRegistrarOcorrencia && formOcorrenciaAberto && (
              <div className={estilos.cartao}>
                <h2>Registrar ocorrência</h2>
                <form className={estilos.formulario} onSubmit={enviarOcorrencia}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocData">
                      Data do fato
                    </label>
                    <input
                      className={estilos.campo}
                      id="ocData"
                      type="date"
                      required
                      value={novaOcorrencia.ocorrida_em}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          ocorrida_em: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocTipo">
                      Classificação
                    </label>
                    <select
                      className={estilos.campo}
                      id="ocTipo"
                      value={novaOcorrencia.tipo}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          tipo: e.target.value as TipoOcorrencia,
                        }))
                      }
                    >
                      {TIPOS_OCORRENCIA.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {ROTULOS_OCORRENCIA[opcao]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupoLargo}>
                    <label className={estilos.rotulo} htmlFor="ocDescricao">
                      Descrição (fato, causa provável)
                    </label>
                    <textarea
                      className={estilos.campo}
                      id="ocDescricao"
                      rows={3}
                      required
                      maxLength={4000}
                      value={novaOcorrencia.descricao}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          descricao: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocImpacto">
                      Impacto (opcional)
                    </label>
                    <input
                      className={estilos.campo}
                      id="ocImpacto"
                      type="text"
                      maxLength={2000}
                      value={novaOcorrencia.impacto}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          impacto: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="ocAcao">
                      Ação combinada (opcional)
                    </label>
                    <input
                      className={estilos.campo}
                      id="ocAcao"
                      type="text"
                      maxLength={2000}
                      value={novaOcorrencia.acao_combinada}
                      onChange={(e) =>
                        setNovaOcorrencia((atual) => ({
                          ...atual,
                          acao_combinada: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {permissoes.podeVerRestrita && (
                    <label className={estilos.linhaCheck}>
                      <input
                        type="checkbox"
                        checked={novaOcorrencia.restrita}
                        onChange={(e) =>
                          setNovaOcorrencia((atual) => ({
                            ...atual,
                            restrita: e.target.checked,
                          }))
                        }
                      />
                      Disciplinar / restrita (só quem tem a chave vê; leitura logada)
                    </label>
                  )}
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Registrando…" : "Registrar"}
                  </button>
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    onClick={() => setFormOcorrenciaAberto(false)}
                  >
                    Cancelar
                  </button>
                </form>
              </div>
            )}
            {permissoes.podeRegistrarOcorrencia && !formOcorrenciaAberto && (
              <p style={{ marginBottom: 14 }}>
                <button
                  className={estilos.botao}
                  type="button"
                  onClick={() => setFormOcorrenciaAberto(true)}
                >
                  + Registrar ocorrência
                </button>
              </p>
            )}
            {ocorrencias === null ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : ocorrencias.length === 0 ? (
              <p className={estilos.vazio}>Nenhuma ocorrência visível para o seu papel.</p>
            ) : (
              ocorrencias.map((ocorrencia) => (
                <div key={ocorrencia.id} className={estilos.itemRegistro}>
                  <div className={estilos.itemTopo}>
                    <span className={`${estilos.clf} ${ESTILO_CLF[ocorrencia.tipo]}`}>
                      {ROTULOS_OCORRENCIA[ocorrencia.tipo]}
                    </span>
                    <span>{formatarData(ocorrencia.ocorrida_em)}</span>
                    <span>registrado por {ocorrencia.registrado_por_nome}</span>
                    {ocorrencia.restrita && (
                      <span className={estilos.tagRestrito}>RESTRITA · leitura logada</span>
                    )}
                  </div>
                  <div className={estilos.itemTexto}>{ocorrencia.descricao}</div>
                  {ocorrencia.impacto && (
                    <div className={estilos.itemExtra}>Impacto: {ocorrencia.impacto}</div>
                  )}
                  {ocorrencia.acao_combinada && (
                    <div className={estilos.itemExtra}>
                      Ação combinada: {ocorrencia.acao_combinada}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {aba === "feedbacks" && (
          <>
            {cadencia && (
              <div
                className={`${estilos.aviso} ${
                  cadencia.vencido ? estilos.avisoVencido : estilos.avisoOk
                }`}
              >
                {cadencia.vencido
                  ? `Cadência vencida: último feedback formal há ${cadencia.dias_desde ?? "—"} dias (parâmetro: ${cadencia.parametro_dias} dias).`
                  : `Cadência em dia: último feedback formal há ${cadencia.dias_desde} dias (parâmetro: ${cadencia.parametro_dias} dias).`}
              </div>
            )}

            {permissoes.podeRegistrarFeedback && formFeedbackAberto && (
              <div className={estilos.cartao}>
                <h2>Registrar feedback formal</h2>
                <form className={estilos.formulario} onSubmit={enviarFeedback}>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="fbData">
                      Data
                    </label>
                    <input
                      className={estilos.campo}
                      id="fbData"
                      type="date"
                      required
                      value={novoFeedback.realizado_em}
                      onChange={(e) =>
                        setNovoFeedback((atual) => ({
                          ...atual,
                          realizado_em: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupoLargo}>
                    <label className={estilos.rotulo} htmlFor="fbResumo">
                      Resumo da conversa / acordos
                    </label>
                    <textarea
                      className={estilos.campo}
                      id="fbResumo"
                      rows={3}
                      required
                      maxLength={4000}
                      value={novoFeedback.resumo}
                      onChange={(e) =>
                        setNovoFeedback((atual) => ({ ...atual, resumo: e.target.value }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Registrando…" : "Registrar"}
                  </button>
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    onClick={() => setFormFeedbackAberto(false)}
                  >
                    Cancelar
                  </button>
                </form>
              </div>
            )}
            {permissoes.podeRegistrarFeedback && !formFeedbackAberto && (
              <p style={{ marginBottom: 14 }}>
                <button
                  className={estilos.botao}
                  type="button"
                  onClick={() => setFormFeedbackAberto(true)}
                >
                  + Registrar feedback
                </button>
              </p>
            )}

            {feedbacks === null ? (
              <p className={estilos.vazio}>Carregando…</p>
            ) : feedbacks.length === 0 ? (
              <p className={estilos.vazio}>Nenhum feedback formal registrado.</p>
            ) : (
              feedbacks.map((feedback) => (
                <div key={feedback.id} className={estilos.itemRegistro}>
                  <div className={estilos.itemTopo}>
                    <span className={`${estilos.clf} ${estilos.clfNeutro}`}>
                      feedback formal
                    </span>
                    <span>{formatarData(feedback.realizado_em)}</span>
                    <span>registrado por {feedback.registrado_por_nome}</span>
                  </div>
                  <div className={estilos.itemTexto}>{feedback.resumo}</div>
                </div>
              ))
            )}

            <div className={estilos.cartao} style={{ marginTop: 16 }}>
              <h2>Ações abertas</h2>
              {permissoes.podeRegistrarFeedback && (
                <form
                  className={estilos.formulario}
                  onSubmit={enviarAcao}
                  style={{ marginBottom: 14 }}
                >
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="acDescricao">
                      Nova ação
                    </label>
                    <input
                      className={estilos.campo}
                      id="acDescricao"
                      type="text"
                      required
                      maxLength={2000}
                      placeholder="ex.: revisar meta em 30 dias"
                      value={novaAcao.descricao}
                      onChange={(e) =>
                        setNovaAcao((atual) => ({ ...atual, descricao: e.target.value }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="acPrazo">
                      Prazo
                    </label>
                    <input
                      className={estilos.campo}
                      id="acPrazo"
                      type="date"
                      required
                      value={novaAcao.prazo}
                      onChange={(e) =>
                        setNovaAcao((atual) => ({ ...atual, prazo: e.target.value }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Criando…" : "Criar ação"}
                  </button>
                </form>
              )}
              {acoes === null ? (
                <p className={estilos.vazio}>Carregando…</p>
              ) : acoes.length === 0 ? (
                <p className={estilos.vazio}>Nenhuma ação registrada.</p>
              ) : (
                acoes.map((acao) => (
                  <div key={acao.id} className={estilos.itemRegistro}>
                    <div className={estilos.itemTopo}>
                      <span className={ESTILO_ACAO[acao.status]}>
                        {ROTULOS_STATUS_ACAO[acao.status]}
                      </span>
                      {acao.vencida && (
                        <span className={estilos.etiquetaVencida}>vencida</span>
                      )}
                      <span>prazo {formatarData(acao.prazo)}</span>
                      <span>responsável: {acao.responsavel_nome}</span>
                      {permissoes.podeRegistrarFeedback && acao.status === "aberta" && (
                        <>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => mudarStatusAcao(acao.id, "concluida")}
                          >
                            Concluir
                          </button>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => mudarStatusAcao(acao.id, "cancelada")}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                    <div className={estilos.itemTexto}>{acao.descricao}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {aba === "admin" && mostrarAdmin && (
          <>
            {permissoes.podeVerSalario && (
              <div className={estilos.cartao}>
                <h2>Posição e salário (histórico por vigência)</h2>
                <p className={estilos.aviso}>
                  Dado sensível: cada leitura desta seção fica registrada na trilha.
                  Mudança encerra a vigência atual e cria uma nova — nunca edita o
                  passado.
                </p>
                {posicoes === null ? (
                  <p className={estilos.vazio}>Carregando…</p>
                ) : posicoes.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma posição registrada.</p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Cargo</th>
                          <th>Salário</th>
                          <th>Início</th>
                          <th>Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posicoes.map((posicao) => (
                          <tr key={posicao.id}>
                            <td>{posicao.cargo_nome}</td>
                            <td>{formatarSalario(posicao.salario)}</td>
                            <td>{formatarData(posicao.inicio_vigencia)}</td>
                            <td>
                              {posicao.fim_vigencia
                                ? formatarData(posicao.fim_vigencia)
                                : "vigente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {permissoes.podeEditarPosicao && (
                  <form
                    className={estilos.formulario}
                    onSubmit={enviarPosicao}
                    style={{ marginTop: 14 }}
                  >
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poCargo">
                        Cargo
                      </label>
                      <select
                        className={estilos.campo}
                        id="poCargo"
                        required
                        value={novaPosicao.cargo_id}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({ ...atual, cargo_id: e.target.value }))
                        }
                      >
                        <option value="">Selecione…</option>
                        {(cargos ?? [])
                          .filter((cargo) => cargo.nome)
                          .map((cargo) => (
                            <option key={cargo.id} value={cargo.id}>
                              {cargo.nome}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poSalario">
                        Salário (R$)
                      </label>
                      <input
                        className={estilos.campo}
                        id="poSalario"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={novaPosicao.salario}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({ ...atual, salario: e.target.value }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poInicio">
                        Início da vigência
                      </label>
                      <input
                        className={estilos.campo}
                        id="poInicio"
                        type="date"
                        required
                        value={novaPosicao.inicio_vigencia}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({
                            ...atual,
                            inicio_vigencia: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="poMotivo">
                        Motivo
                      </label>
                      <select
                        className={estilos.campo}
                        id="poMotivo"
                        value={novaPosicao.motivo}
                        onChange={(e) =>
                          setNovaPosicao((atual) => ({
                            ...atual,
                            motivo: e.target.value as MotivoPosicao,
                          }))
                        }
                      >
                        {MOTIVOS_POSICAO.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_MOTIVO_POSICAO[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className={estilos.botao} type="submit" disabled={salvando}>
                      {salvando ? "Registrando…" : "Registrar nova posição"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {permissoes.podeAdminGestor && (
              <div className={estilos.cartao}>
                <h2>Gestor (relação com vigência)</h2>
                {relacoesGestor === null ? (
                  <p className={estilos.vazio}>Carregando…</p>
                ) : relacoesGestor.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma relação de gestor registrada.</p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Gestor</th>
                          <th>Início</th>
                          <th>Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relacoesGestor.map((relacao) => (
                          <tr key={relacao.id}>
                            <td>{relacao.gestor_nome}</td>
                            <td>{formatarData(relacao.inicio_vigencia)}</td>
                            <td>
                              {relacao.fim_vigencia
                                ? formatarData(relacao.fim_vigencia)
                                : "vigente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <form
                  className={estilos.formulario}
                  onSubmit={enviarGestor}
                  style={{ marginTop: 14 }}
                >
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="geGestor">
                      Novo gestor
                    </label>
                    <select
                      className={estilos.campo}
                      id="geGestor"
                      required
                      value={novoGestor.gestor_colaborador_id}
                      onChange={(e) =>
                        setNovoGestor((atual) => ({
                          ...atual,
                          gestor_colaborador_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {(colaboradoresOpcoes ?? [])
                        .filter((opcao) => opcao.id !== colaboradorId)
                        .map((opcao) => (
                          <option key={opcao.id} value={opcao.id}>
                            {opcao.nome_completo} ({opcao.matricula})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="geInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="geInicio"
                      type="date"
                      required
                      value={novoGestor.inicio_vigencia}
                      onChange={(e) =>
                        setNovoGestor((atual) => ({
                          ...atual,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Salvando…" : "Definir gestor"}
                  </button>
                  {ficha.gestor_id !== null && (
                    <button
                      className={estilos.botaoLinha}
                      type="button"
                      disabled={salvando || !novoGestor.inicio_vigencia}
                      title="Usa a data de início informada como data do encerramento"
                      onClick={() => definirGestor(null, novoGestor.inicio_vigencia)}
                    >
                      Encerrar relação vigente
                    </button>
                  )}
                </form>
              </div>
            )}

            {permissoes.podeAdminLotacao && (
              <div className={estilos.cartao}>
                <h2>Lotação (unidade × centro de custo)</h2>
                {lotacoes === null ? (
                  <p className={estilos.vazio}>Carregando…</p>
                ) : lotacoes.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma lotação registrada.</p>
                ) : (
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Unidade</th>
                          <th>Centro de custo</th>
                          <th>Início</th>
                          <th>Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotacoes.map((lotacao) => (
                          <tr key={lotacao.id}>
                            <td>{lotacao.unidade ?? "—"}</td>
                            <td>{lotacao.centro_custo}</td>
                            <td>{formatarData(lotacao.inicio_vigencia)}</td>
                            <td>
                              {lotacao.fim_vigencia
                                ? formatarData(lotacao.fim_vigencia)
                                : "vigente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <form
                  className={estilos.formulario}
                  onSubmit={enviarLotacao}
                  style={{ marginTop: 14 }}
                >
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loEstab">
                      Estabelecimento
                    </label>
                    <select
                      className={estilos.campo}
                      id="loEstab"
                      required
                      value={novaLotacao.estabelecimento_id}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          estabelecimento_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {(estabelecimentos ?? []).map((opcao) => (
                        <option key={opcao.id} value={opcao.id}>
                          {opcao.unidade ?? `CNPJ ${opcao.cnpj}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loCc">
                      Centro de custo
                    </label>
                    <input
                      className={estilos.campo}
                      id="loCc"
                      type="text"
                      required
                      maxLength={30}
                      value={novaLotacao.centro_custo}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          centro_custo: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className={estilos.campoGrupo}>
                    <label className={estilos.rotulo} htmlFor="loInicio">
                      Início da vigência
                    </label>
                    <input
                      className={estilos.campo}
                      id="loInicio"
                      type="date"
                      required
                      value={novaLotacao.inicio_vigencia}
                      onChange={(e) =>
                        setNovaLotacao((atual) => ({
                          ...atual,
                          inicio_vigencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className={estilos.botao} type="submit" disabled={salvando}>
                    {salvando ? "Salvando…" : "Definir lotação"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
