"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  RESULTADOS_ASO,
  ResultadoAso,
  ROTULOS_RESULTADO_ASO,
  ROTULOS_STATUS_CAT,
  ROTULOS_TIPO_ASO,
  ROTULOS_TIPO_CAT,
  STATUS_CAT,
  StatusCat,
  TIPOS_ASO,
  TIPOS_CAT,
  TipoAso,
  TipoCat,
} from "@/dominios/sst/esquemas";
import estilos from "./page.module.css";

// ------------------------------------------------------------------ tipos das respostas

interface Aso {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoAso;
  tipo_rotulo: string;
  data_exame: string;
  validade: string | null;
  // presentes só quando a API devolve a visão com dado de saúde
  resultado?: ResultadoAso;
  resultado_rotulo?: string;
  restricoes?: string | null;
  documento_id?: number | null;
  documento_titulo?: string | null;
  registrado_por_nome?: string;
}

interface ItemVencimento {
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  validade: string;
}

interface PainelVencimentos {
  vencidos: ItemVencimento[];
  vence_30: ItemVencimento[];
  vence_60: ItemVencimento[];
  sem_validade: number;
  total_monitorado: number;
  em_dia: number;
}

interface ItemEpi {
  id: number;
  nome: string;
  numero_ca: string | null;
  validade_ca: string | null;
  ativo: boolean;
}

interface EntregaEpi {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  epi_item_id: number;
  item_nome: string;
  numero_ca: string | null;
  quantidade: number;
  data_entrega: string;
  termo_documento_id: number | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  devolvido_em: string | null;
}

interface Cat {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoCat;
  tipo_rotulo: string;
  data_acidente: string;
  descricao: string;
  houve_afastamento: boolean;
  afastamento_id: number | null;
  status: StatusCat;
  status_rotulo: string;
  cat_anterior_id: number | null;
  substituida_por_id: number | null;
  registrado_por_nome: string;
}

interface ColaboradorOpcao {
  id: number;
  matricula: string;
  nome_completo: string;
}

interface DocumentoOpcao {
  id: number;
  titulo: string;
  colaborador_id: number | null;
  sensivel: boolean;
}

interface VinculoAfastamento {
  id: number;
  colaborador_id: number;
  inicio: string;
  fim: string | null;
}

type Aba = "asos" | "epis" | "cats";

// ------------------------------------------------------------------ apoio

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(instanteIso: string): string {
  return new Date(instanteIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hojeIso(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

// ------------------------------------------------------------------ componente

export function PainelSst({
  podeVer,
  podeGerir,
  podeVerSaude,
  podeVerDocSensivel,
}: {
  podeVer: boolean;
  podeGerir: boolean;
  podeVerSaude: boolean;
  podeVerDocSensivel: boolean;
}) {
  const [aba, setAba] = useState<Aba>("asos");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(podeVer);
  const [versao, setVersao] = useState(0);

  const [asos, setAsos] = useState<Aso[]>([]);
  // Palpite inicial pela flag de navegação; a API confirma em toda resposta.
  const [comSaude, setComSaude] = useState(podeVerSaude);
  const [painel, setPainel] = useState<PainelVencimentos | null>(null);
  const [itens, setItens] = useState<ItemEpi[]>([]);
  const [entregas, setEntregas] = useState<EntregaEpi[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [minhasEntregas, setMinhasEntregas] = useState<EntregaEpi[]>([]);

  const [colaboradores, setColaboradores] = useState<ColaboradorOpcao[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoOpcao[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAfastamento[]>([]);

  // ---------------------------------------------------------------- carga

  useEffect(() => {
    if (!podeVer) return;
    let ativo = true;
    (async () => {
      try {
        const [respAsos, respItens, respEntregas, respCats] =
          await Promise.all([
            fetch("/api/sst/asos"),
            fetch("/api/sst/epis"),
            fetch("/api/sst/epis/entregas"),
            fetch("/api/sst/cats"),
          ]);
        const [dadosAsos, dadosItens, dadosEntregas, dadosCats] =
          await Promise.all([
            respAsos.json().catch(() => ({})),
            respItens.json().catch(() => ({})),
            respEntregas.json().catch(() => ({})),
            respCats.json().catch(() => ({})),
          ]);
        if (!ativo) return;
        if (respAsos.ok) {
          setAsos(dadosAsos.asos ?? []);
          setComSaude(Boolean(dadosAsos.com_saude));
          setPainel(dadosAsos.painel ?? null);
          setErro(null);
        } else {
          setErro(dadosAsos.erro ?? "Não foi possível carregar o painel de SST.");
        }
        if (respItens.ok) setItens(dadosItens.itens ?? []);
        if (respEntregas.ok) setEntregas(dadosEntregas.entregas ?? []);
        if (respCats.ok) setCats(dadosCats.cats ?? []);
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [podeVer, versao]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/sst/epis/entregas/minhas");
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) setMinhasEntregas(dados.entregas ?? []);
      } catch {
        // Seção do titular é opcional — o restante da tela segue.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [versao]);

  useEffect(() => {
    if (!podeGerir) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/colaboradores");
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) setColaboradores(dados.colaboradores ?? []);
      } catch {
        // Sem a lista os formulários ficam inutilizáveis, mas a tela carrega.
      }
      try {
        // ASO em PDF é documento sensível: quem tem a chave lista com elas
        // (a leitura fica na trilha do GED); sem a chave, só os comuns.
        const resposta = await fetch(
          podeVerDocSensivel ? "/api/documentos?sensivel=true" : "/api/documentos"
        );
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) setDocumentos(dados.documentos ?? []);
      } catch {
        // Documento é opcional — o registro segue sem anexo.
      }
      try {
        const resposta = await fetch("/api/sst/cats/vinculos");
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) setVinculos(dados.afastamentos ?? []);
      } catch {
        // Vínculo é opcional.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [podeGerir, podeVerDocSensivel]);

  function recarregar() {
    setVersao((atual) => atual + 1);
  }

  // ---------------------------------------------------------------- formulário: ASO

  const [asoColaboradorId, setAsoColaboradorId] = useState("");
  const [asoTipo, setAsoTipo] = useState<TipoAso>("periodico");
  const [asoDataExame, setAsoDataExame] = useState("");
  const [asoValidade, setAsoValidade] = useState("");
  const [asoResultado, setAsoResultado] = useState<ResultadoAso>("apto");
  const [asoRestricoes, setAsoRestricoes] = useState("");
  const [asoDocumentoId, setAsoDocumentoId] = useState("");
  const [asoEnviando, setAsoEnviando] = useState(false);
  const [asoErro, setAsoErro] = useState<string | null>(null);
  const [asoAviso, setAsoAviso] = useState<string | null>(null);

  async function registrarAso(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAsoErro(null);
    setAsoAviso(null);
    setAsoEnviando(true);
    try {
      const resposta = await fetch("/api/sst/asos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: Number(asoColaboradorId),
          tipo: asoTipo,
          data_exame: asoDataExame,
          validade: asoValidade || null,
          resultado: asoResultado,
          restricoes:
            asoResultado === "apto" ? undefined : asoRestricoes || undefined,
          documento_id: asoDocumentoId ? Number(asoDocumentoId) : null,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setAsoColaboradorId("");
        setAsoTipo("periodico");
        setAsoDataExame("");
        setAsoValidade("");
        setAsoResultado("apto");
        setAsoRestricoes("");
        setAsoDocumentoId("");
        setAsoAviso(
          "ASO registrado. Resultado e restrições são dado de saúde: cifrados/ausentes para quem não tem a permissão específica."
        );
        recarregar();
      } else {
        setAsoErro(dados.erro ?? "Não foi possível registrar o ASO.");
      }
    } catch {
      setAsoErro("Falha de conexão. Tente novamente.");
    } finally {
      setAsoEnviando(false);
    }
  }

  // ---------------------------------------------------------------- formulário: item EPI

  const [itemNome, setItemNome] = useState("");
  const [itemCa, setItemCa] = useState("");
  const [itemValidadeCa, setItemValidadeCa] = useState("");
  const [itemEnviando, setItemEnviando] = useState(false);
  const [itemErro, setItemErro] = useState<string | null>(null);

  async function criarItem(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setItemErro(null);
    setItemEnviando(true);
    try {
      const resposta = await fetch("/api/sst/epis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: itemNome,
          numero_ca: itemCa || undefined,
          validade_ca: itemValidadeCa || null,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setItemNome("");
        setItemCa("");
        setItemValidadeCa("");
        recarregar();
      } else {
        setItemErro(dados.erro ?? "Não foi possível cadastrar o EPI.");
      }
    } catch {
      setItemErro("Falha de conexão. Tente novamente.");
    } finally {
      setItemEnviando(false);
    }
  }

  // ---------------------------------------------------------------- formulário: entrega EPI

  const [entregaColaboradorId, setEntregaColaboradorId] = useState("");
  const [entregaItemId, setEntregaItemId] = useState("");
  const [entregaQuantidade, setEntregaQuantidade] = useState("1");
  const [entregaData, setEntregaData] = useState("");
  const [entregaTermoId, setEntregaTermoId] = useState("");
  const [entregaEnviando, setEntregaEnviando] = useState(false);
  const [entregaErro, setEntregaErro] = useState<string | null>(null);
  const [entregaAviso, setEntregaAviso] = useState<string | null>(null);
  const [mostrarDevolvidas, setMostrarDevolvidas] = useState(false);

  async function registrarEntrega(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEntregaErro(null);
    setEntregaAviso(null);
    setEntregaEnviando(true);
    try {
      const resposta = await fetch("/api/sst/epis/entregas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: Number(entregaColaboradorId),
          epi_item_id: Number(entregaItemId),
          quantidade: Number(entregaQuantidade),
          data_entrega: entregaData,
          termo_documento_id: entregaTermoId ? Number(entregaTermoId) : null,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setEntregaColaboradorId("");
        setEntregaItemId("");
        setEntregaQuantidade("1");
        setEntregaData("");
        setEntregaTermoId("");
        setEntregaAviso(
          "Entrega registrada. Com termo no GED, a ciência do colaborador fica pendente até ele confirmar."
        );
        recarregar();
      } else {
        setEntregaErro(dados.erro ?? "Não foi possível registrar a entrega.");
      }
    } catch {
      setEntregaErro("Falha de conexão. Tente novamente.");
    } finally {
      setEntregaEnviando(false);
    }
  }

  const [devolucaoEmCurso, setDevolucaoEmCurso] = useState<number | null>(null);

  async function registrarDevolucao(entregaId: number) {
    setEntregaErro(null);
    setDevolucaoEmCurso(entregaId);
    try {
      const resposta = await fetch(
        `/api/sst/epis/entregas/${entregaId}/devolucao`,
        { method: "POST" }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        recarregar();
      } else {
        setEntregaErro(dados.erro ?? "Não foi possível registrar a devolução.");
      }
    } catch {
      setEntregaErro("Falha de conexão. Tente novamente.");
    } finally {
      setDevolucaoEmCurso(null);
    }
  }

  // ---------------------------------------------------------------- ciência do titular

  const [cienciaEmCurso, setCienciaEmCurso] = useState<number | null>(null);
  const [cienciaErro, setCienciaErro] = useState<string | null>(null);

  async function darCiencia(entregaId: number) {
    setCienciaErro(null);
    setCienciaEmCurso(entregaId);
    try {
      const resposta = await fetch(
        `/api/sst/epis/entregas/${entregaId}/ciencia`,
        { method: "POST" }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        recarregar();
      } else {
        setCienciaErro(dados.erro ?? "Não foi possível registrar a ciência.");
      }
    } catch {
      setCienciaErro("Falha de conexão. Tente novamente.");
    } finally {
      setCienciaEmCurso(null);
    }
  }

  // ---------------------------------------------------------------- formulário: CAT

  const [catColaboradorId, setCatColaboradorId] = useState("");
  const [catTipo, setCatTipo] = useState<TipoCat>("tipico");
  const [catDataAcidente, setCatDataAcidente] = useState("");
  const [catDescricao, setCatDescricao] = useState("");
  const [catHouveAfastamento, setCatHouveAfastamento] = useState(false);
  const [catAfastamentoId, setCatAfastamentoId] = useState("");
  const [catStatus, setCatStatus] = useState<StatusCat>("registrada");
  const [catAnteriorId, setCatAnteriorId] = useState("");
  const [catEnviando, setCatEnviando] = useState(false);
  const [catErro, setCatErro] = useState<string | null>(null);
  const [catAviso, setCatAviso] = useState<string | null>(null);

  const [filtroCatTipo, setFiltroCatTipo] = useState("");
  const [filtroCatBusca, setFiltroCatBusca] = useState("");
  const [mostrarSubstituidas, setMostrarSubstituidas] = useState(false);

  async function registrarCat(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCatErro(null);
    setCatAviso(null);
    setCatEnviando(true);
    try {
      const resposta = await fetch("/api/sst/cats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: Number(catColaboradorId),
          tipo: catTipo,
          // datetime-local é hora local do navegador → enviada em UTC (ISO)
          data_acidente: catDataAcidente
            ? new Date(catDataAcidente).toISOString()
            : "",
          descricao: catDescricao,
          houve_afastamento: catHouveAfastamento,
          afastamento_id:
            catHouveAfastamento && catAfastamentoId
              ? Number(catAfastamentoId)
              : null,
          status: catStatus,
          cat_anterior_id: catAnteriorId ? Number(catAnteriorId) : null,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setCatColaboradorId("");
        setCatTipo("tipico");
        setCatDataAcidente("");
        setCatDescricao("");
        setCatHouveAfastamento(false);
        setCatAfastamentoId("");
        setCatStatus("registrada");
        setCatAnteriorId("");
        setCatAviso(
          "CAT registrada. Lembre o prazo legal de transmissão (1º dia útil seguinte; imediato em óbito) no processo atual da empresa."
        );
        recarregar();
      } else {
        setCatErro(dados.erro ?? "Não foi possível registrar a CAT.");
      }
    } catch {
      setCatErro("Falha de conexão. Tente novamente.");
    } finally {
      setCatEnviando(false);
    }
  }

  // ---------------------------------------------------------------- derivados

  const hoje = hojeIso();
  const documentosDoColaborador = (colaboradorId: string) =>
    documentos.filter(
      (documento) =>
        !colaboradorId ||
        documento.colaborador_id === null ||
        documento.colaborador_id === Number(colaboradorId)
    );
  const vinculosDoColaborador = vinculos.filter(
    (vinculo) =>
      catColaboradorId && vinculo.colaborador_id === Number(catColaboradorId)
  );
  const catsVigentes = cats.filter((cat) => cat.substituida_por_id === null);
  const catsFiltradas = cats.filter((cat) => {
    if (!mostrarSubstituidas && cat.substituida_por_id !== null) return false;
    if (filtroCatTipo && cat.tipo !== filtroCatTipo) return false;
    if (filtroCatBusca) {
      const busca = filtroCatBusca.toLowerCase();
      if (
        !cat.colaborador_nome.toLowerCase().includes(busca) &&
        !cat.matricula.toLowerCase().includes(busca)
      ) {
        return false;
      }
    }
    return true;
  });
  const entregasVisiveis = entregas.filter(
    (entrega) => mostrarDevolvidas || entrega.devolvido_em === null
  );
  const vencidosTotal = painel?.vencidos.length ?? 0;

  // ---------------------------------------------------------------- render

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>SST — Saúde e Segurança do Trabalho</h1>
        <p className={estilos.subtitulo}>
          ASOs com painel de vencimento, EPIs com ciência digital e CATs —
          controle interno local; conteúdo clínico cifrado e auditado.
        </p>

        {minhasEntregas.length > 0 && (
          <section className={estilos.cartao}>
            <h2>Minhas entregas de EPI</h2>
            <p className={estilos.ajuda}>
              A ciência é dada sobre o termo no GED (hash da versão no
              momento) — substitui a ficha de papel da NR-6.
            </p>
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>EPI</th>
                    <th>Qtd</th>
                    <th>Entrega</th>
                    <th>Termo</th>
                    <th>Situação</th>
                    <th>Ciência</th>
                  </tr>
                </thead>
                <tbody>
                  {minhasEntregas.map((entrega) => (
                    <tr key={entrega.id}>
                      <td>
                        {entrega.item_nome}
                        {entrega.numero_ca ? ` (CA ${entrega.numero_ca})` : ""}
                      </td>
                      <td>{entrega.quantidade}</td>
                      <td>{formatarData(entrega.data_entrega)}</td>
                      <td>
                        {entrega.termo_documento_id ? (
                          <a
                            className={estilos.ligacao}
                            href={`/api/documentos/${entrega.termo_documento_id}/download`}
                          >
                            {entrega.termo_titulo ??
                              `#${entrega.termo_documento_id}`}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {entrega.devolvido_em ? (
                          <span className={estilos.etiquetaNeutra}>
                            Devolvido em {formatarDataHora(entrega.devolvido_em)}
                          </span>
                        ) : (
                          <span className={estilos.etiquetaOk}>Em uso</span>
                        )}
                      </td>
                      <td>
                        {entrega.ciencia_registrada ? (
                          <span className={estilos.etiquetaOk}>Registrada</span>
                        ) : entrega.termo_documento_id ? (
                          <button
                            className={estilos.botaoDiscreto}
                            type="button"
                            disabled={cienciaEmCurso === entrega.id}
                            onClick={() => darCiencia(entrega.id)}
                          >
                            {cienciaEmCurso === entrega.id
                              ? "Registrando…"
                              : "Dar ciência"}
                          </button>
                        ) : (
                          <span className={estilos.etiquetaNeutra}>
                            Sem termo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cienciaErro && <p className={estilos.erro}>{cienciaErro}</p>}
          </section>
        )}

        {podeVer && (
          <>
            <div className={estilos.abasPrincipais}>
              <button
                className={`${estilos.aba} ${aba === "asos" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("asos")}
              >
                ASOs
                {vencidosTotal > 0 && (
                  <span className={estilos.badge}>
                    {vencidosTotal} vencido{vencidosTotal > 1 ? "s" : ""}
                  </span>
                )}
              </button>
              <button
                className={`${estilos.aba} ${aba === "epis" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("epis")}
              >
                EPIs
              </button>
              <button
                className={`${estilos.aba} ${aba === "cats" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("cats")}
              >
                CATs
              </button>
            </div>

            {erro && <p className={estilos.erro}>{erro}</p>}
            {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

            {/* ---------------------------------------------------- ASOs */}
            {!carregando && aba === "asos" && (
              <>
                <section className={estilos.cartao}>
                  <h2>Painel de vencimento</h2>
                  {painel && (
                    <>
                      <div className={estilos.painelVencimento}>
                        <div className={estilos.colunaVencimento}>
                          <h3 className={estilos.tituloVencido}>
                            Vencidos ({painel.vencidos.length})
                          </h3>
                          <ul className={estilos.listaVencimento}>
                            {painel.vencidos.map((item) => (
                              <li key={item.colaborador_id}>
                                {item.colaborador_nome} ({item.matricula}){" "}
                                <span className={estilos.dataVencimento}>
                                  — {formatarData(item.validade)}
                                </span>
                              </li>
                            ))}
                            {painel.vencidos.length === 0 && (
                              <li>Nenhum ASO vencido.</li>
                            )}
                          </ul>
                        </div>
                        <div className={estilos.colunaVencimento}>
                          <h3 className={estilos.titulo30}>
                            Vence em 30 dias ({painel.vence_30.length})
                          </h3>
                          <ul className={estilos.listaVencimento}>
                            {painel.vence_30.map((item) => (
                              <li key={item.colaborador_id}>
                                {item.colaborador_nome} ({item.matricula}){" "}
                                <span className={estilos.dataVencimento}>
                                  — {formatarData(item.validade)}
                                </span>
                              </li>
                            ))}
                            {painel.vence_30.length === 0 && (
                              <li>Ninguém nesta janela.</li>
                            )}
                          </ul>
                        </div>
                        <div className={estilos.colunaVencimento}>
                          <h3 className={estilos.titulo60}>
                            Vence em 31–60 dias ({painel.vence_60.length})
                          </h3>
                          <ul className={estilos.listaVencimento}>
                            {painel.vence_60.map((item) => (
                              <li key={item.colaborador_id}>
                                {item.colaborador_nome} ({item.matricula}){" "}
                                <span className={estilos.dataVencimento}>
                                  — {formatarData(item.validade)}
                                </span>
                              </li>
                            ))}
                            {painel.vence_60.length === 0 && (
                              <li>Ninguém nesta janela.</li>
                            )}
                          </ul>
                        </div>
                      </div>
                      <p className={estilos.notaRodape}>
                        {painel.total_monitorado} colaborador(es)
                        monitorado(s) (não desligados) • {painel.em_dia} em
                        dia • {painel.sem_validade} sem ASO com validade
                        registrada.
                      </p>
                    </>
                  )}
                </section>

                {podeGerir && (
                  <section className={estilos.cartao}>
                    <h2>Registrar ASO</h2>
                    <form className={estilos.formulario} onSubmit={registrarAso}>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="aso-colaborador">
                          Colaborador
                        </label>
                        <select
                          className={estilos.campo}
                          id="aso-colaborador"
                          required
                          value={asoColaboradorId}
                          onChange={(e) => setAsoColaboradorId(e.target.value)}
                        >
                          <option value="">Escolha…</option>
                          {colaboradores.map((colaborador) => (
                            <option key={colaborador.id} value={colaborador.id}>
                              {colaborador.nome_completo} ({colaborador.matricula})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="aso-tipo">
                          Tipo de exame
                        </label>
                        <select
                          className={estilos.campo}
                          id="aso-tipo"
                          value={asoTipo}
                          onChange={(e) => setAsoTipo(e.target.value as TipoAso)}
                        >
                          {TIPOS_ASO.map((opcao) => (
                            <option key={opcao} value={opcao}>
                              {ROTULOS_TIPO_ASO[opcao]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="aso-exame">
                          Data do exame
                        </label>
                        <input
                          className={estilos.campo}
                          id="aso-exame"
                          type="date"
                          required
                          value={asoDataExame}
                          onChange={(e) => setAsoDataExame(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="aso-validade">
                          Validade (informada pela clínica)
                        </label>
                        <input
                          className={estilos.campo}
                          id="aso-validade"
                          type="date"
                          value={asoValidade}
                          onChange={(e) => setAsoValidade(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="aso-resultado">
                          Resultado
                        </label>
                        <select
                          className={estilos.campo}
                          id="aso-resultado"
                          value={asoResultado}
                          onChange={(e) =>
                            setAsoResultado(e.target.value as ResultadoAso)
                          }
                        >
                          {RESULTADOS_ASO.map((opcao) => (
                            <option key={opcao} value={opcao}>
                              {ROTULOS_RESULTADO_ASO[opcao]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="aso-documento">
                          PDF do ASO no GED (opcional)
                        </label>
                        <select
                          className={estilos.campo}
                          id="aso-documento"
                          value={asoDocumentoId}
                          onChange={(e) => setAsoDocumentoId(e.target.value)}
                        >
                          <option value="">Sem documento</option>
                          {documentosDoColaborador(asoColaboradorId).map(
                            (documento) => (
                              <option key={documento.id} value={documento.id}>
                                #{documento.id} — {documento.titulo}
                                {documento.sensivel ? " (sensível)" : ""}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div className={estilos.campoGrupoLargo}>
                        <label className={estilos.rotulo} htmlFor="aso-restricoes">
                          Restrições (só quando não é plenamente apto)
                        </label>
                        <textarea
                          className={estilos.campo}
                          id="aso-restricoes"
                          rows={2}
                          maxLength={2000}
                          disabled={asoResultado === "apto"}
                          value={asoResultado === "apto" ? "" : asoRestricoes}
                          onChange={(e) => setAsoRestricoes(e.target.value)}
                        />
                        <span className={estilos.ajuda}>
                          Dado de saúde: cifrado na aplicação (AES-256-GCM)
                          antes de ir ao banco. Só aparece para quem tem
                          sst.saude.ver, com leitura registrada em trilha.
                        </span>
                      </div>
                      <button
                        className={estilos.botao}
                        type="submit"
                        disabled={asoEnviando}
                      >
                        {asoEnviando ? "Registrando…" : "Registrar ASO"}
                      </button>
                    </form>
                    {asoErro && <p className={estilos.erro}>{asoErro}</p>}
                    {asoAviso && <p className={estilos.sucesso}>{asoAviso}</p>}
                  </section>
                )}

                <section className={estilos.cartao}>
                  <h2>ASOs registrados</h2>
                  {comSaude && (
                    <p className={estilos.ajuda}>
                      Você tem acesso ao conteúdo clínico: cada restrição
                      exibida nesta lista gera registro em
                      audit.leitura_sensivel.
                    </p>
                  )}
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Colaborador</th>
                          <th>Tipo</th>
                          <th>Exame</th>
                          <th>Validade</th>
                          {comSaude && <th>Resultado</th>}
                          {comSaude && <th>Restrições</th>}
                          {comSaude && <th>Documento</th>}
                          {comSaude && <th>Registrado por</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {asos.map((aso) => (
                          <tr key={aso.id}>
                            <td>
                              {aso.colaborador_nome} ({aso.matricula})
                            </td>
                            <td>
                              {aso.tipo_rotulo}
                              {aso.tipo === "demissional" && (
                                <>
                                  {" "}
                                  <Link
                                    className={estilos.ligacao}
                                    href="/desligamentos"
                                  >
                                    contexto do desligamento →
                                  </Link>
                                </>
                              )}
                            </td>
                            <td>{formatarData(aso.data_exame)}</td>
                            <td>
                              {aso.validade ? (
                                <>
                                  {formatarData(aso.validade)}{" "}
                                  {aso.validade < hoje && (
                                    <span className={estilos.etiquetaVencido}>
                                      Vencido
                                    </span>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            {comSaude && (
                              <td>{aso.resultado_rotulo ?? "—"}</td>
                            )}
                            {comSaude && (
                              <td>
                                {aso.restricoes ? (
                                  <>
                                    <span className={estilos.etiquetaSensivel}>
                                      Sensível
                                    </span>
                                    <span className={estilos.detalheSaude}>
                                      {aso.restricoes}
                                    </span>
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                            )}
                            {comSaude && (
                              <td>
                                {aso.documento_id ? (
                                  <a
                                    className={estilos.ligacao}
                                    href={`/api/documentos/${aso.documento_id}/download`}
                                  >
                                    {aso.documento_titulo ??
                                      `#${aso.documento_id}`}
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                            )}
                            {comSaude && (
                              <td>{aso.registrado_por_nome ?? "—"}</td>
                            )}
                          </tr>
                        ))}
                        {asos.length === 0 && (
                          <tr>
                            <td colSpan={comSaude ? 8 : 4}>
                              Nenhum ASO registrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className={estilos.notaRodape}>
                    Sem a permissão de saúde, resultado, restrições e o PDF
                    ficam ausentes do payload — o painel mostra apenas tipo do
                    exame e datas. Datas no horário de Brasília.
                  </p>
                </section>
              </>
            )}

            {/* ---------------------------------------------------- EPIs */}
            {!carregando && aba === "epis" && (
              <>
                <section className={estilos.cartao}>
                  <h2>Catálogo de EPI</h2>
                  {podeGerir && (
                    <form className={estilos.formulario} onSubmit={criarItem}>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="item-nome">
                          Nome do EPI
                        </label>
                        <input
                          className={estilos.campo}
                          id="item-nome"
                          required
                          maxLength={200}
                          value={itemNome}
                          onChange={(e) => setItemNome(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="item-ca">
                          Nº do CA (opcional)
                        </label>
                        <input
                          className={estilos.campo}
                          id="item-ca"
                          maxLength={30}
                          value={itemCa}
                          onChange={(e) => setItemCa(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="item-validade">
                          Validade do CA
                        </label>
                        <input
                          className={estilos.campo}
                          id="item-validade"
                          type="date"
                          value={itemValidadeCa}
                          onChange={(e) => setItemValidadeCa(e.target.value)}
                        />
                      </div>
                      <button
                        className={estilos.botao}
                        type="submit"
                        disabled={itemEnviando}
                      >
                        {itemEnviando ? "Cadastrando…" : "Cadastrar EPI"}
                      </button>
                    </form>
                  )}
                  {itemErro && <p className={estilos.erro}>{itemErro}</p>}
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>EPI</th>
                          <th>CA</th>
                          <th>Validade do CA</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item) => (
                          <tr key={item.id}>
                            <td>{item.nome}</td>
                            <td>{item.numero_ca ?? "—"}</td>
                            <td>
                              {item.validade_ca ? (
                                <>
                                  {formatarData(item.validade_ca)}{" "}
                                  {item.validade_ca < hoje && (
                                    <span className={estilos.etiquetaVencido}>
                                      CA vencido
                                    </span>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {item.ativo ? (
                                <span className={estilos.etiquetaOk}>Ativo</span>
                              ) : (
                                <span className={estilos.etiquetaNeutra}>
                                  Fora de circulação
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {itens.length === 0 && (
                          <tr>
                            <td colSpan={4}>Nenhum EPI no catálogo.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {podeGerir && (
                  <section className={estilos.cartao}>
                    <h2>Registrar entrega</h2>
                    <form
                      className={estilos.formulario}
                      onSubmit={registrarEntrega}
                    >
                      <div className={estilos.campoGrupo}>
                        <label
                          className={estilos.rotulo}
                          htmlFor="entrega-colaborador"
                        >
                          Colaborador
                        </label>
                        <select
                          className={estilos.campo}
                          id="entrega-colaborador"
                          required
                          value={entregaColaboradorId}
                          onChange={(e) =>
                            setEntregaColaboradorId(e.target.value)
                          }
                        >
                          <option value="">Escolha…</option>
                          {colaboradores.map((colaborador) => (
                            <option key={colaborador.id} value={colaborador.id}>
                              {colaborador.nome_completo} ({colaborador.matricula})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="entrega-item">
                          EPI
                        </label>
                        <select
                          className={estilos.campo}
                          id="entrega-item"
                          required
                          value={entregaItemId}
                          onChange={(e) => setEntregaItemId(e.target.value)}
                        >
                          <option value="">Escolha…</option>
                          {itens
                            .filter((item) => item.ativo)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nome}
                                {item.numero_ca ? ` (CA ${item.numero_ca})` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="entrega-qtd">
                          Quantidade
                        </label>
                        <input
                          className={estilos.campo}
                          id="entrega-qtd"
                          type="number"
                          min={1}
                          max={999}
                          required
                          value={entregaQuantidade}
                          onChange={(e) => setEntregaQuantidade(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="entrega-data">
                          Data da entrega
                        </label>
                        <input
                          className={estilos.campo}
                          id="entrega-data"
                          type="date"
                          required
                          value={entregaData}
                          onChange={(e) => setEntregaData(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="entrega-termo">
                          Termo de entrega no GED (opcional)
                        </label>
                        <select
                          className={estilos.campo}
                          id="entrega-termo"
                          value={entregaTermoId}
                          onChange={(e) => setEntregaTermoId(e.target.value)}
                        >
                          <option value="">Sem termo</option>
                          {documentosDoColaborador(entregaColaboradorId).map(
                            (documento) => (
                              <option key={documento.id} value={documento.id}>
                                #{documento.id} — {documento.titulo}
                                {documento.sensivel ? " (sensível)" : ""}
                              </option>
                            )
                          )}
                        </select>
                        <span className={estilos.ajuda}>
                          Com termo, o colaborador dá ciência digital sobre ele
                          (hash da versão no momento — padrão do GED).
                        </span>
                      </div>
                      <button
                        className={estilos.botao}
                        type="submit"
                        disabled={entregaEnviando}
                      >
                        {entregaEnviando ? "Registrando…" : "Registrar entrega"}
                      </button>
                    </form>
                    {entregaAviso && (
                      <p className={estilos.sucesso}>{entregaAviso}</p>
                    )}
                  </section>
                )}

                <section className={estilos.cartao}>
                  <h2>Entregas por colaborador</h2>
                  <div className={estilos.filtros}>
                    <label className={estilos.caixaSelecao}>
                      <input
                        type="checkbox"
                        checked={mostrarDevolvidas}
                        onChange={(e) => setMostrarDevolvidas(e.target.checked)}
                      />
                      Mostrar também as devolvidas
                    </label>
                  </div>
                  {entregaErro && <p className={estilos.erro}>{entregaErro}</p>}
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Colaborador</th>
                          <th>EPI</th>
                          <th>Qtd</th>
                          <th>Entrega</th>
                          <th>Termo</th>
                          <th>Ciência</th>
                          <th>Devolução</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entregasVisiveis.map((entrega) => (
                          <tr key={entrega.id}>
                            <td>
                              {entrega.colaborador_nome} ({entrega.matricula})
                            </td>
                            <td>
                              {entrega.item_nome}
                              {entrega.numero_ca
                                ? ` (CA ${entrega.numero_ca})`
                                : ""}
                            </td>
                            <td>{entrega.quantidade}</td>
                            <td>{formatarData(entrega.data_entrega)}</td>
                            <td>
                              {entrega.termo_documento_id ? (
                                <a
                                  className={estilos.ligacao}
                                  href={`/api/documentos/${entrega.termo_documento_id}/download`}
                                >
                                  {entrega.termo_titulo ??
                                    `#${entrega.termo_documento_id}`}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {entrega.ciencia_registrada ? (
                                <span className={estilos.etiquetaOk}>
                                  Registrada
                                </span>
                              ) : entrega.termo_documento_id ? (
                                <span className={estilos.etiquetaAviso}>
                                  Pendente
                                </span>
                              ) : (
                                <span className={estilos.etiquetaNeutra}>
                                  Sem termo
                                </span>
                              )}
                            </td>
                            <td>
                              {entrega.devolvido_em ? (
                                formatarDataHora(entrega.devolvido_em)
                              ) : podeGerir ? (
                                <button
                                  className={estilos.botaoDiscreto}
                                  type="button"
                                  disabled={devolucaoEmCurso === entrega.id}
                                  onClick={() => registrarDevolucao(entrega.id)}
                                >
                                  {devolucaoEmCurso === entrega.id
                                    ? "Registrando…"
                                    : "Registrar devolução"}
                                </button>
                              ) : (
                                <span className={estilos.etiquetaOk}>
                                  Em uso
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {entregasVisiveis.length === 0 && (
                          <tr>
                            <td colSpan={7}>
                              Nenhuma entrega{" "}
                              {mostrarDevolvidas ? "registrada" : "ativa"}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className={estilos.notaRodape}>
                    Entrega é registro imutável: erro de lançamento vira
                    registro novo; a pendência de devolução alimenta o
                    checklist de desligamento.
                  </p>
                </section>
              </>
            )}

            {/* ---------------------------------------------------- CATs */}
            {!carregando && aba === "cats" && (
              <>
                <p className={estilos.aviso}>
                  A transmissão ao eSocial (S-2210) permanece no processo atual
                  da empresa — este registro é o controle interno. Prazo legal:
                  1º dia útil seguinte ao acidente; imediato em caso de óbito.
                </p>

                {podeGerir && (
                  <section className={estilos.cartao}>
                    <h2>Registrar CAT</h2>
                    <form className={estilos.formulario} onSubmit={registrarCat}>
                      <div className={estilos.campoGrupo}>
                        <label
                          className={estilos.rotulo}
                          htmlFor="cat-colaborador"
                        >
                          Colaborador
                        </label>
                        <select
                          className={estilos.campo}
                          id="cat-colaborador"
                          required
                          value={catColaboradorId}
                          onChange={(e) => {
                            setCatColaboradorId(e.target.value);
                            setCatAfastamentoId("");
                          }}
                        >
                          <option value="">Escolha…</option>
                          {colaboradores.map((colaborador) => (
                            <option key={colaborador.id} value={colaborador.id}>
                              {colaborador.nome_completo} ({colaborador.matricula})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="cat-tipo">
                          Tipo
                        </label>
                        <select
                          className={estilos.campo}
                          id="cat-tipo"
                          value={catTipo}
                          onChange={(e) => setCatTipo(e.target.value as TipoCat)}
                        >
                          {TIPOS_CAT.map((opcao) => (
                            <option key={opcao} value={opcao}>
                              {ROTULOS_TIPO_CAT[opcao]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="cat-data">
                          Data e hora do acidente
                        </label>
                        <input
                          className={estilos.campo}
                          id="cat-data"
                          type="datetime-local"
                          required
                          value={catDataAcidente}
                          onChange={(e) => setCatDataAcidente(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="cat-status">
                          Status
                        </label>
                        <select
                          className={estilos.campo}
                          id="cat-status"
                          value={catStatus}
                          onChange={(e) =>
                            setCatStatus(e.target.value as StatusCat)
                          }
                        >
                          {STATUS_CAT.map((opcao) => (
                            <option key={opcao} value={opcao}>
                              {ROTULOS_STATUS_CAT[opcao]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={estilos.campoGrupoLargo}>
                        <label className={estilos.rotulo} htmlFor="cat-descricao">
                          Descrição do acidente
                        </label>
                        <textarea
                          className={estilos.campo}
                          id="cat-descricao"
                          rows={3}
                          required
                          maxLength={4000}
                          value={catDescricao}
                          onChange={(e) => setCatDescricao(e.target.value)}
                        />
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.caixaSelecao}>
                          <input
                            type="checkbox"
                            checked={catHouveAfastamento}
                            onChange={(e) => {
                              setCatHouveAfastamento(e.target.checked);
                              if (!e.target.checked) setCatAfastamentoId("");
                            }}
                          />
                          Houve afastamento
                        </label>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label
                          className={estilos.rotulo}
                          htmlFor="cat-afastamento"
                        >
                          Afastamento vinculado (opcional)
                        </label>
                        <select
                          className={estilos.campo}
                          id="cat-afastamento"
                          disabled={
                            !catHouveAfastamento ||
                            vinculosDoColaborador.length === 0
                          }
                          value={catAfastamentoId}
                          onChange={(e) => setCatAfastamentoId(e.target.value)}
                        >
                          <option value="">Sem vínculo</option>
                          {vinculosDoColaborador.map((vinculo) => (
                            <option key={vinculo.id} value={vinculo.id}>
                              #{vinculo.id} — {formatarData(vinculo.inicio)}
                              {vinculo.fim
                                ? ` a ${formatarData(vinculo.fim)}`
                                : " (em curso)"}
                            </option>
                          ))}
                        </select>
                        <span className={estilos.ajuda}>
                          Afastamentos de acidente de trabalho já registrados
                          no módulo de afastamentos.
                        </span>
                      </div>
                      <div className={estilos.campoGrupo}>
                        <label className={estilos.rotulo} htmlFor="cat-anterior">
                          Corrige a CAT (opcional)
                        </label>
                        <select
                          className={estilos.campo}
                          id="cat-anterior"
                          value={catAnteriorId}
                          onChange={(e) => setCatAnteriorId(e.target.value)}
                        >
                          <option value="">Não — registro original</option>
                          {catsVigentes.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              #{cat.id} — {cat.colaborador_nome} (
                              {formatarDataHora(cat.data_acidente)})
                            </option>
                          ))}
                        </select>
                        <span className={estilos.ajuda}>
                          Registro é append-only: correção é um registro novo
                          referenciando o anterior — nada é editado.
                        </span>
                      </div>
                      <button
                        className={estilos.botao}
                        type="submit"
                        disabled={catEnviando}
                      >
                        {catEnviando ? "Registrando…" : "Registrar CAT"}
                      </button>
                    </form>
                    {catErro && <p className={estilos.erro}>{catErro}</p>}
                    {catAviso && <p className={estilos.sucesso}>{catAviso}</p>}
                  </section>
                )}

                <section className={estilos.cartao}>
                  <h2>CATs registradas</h2>
                  <div className={estilos.filtros}>
                    <div className={estilos.campoGrupo}>
                      <label className={estilos.rotulo} htmlFor="filtro-cat-tipo">
                        Tipo
                      </label>
                      <select
                        className={estilos.campo}
                        id="filtro-cat-tipo"
                        value={filtroCatTipo}
                        onChange={(e) => setFiltroCatTipo(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {TIPOS_CAT.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULOS_TIPO_CAT[opcao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={estilos.campoGrupo}>
                      <label
                        className={estilos.rotulo}
                        htmlFor="filtro-cat-busca"
                      >
                        Colaborador (nome ou matrícula)
                      </label>
                      <input
                        className={estilos.campo}
                        id="filtro-cat-busca"
                        value={filtroCatBusca}
                        onChange={(e) => setFiltroCatBusca(e.target.value)}
                      />
                    </div>
                    <label className={estilos.caixaSelecao}>
                      <input
                        type="checkbox"
                        checked={mostrarSubstituidas}
                        onChange={(e) =>
                          setMostrarSubstituidas(e.target.checked)
                        }
                      />
                      Mostrar registros substituídos
                    </label>
                  </div>
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Colaborador</th>
                          <th>Tipo</th>
                          <th>Acidente</th>
                          <th>Descrição</th>
                          <th>Afastamento</th>
                          <th>Status</th>
                          <th>Cadeia</th>
                          <th>Registrado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catsFiltradas.map((cat) => (
                          <tr key={cat.id}>
                            <td>#{cat.id}</td>
                            <td>
                              {cat.colaborador_nome} ({cat.matricula})
                            </td>
                            <td>{cat.tipo_rotulo}</td>
                            <td>{formatarDataHora(cat.data_acidente)}</td>
                            <td className={estilos.descricao}>
                              {cat.descricao}
                            </td>
                            <td>
                              {cat.houve_afastamento
                                ? cat.afastamento_id
                                  ? `Sim (#${cat.afastamento_id})`
                                  : "Sim (sem vínculo)"
                                : "Não"}
                            </td>
                            <td>
                              {cat.status === "encaminhada" ? (
                                <span className={estilos.etiquetaOk}>
                                  {cat.status_rotulo}
                                </span>
                              ) : (
                                <span className={estilos.etiquetaAviso}>
                                  {cat.status_rotulo}
                                </span>
                              )}
                            </td>
                            <td>
                              {cat.cat_anterior_id !== null && (
                                <span className={estilos.etiquetaNeutra}>
                                  corrige #{cat.cat_anterior_id}
                                </span>
                              )}{" "}
                              {cat.substituida_por_id !== null && (
                                <span className={estilos.etiquetaVencido}>
                                  substituída por #{cat.substituida_por_id}
                                </span>
                              )}
                              {cat.cat_anterior_id === null &&
                                cat.substituida_por_id === null &&
                                "—"}
                            </td>
                            <td>{cat.registrado_por_nome}</td>
                          </tr>
                        ))}
                        {catsFiltradas.length === 0 && (
                          <tr>
                            <td colSpan={9}>Nenhuma CAT encontrada.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className={estilos.notaRodape}>
                    Registro append-only: correção referencia o registro
                    anterior e a versão vigente é a ponta da cadeia. Horários
                    no fuso de Brasília.
                  </p>
                </section>
              </>
            )}
          </>
        )}

        {!podeVer && minhasEntregas.length === 0 && (
          <section className={estilos.cartao}>
            <p className={estilos.subtitulo}>
              Nada para ver aqui: você não tem permissão nos painéis de SST e
              não há entregas de EPI no seu nome.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
