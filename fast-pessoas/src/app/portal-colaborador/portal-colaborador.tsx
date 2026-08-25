"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import type {
  BeneficioElegivel,
  BlocoAvaliacoes,
  BlocoBeneficios,
  BlocoCheckin,
  BlocoDependentes,
  BlocoDocumentos,
  BlocoFerias,
  BlocoSolicitacoes,
  MeuDocumento,
  MeusDados,
  MinhaSolicitacao,
} from "@/dominios/portais/colaborador-esquemas";
import { formatarMinutos } from "@/dominios/ponto/esquemas";
import estilos from "./page.module.css";

/** Contrato de GET /api/ponto/resumo (domínio de ponto, chave própria). */
interface BlocoPonto {
  disponivel: boolean;
  explicacao?: string;
  saldo_banco_minutos?: number;
  media_he_por_dia_util_minutos?: number;
  total_he_ultimo_mes_minutos?: number;
  ultima_apuracao?: { competencia: string } | null;
  intercorrencias_abertas?: number;
  espelho_href?: string;
}

/**
 * Contrato de GET /api/posse/minhas (domínio de posse; a porta é
 * documento.ver, a ciência é do titular). Espelho de PosseLinha sem os campos
 * de identificação do colaborador — aqui tudo é do próprio.
 */
interface ItemMinhaPosse {
  id: number;
  categoria_nome: string;
  descricao: string;
  quantidade: number;
  numero_serie: string | null;
  data_entrega: string;
  termo_documento_id: number | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  devolvido_em: string | null;
}

interface Visao {
  pode: {
    ferias: boolean;
    solicitacoes: boolean;
    beneficios: boolean;
    documentos: boolean;
    checkin: boolean;
  };
  meus_dados: MeusDados;
  ferias: BlocoFerias | null;
  solicitacoes: BlocoSolicitacoes | null;
  beneficios: BlocoBeneficios | null;
  dependentes: BlocoDependentes | null;
  documentos: BlocoDocumentos | null;
  avaliacoes: BlocoAvaliacoes;
  checkin: BlocoCheckin | null;
  treinamentos: { disponivel: false; explicacao: string };
}

// ------------------------------------------------------------------ formatação
// Banco em UTC, exibição em America/Sao_Paulo — regra do projeto.

function formatarData(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarInstante(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor.includes("T") ? valor : valor.replace(" ", "T"));
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function formatarMoeda(valor: number | null): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function formatarDias(dias: number): string {
  const inteiro = Number.isInteger(dias) ? String(dias) : dias.toFixed(1);
  return `${inteiro} ${dias === 1 ? "dia" : "dias"}`;
}

// ------------------------------------------------------------------ blocos

function CartaoMeusDados({ dados }: { dados: MeusDados }) {
  return (
    <section className={estilos.cartao}>
      <div className={estilos.identidade}>
        <strong>{dados.nome_completo}</strong>
        <span className={estilos.etiqueta}>Matrícula {dados.matricula}</span>
        <span className={estilos.etiqueta}>{dados.status}</span>
      </div>
      <dl className={estilos.dados}>
        <div className={estilos.dado}>
          <dt>Cargo</dt>
          <dd>
            {dados.cargo_nome ?? "—"}
            {dados.rcf_href !== null && (
              <>
                {" "}
                <Link className={estilos.ligacao} href={dados.rcf_href}>
                  ver RCF
                </Link>
              </>
            )}
          </dd>
        </div>
        <div className={estilos.dado}>
          <dt>Unidade</dt>
          <dd>{dados.unidade ?? "—"}</dd>
        </div>
        <div className={estilos.dado}>
          <dt>Vínculo</dt>
          <dd>{dados.tipo_vinculo}</dd>
        </div>
        <div className={estilos.dado}>
          <dt>Admissão</dt>
          <dd>{formatarData(dados.data_admissao)}</dd>
        </div>
        <div className={estilos.dado}>
          <dt>Tempo de casa</dt>
          <dd>{dados.tempo_de_casa}</dd>
        </div>
        <div className={estilos.dado}>
          <dt>Gestor</dt>
          <dd>{dados.gestor_nome ?? "—"}</dd>
        </div>
        {/* O contrato anterior no mesmo grupo existe e é DELE: a ficha de cada
            um abre pelo mesmo alcance que já libera o próprio ponto e os
            próprios documentos. Calar sobre ele era o portal negar ao
            trabalhador a única coisa que a Onda I prometeu guardar — o
            histórico. */}
        {dados.contratos_anteriores.length > 0 && (
          <div className={estilos.dado}>
            <dt>Contratos anteriores no grupo</dt>
            <dd>
              {dados.contratos_anteriores.map((contrato) => (
                <div key={contrato.colaborador_id}>
                  <Link
                    className={estilos.ligacao}
                    href={`/colaboradores/${contrato.colaborador_id}`}
                  >
                    {contrato.empresa_nome ?? "Empresa do grupo"} — matrícula{" "}
                    {contrato.matricula}
                  </Link>{" "}
                  ({formatarData(contrato.data_admissao)} a{" "}
                  {contrato.data_desligamento === null
                    ? "hoje"
                    : formatarData(contrato.data_desligamento)}
                  )
                </div>
              ))}
            </dd>
          </div>
        )}
      </dl>
      {/* Transparência sobre o que NÃO está aqui: remuneração é assunto do
          holerite e da folha, com chave própria (rh.posicao.ver). */}
      <p className={estilos.notaRodape}>
        Remuneração não aparece neste portal: dúvida sobre salário, desconto ou
        holerite é resolvida pelo DP — abra uma solicitação do tipo “Dúvida sobre
        a folha”.
      </p>
    </section>
  );
}

function CartaoFerias({ bloco }: { bloco: BlocoFerias }) {
  const vencido = bloco.periodos.some((periodo) => periodo.dias_ate_limite < 0);
  return (
    <section className={estilos.cartao}>
      <div className={estilos.cabecalhoCartao}>
        <h2>Minhas férias</h2>
        <Link className={estilos.ligacao} href="/ferias">
          Solicitar férias →
        </Link>
      </div>
      {bloco.alerta !== null && (
        <p
          className={
            vencido
              ? `${estilos.aviso} ${estilos.avisoForte}`
              : estilos.aviso
          }
        >
          {bloco.alerta}
        </p>
      )}
      <div className={estilos.cartoesResumo}>
        <div className={estilos.cartaoResumo}>
          <strong>{formatarDias(bloco.saldo_total)}</strong>
          <span>Saldo disponível</span>
        </div>
        <div className={estilos.cartaoResumo}>
          <strong>{bloco.programadas.length}</strong>
          <span>Programações em andamento</span>
        </div>
      </div>

      <h3 className={estilos.metaItem}>Períodos aquisitivos em aberto</h3>
      {bloco.periodos.length === 0 ? (
        <p className={estilos.vazio}>Nenhum período com saldo em aberto.</p>
      ) : (
        <div className={estilos.tabelaEnvolucro}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Período</th>
                <th className={estilos.numero}>Saldo</th>
                <th>Gozar até</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {bloco.periodos.map((periodo) => (
                <tr key={periodo.id}>
                  <td>
                    {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}
                  </td>
                  <td className={estilos.numero}>
                    {formatarDias(periodo.saldo_disponivel)}
                  </td>
                  <td>{formatarData(periodo.limite_concessivo)}</td>
                  <td>
                    <span
                      className={
                        periodo.dias_ate_limite < 0
                          ? `${estilos.etiqueta} ${estilos.etiquetaAlerta}`
                          : periodo.em_alerta
                            ? `${estilos.etiqueta} ${estilos.etiquetaAtencao}`
                            : estilos.etiqueta
                      }
                    >
                      {periodo.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={estilos.metaItem}>Programado</h3>
      {bloco.programadas.length === 0 ? (
        <p className={estilos.vazio}>Você não tem férias programadas.</p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.programadas.map((programacao) => (
            <li className={estilos.itemLista} key={programacao.id}>
              <p>
                {formatarData(programacao.inicio)} a{" "}
                {formatarData(programacao.fim)} — {programacao.dias} dias
                {programacao.abono_dias > 0
                  ? ` + ${programacao.abono_dias} de abono`
                  : ""}
              </p>
              <span className={estilos.metaItem}>
                {programacao.status}
                {programacao.demanda_numero !== null
                  ? ` · solicitação nº ${programacao.demanda_numero}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaSolicitacao({ solicitacao }: { solicitacao: MinhaSolicitacao }) {
  return (
    <li
      className={
        solicitacao.em_atraso
          ? `${estilos.itemLista} ${estilos.itemListaAcao}`
          : estilos.itemLista
      }
    >
      <p>
        <Link className={estilos.ligacao} href={`/demandas/${solicitacao.id}`}>
          nº {solicitacao.numero}
        </Link>{" "}
        · {solicitacao.tipo_nome}
      </p>
      <span className={estilos.metaItem}>
        {solicitacao.status_rotulo} · prazo {formatarData(solicitacao.prazo)}
        {solicitacao.em_atraso
          ? ` · ${Math.abs(solicitacao.dias_ate_prazo)} dia(s) de atraso`
          : ""}
      </span>
    </li>
  );
}

function CartaoSolicitacoes({ bloco }: { bloco: BlocoSolicitacoes }) {
  return (
    <section className={estilos.cartao}>
      <div className={estilos.cabecalhoCartao}>
        <h2>Minhas solicitações</h2>
        <Link className={estilos.ligacao} href="/demandas">
          Abrir nova →
        </Link>
      </div>
      <div className={estilos.cartoesResumo}>
        <div className={estilos.cartaoResumo}>
          <strong>{bloco.em_aberto.length}</strong>
          <span>Em andamento</span>
        </div>
        <div className={estilos.cartaoResumo}>
          <strong>{bloco.encerradas.length}</strong>
          <span>Encerradas</span>
        </div>
      </div>
      {bloco.em_aberto.length === 0 ? (
        <p className={estilos.vazio}>
          Nenhuma solicitação em andamento. Precisa de declaração, informe de
          rendimentos ou ajuste de ponto? Abra uma solicitação.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.em_aberto.map((solicitacao) => (
            <LinhaSolicitacao key={solicitacao.id} solicitacao={solicitacao} />
          ))}
        </ul>
      )}
      {bloco.encerradas.length > 0 && (
        <>
          <h3 className={estilos.metaItem}>Encerradas recentemente</h3>
          <ul className={estilos.lista}>
            {bloco.encerradas.slice(0, 5).map((solicitacao) => (
              <LinhaSolicitacao
                key={solicitacao.id}
                solicitacao={solicitacao}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** "Vale-Transporte · VALE-TRANSPORTE" é ruído: só etiqueta o que acrescenta. */
function categoriaInformativa(nome: string, categoria: string): boolean {
  const normalizar = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  return normalizar(nome) !== normalizar(categoria);
}

function LinhaElegivel({ beneficio }: { beneficio: BeneficioElegivel }) {
  return (
    <li className={estilos.itemLista}>
      <p>
        {beneficio.nome}
        {categoriaInformativa(beneficio.nome, beneficio.categoria_rotulo) && (
          <>
            {" "}
            <span className={estilos.etiqueta}>
              {beneficio.categoria_rotulo}
            </span>
          </>
        )}
      </p>
      {/* "Você já pediu" era verdade enquanto a adesão nascia de pedido. Na H1
          ela virou ato do DP, e a frase passaria a mentir para quem tem uma
          demanda antiga ainda na fila — por isso ela diz o que de fato há. */}
      <span className={estilos.metaItem}>
        {beneficio.solicitacao_pendente
          ? "Há um pedido seu na fila do DP, de antes da mudança"
          : `Valor de tabela ${formatarMoeda(beneficio.valor_padrao)} · desconto ${formatarMoeda(beneficio.desconto_padrao)}`}
      </span>
    </li>
  );
}

function CartaoBeneficios({ bloco }: { bloco: BlocoBeneficios }) {
  return (
    <section className={estilos.cartao}>
      <div className={estilos.cabecalhoCartao}>
        <h2>Meus benefícios</h2>
        <Link className={estilos.ligacao} href="/beneficios">
          {/* Aderir saiu na H1 — quem concede é o DP. O que o titular ainda
              pede: revisão de valor (H3) e cancelamento. */}
          Pedir revisão de valor ou cancelamento →
        </Link>
      </div>
      {bloco.ativos.length === 0 ? (
        <p className={estilos.vazio}>Você não tem adesões ativas.</p>
      ) : (
        <div className={estilos.tabelaEnvolucro}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Benefício</th>
                <th>Desde</th>
                <th className={estilos.numero}>Valor</th>
                <th className={estilos.numero}>Meu desconto</th>
              </tr>
            </thead>
            <tbody>
              {bloco.ativos.map((adesao) => (
                <tr key={adesao.id}>
                  <td>
                    {adesao.beneficio_nome}
                    {categoriaInformativa(
                      adesao.beneficio_nome,
                      adesao.categoria_rotulo
                    ) && (
                      <>
                        <br />
                        <span className={estilos.metaItem}>
                          {adesao.categoria_rotulo}
                        </span>
                      </>
                    )}
                  </td>
                  <td>{formatarData(adesao.inicio)}</td>
                  <td className={estilos.numero}>
                    {formatarMoeda(adesao.valor)}
                  </td>
                  <td className={estilos.numero}>
                    {formatarMoeda(adesao.desconto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dependentes saíram daqui na H5 — viraram cartão próprio, com chave
          própria (`dependente.proprio.manter`) e cadastro do titular. */}

      {/* Na H1 a adesão deixou de ser pedida pelo colaborador: quem concede é o
          DP. Esta lista continua útil como "o que existe e você não tem", mas
          parou de ser um convite a aderir — não há mais botão. */}
      <h3 className={estilos.metaItem}>Disponíveis que você ainda não tem</h3>
      {bloco.elegiveis_sem_adesao.length === 0 ? (
        <p className={estilos.vazio}>
          Você já tem tudo o que se aplica ao seu caso hoje.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.elegiveis_sem_adesao.map((beneficio) => (
            <LinhaElegivel
              key={beneficio.beneficio_id}
              beneficio={beneficio}
            />
          ))}
        </ul>
      )}
      <p className={estilos.notaRodape}>
        Os valores acima são os da tabela vigente. O cálculo do que entra no
        holerite (teto de 6% do VT, PAT e incidências) é feito na folha.
      </p>
    </section>
  );
}

/**
 * Meus dependentes — o primeiro lugar do portal onde o colaborador ESCREVE.
 *
 * Saiu de dentro do cartão de benefícios na H5 porque virou cadastro, e cadastro
 * responde por outra chave (`dependente.proprio.manter`). Nenhuma das operações
 * manda `colaborador_id`: o titular sai da sessão, no servidor. O id de linha
 * que editar e excluir precisam nomear é reconferido contra o titular dentro da
 * transação — id alheio devolve o mesmo 404 de id inexistente.
 */
function CartaoDependentes({
  bloco,
  aoMudar,
}: {
  bloco: BlocoDependentes;
  aoMudar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function limpar() {
    setAberto(false);
    setEditando(null);
    setNome("");
    setNascimento("");
    setParentesco("");
    setErro(null);
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const corpo = { nome, nascimento, parentesco };
      const resposta = await fetch(
        editando === null
          ? "/api/portais/colaborador/dependentes"
          : `/api/portais/colaborador/dependentes/${editando}`,
        {
          method: editando === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        limpar();
        aoMudar();
      } else {
        setErro(dados.erro ?? "Não foi possível gravar o dependente.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover(id: number) {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/portais/colaborador/dependentes/${id}`,
        { method: "DELETE" }
      );
      if (resposta.ok) {
        aoMudar();
      } else {
        const dados = await resposta.json().catch(() => ({}));
        setErro(dados.erro ?? "Não foi possível remover o dependente.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={estilos.cartao}>
      <h2>Meus dependentes</h2>
      <p className={estilos.metaItem}>
        Você mesmo mantém esta lista. Ela conta na dedução de imposto de renda e
        nos benefícios que se estendem a dependente.
      </p>

      {bloco.itens.length === 0 ? (
        <p className={estilos.vazio}>Nenhum dependente cadastrado.</p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.itens.map((dependente) => (
            <li className={estilos.itemLista} key={dependente.id}>
              <p>{dependente.nome}</p>
              <span className={estilos.metaItem}>
                {dependente.parentesco_rotulo} · nascimento{" "}
                {formatarData(dependente.nascimento)}
              </span>{" "}
              <button
                className={estilos.ligacao}
                type="button"
                disabled={enviando}
                onClick={() => {
                  setEditando(dependente.id);
                  setNome(dependente.nome);
                  setNascimento(dependente.nascimento);
                  setParentesco(dependente.parentesco);
                  setAberto(true);
                  setErro(null);
                }}
              >
                editar
              </button>{" "}
              <button
                className={estilos.ligacao}
                type="button"
                disabled={enviando}
                onClick={() => {
                  // Mesma confirmação nomeada do painel do DP: o DELETE
                  // recalcula a folha em silêncio, não pode disparar sem aviso.
                  if (
                    window.confirm(`Remover o dependente ${dependente.nome}?`)
                  ) {
                    void remover(dependente.id);
                  }
                }}
              >
                remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {!aberto ? (
        <button
          className={estilos.ligacao}
          type="button"
          onClick={() => setAberto(true)}
        >
          + Acrescentar dependente
        </button>
      ) : (
        <form onSubmit={gravar}>
          {/* Campos nascem vazios ao acrescentar: quem escolhe é a pessoa. */}
          <input
            aria-label="Nome do dependente"
            placeholder="Nome completo"
            required
            minLength={3}
            maxLength={200}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={enviando}
          />{" "}
          <input
            aria-label="Data de nascimento"
            type="date"
            required
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
            disabled={enviando}
          />{" "}
          {/* A lista vem do servidor — no dia em que parentesco virar catálogo
              administrável, a tela não precisa saber que mudou. */}
          <select
            aria-label="Parentesco"
            required
            value={parentesco}
            onChange={(e) => setParentesco(e.target.value)}
            disabled={enviando}
          >
            <option value="">Escolha…</option>
            {bloco.parentescos_possiveis.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>{" "}
          <button type="submit" disabled={enviando}>
            {enviando ? "Gravando…" : editando === null ? "Acrescentar" : "Salvar"}
          </button>{" "}
          <button type="button" onClick={limpar} disabled={enviando}>
            Cancelar
          </button>
        </form>
      )}
      {erro && <p className={estilos.vazio}>{erro}</p>}
    </section>
  );
}

function LinhaDocumento({ documento }: { documento: MeuDocumento }) {
  return (
    <li
      className={
        documento.ciencia_em === null
          ? `${estilos.itemLista} ${estilos.itemListaAcao}`
          : estilos.itemLista
      }
    >
      <p>{documento.titulo}</p>
      <span className={estilos.metaItem}>
        {documento.geral ? "Documento geral" : "Da minha pasta"} · enviado em{" "}
        {formatarInstante(documento.enviado_em)}
        {documento.ciencia_em !== null
          ? ` · ciência em ${formatarInstante(documento.ciencia_em)}`
          : ""}
      </span>
    </li>
  );
}

function CartaoDocumentos({ bloco }: { bloco: BlocoDocumentos }) {
  return (
    <section className={estilos.cartao}>
      <div className={estilos.cabecalhoCartao}>
        <h2>Meus documentos</h2>
        <Link className={estilos.ligacao} href="/documentos">
          Abrir e dar ciência →
        </Link>
      </div>
      <div className={estilos.cartoesResumo}>
        <div
          className={
            bloco.aguardando_ciencia.length > 0
              ? `${estilos.cartaoResumo} ${estilos.cartaoResumoAcao}`
              : estilos.cartaoResumo
          }
        >
          <strong>{bloco.aguardando_ciencia.length}</strong>
          <span>Aguardam sua ciência</span>
        </div>
        <div className={estilos.cartaoResumo}>
          <strong>{bloco.com_ciencia.length}</strong>
          <span>Já com ciência</span>
        </div>
      </div>
      {bloco.aguardando_ciencia.length === 0 ? (
        <p className={estilos.vazio}>
          Nada pendente: você deu ciência em todos os documentos disponíveis.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.aguardando_ciencia.map((documento) => (
            <LinhaDocumento key={documento.id} documento={documento} />
          ))}
        </ul>
      )}
      {bloco.com_ciencia.length > 0 && (
        <>
          <h3 className={estilos.metaItem}>Com ciência registrada</h3>
          <ul className={estilos.lista}>
            {bloco.com_ciencia.map((documento) => (
              <LinhaDocumento key={documento.id} documento={documento} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function LinhaMinhaPosse({
  item,
  emCurso,
  aoDarCiencia,
}: {
  item: ItemMinhaPosse;
  emCurso: boolean;
  aoDarCiencia: (itemId: number) => void;
}) {
  const cienciaPendente =
    item.termo_documento_id !== null && !item.ciencia_registrada;
  return (
    <li
      className={
        cienciaPendente
          ? `${estilos.itemLista} ${estilos.itemListaAcao}`
          : estilos.itemLista
      }
    >
      <p>{item.descricao}</p>
      <span className={estilos.metaItem}>
        {item.categoria_nome} · qtd {item.quantidade}
        {item.numero_serie ? ` · nº ${item.numero_serie}` : ""} · entregue em{" "}
        {formatarData(item.data_entrega)} ·{" "}
        {item.devolvido_em
          ? `devolvido em ${formatarInstante(item.devolvido_em)}`
          : "em uso"}
      </span>
      <span className={estilos.metaItem}>
        Termo:{" "}
        {item.termo_documento_id !== null ? (
          <a
            className={estilos.ligacao}
            href={`/api/documentos/${item.termo_documento_id}/download`}
          >
            {item.termo_titulo ?? `#${item.termo_documento_id}`}
          </a>
        ) : (
          "sem termo no GED"
        )}
        {" · "}
        {item.ciencia_registrada
          ? "ciência registrada"
          : item.termo_documento_id !== null
            ? "ciência pendente"
            : "sem termo, sem ciência"}
      </span>
      {cienciaPendente && (
        <span>
          <button
            className={estilos.ligacao}
            type="button"
            disabled={emCurso}
            onClick={() => aoDarCiencia(item.id)}
            title="Aceite eletrônico: a ciência é dada sobre o termo no GED (hash da versão no momento)"
          >
            {emCurso ? "Registrando…" : "Dar ciência"}
          </button>
        </span>
      )}
    </li>
  );
}

/**
 * Minha posse de patrimônio — a superfície do TITULAR (pendência 16.1): o
 * botão "Dar ciência" da ficha só alcança quem tem rh.posse.ver, que o
 * funcionário típico não tem. Busca o próprio dado (/api/posse/minhas, porta
 * documento.ver) com fetch tolerante, molde BlocoPosseFicha: 403 => o cartão
 * some (ausência legítima da chave); lista vazia => some (nada em posse);
 * 5xx/timeout/rede => erro visível + "tentar novamente" — esconder ali seria
 * falso-negativo. Falha aqui NÃO derruba o portal.
 */
function CartaoMinhaPosse() {
  const [itens, setItens] = useState<ItemMinhaPosse[] | null>(null);
  const [visivel, setVisivel] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [cienciaEmCurso, setCienciaEmCurso] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/posse/minhas", { cache: "no-store" });
      if (resposta.status === 403) {
        // Só o 403 esconde: ausência legítima da chave documento.ver.
        setVisivel(false);
        return;
      }
      if (!resposta.ok) {
        setErroCarregar("Não foi possível carregar. Tente novamente.");
        return;
      }
      const dados = (await resposta.json().catch(() => ({}))) as {
        itens?: ItemMinhaPosse[];
      };
      setErroCarregar(null);
      setItens(dados.itens ?? []);
    } catch {
      setErroCarregar("Falha de conexão. Tente novamente.");
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      if (!ativo) return;
      await recarregar();
    })();
    return () => {
      ativo = false;
    };
  }, [recarregar]);

  async function darCiencia(itemId: number) {
    setErroAcao(null);
    setCienciaEmCurso(itemId);
    try {
      const resposta = await fetch(`/api/posse/${itemId}/ciencia`, {
        method: "POST",
      });
      if (!resposta.ok) {
        const dados = (await resposta.json().catch(() => ({}))) as {
          erro?: string;
        };
        setErroAcao(dados.erro ?? "Não foi possível registrar a ciência.");
        if (resposta.status === 409) {
          // Duplo clique ou corrida: já registrada — recarrega para refletir.
          await recarregar();
        }
        return;
      }
      await recarregar();
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setCienciaEmCurso(null);
    }
  }

  if (!visivel) return null;

  // Carregando sem erro: o cartão ainda não tem o que dizer — não ocupa lugar.
  if (itens === null && erroCarregar === null) return null;

  if (itens === null) {
    return (
      <section className={estilos.cartao}>
        <h2>Minha posse de patrimônio</h2>
        <p className={estilos.erro}>{erroCarregar}</p>
        <button
          className={estilos.ligacao}
          type="button"
          onClick={() => {
            setErroCarregar(null);
            void recarregar();
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  // Sem item nenhum (nem devolvido): cartão fora — molde "Minhas entregas de
  // EPI" do painel de SST; ausência de dado não é erro.
  if (itens.length === 0) return null;

  const aguardandoCiencia = itens.filter(
    (item) => item.termo_documento_id !== null && !item.ciencia_registrada
  );
  const emUso = itens.filter((item) => item.devolvido_em === null);

  return (
    <section className={estilos.cartao}>
      <h2>Minha posse de patrimônio</h2>
      <div className={estilos.cartoesResumo}>
        <div
          className={
            aguardandoCiencia.length > 0
              ? `${estilos.cartaoResumo} ${estilos.cartaoResumoAcao}`
              : estilos.cartaoResumo
          }
        >
          <strong>{aguardandoCiencia.length}</strong>
          <span>Aguardam sua ciência</span>
        </div>
        <div className={estilos.cartaoResumo}>
          <strong>{emUso.length}</strong>
          <span>Em posse com você</span>
        </div>
      </div>
      <ul className={estilos.lista}>
        {itens.map((item) => (
          <LinhaMinhaPosse
            key={item.id}
            item={item}
            emCurso={cienciaEmCurso === item.id}
            aoDarCiencia={(id) => void darCiencia(id)}
          />
        ))}
      </ul>
      {erroAcao && <p className={estilos.erro}>{erroAcao}</p>}
      <p className={estilos.notaRodape}>
        A ciência é o aceite eletrônico do termo de entrega no GED (hash da
        versão no momento). A devolução é registrada pelo DP/RH.
      </p>
    </section>
  );
}

function CartaoAvaliacoes({ bloco }: { bloco: BlocoAvaliacoes }) {
  return (
    <section className={estilos.cartao}>
      <h2>Minhas avaliações e PDI</h2>
      {bloco.ciclos.length === 0 ? (
        <p className={estilos.vazio}>
          Você ainda não participou de um ciclo de avaliação.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.ciclos.map((ciclo) => (
            <li className={estilos.itemLista} key={ciclo.id}>
              <p>{ciclo.tipo_rotulo}</p>
              <span className={estilos.metaItem}>
                {ciclo.andamento}
                {ciclo.concluida_em !== null
                  ? ` em ${formatarInstante(ciclo.concluida_em)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Regra do MVP explicada na tela: o silêncio sobre a nota é decisão de
          desenho, não defeito — quem conversa o resultado é o gestor. */}
      <p className={estilos.avisoNeutro}>
        A nota e o resultado do ciclo não aparecem aqui: no modelo atual o
        retorno da avaliação é dado pelo seu gestor na conversa de feedback.
        Aqui fica o registro de que o ciclo aconteceu.
      </p>

      <h3 className={estilos.metaItem}>
        Meu plano de desenvolvimento (ações acordadas)
      </h3>
      {bloco.pdi.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma ação de desenvolvimento aberta.</p>
      ) : (
        <ul className={estilos.lista}>
          {bloco.pdi.map((item) => (
            <li
              className={
                item.em_atraso
                  ? `${estilos.itemLista} ${estilos.itemListaAcao}`
                  : estilos.itemLista
              }
              key={item.id}
            >
              <p>{item.descricao}</p>
              <span className={estilos.metaItem}>
                {item.status_rotulo} · prazo {formatarData(item.prazo)} · com{" "}
                {item.responsavel_nome}
                {item.em_atraso ? " · em atraso" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CartaoCheckin({ bloco }: { bloco: BlocoCheckin }) {
  return (
    <section className={estilos.cartao}>
      <h2>Meu check-in de hoje</h2>
      {bloco.respondido ? (
        <p className={estilos.vazio}>
          Você já respondeu o check-in de {formatarData(bloco.data_referencia)}.
          Obrigado!
        </p>
      ) : (
        <>
          <p className={estilos.vazio}>
            Você ainda não respondeu o check-in de hoje —{" "}
            {bloco.perguntas_pendentes}{" "}
            {bloco.perguntas_pendentes === 1 ? "pergunta" : "perguntas"}, menos
            de 10 segundos.
          </p>
          <div className={estilos.acoesCartao}>
            <Link className={estilos.botaoLigacao} href="/clima">
              Responder agora
            </Link>
          </div>
        </>
      )}
      <p className={estilos.avisoNeutro}>{bloco.aviso_transparencia}</p>
    </section>
  );
}

/**
 * Meu ponto — pedido textual da diretoria: saldo do banco de horas, média de
 * hora extra POR DIA e total de HE do último mês, com link para o espelho.
 *
 * Sem valor em reais de propósito: hora extra em dinheiro é folha, tem chave
 * própria e trilha própria. Aqui é jornada.
 */
function CartaoPonto({ bloco }: { bloco: BlocoPonto }) {
  if (!bloco.disponivel) {
    return (
      <section className={estilos.cartao}>
        <h2>Meu ponto</h2>
        <p className={estilos.vazio}>{bloco.explicacao}</p>
      </section>
    );
  }
  const saldo = bloco.saldo_banco_minutos ?? 0;
  return (
    <section className={estilos.cartao}>
      <h2>Meu ponto e banco de horas</h2>
      <dl className={estilos.dados}>
        <div className={estilos.dado}>
          <dt>Saldo do banco de horas</dt>
          <dd>
            <strong>{formatarMinutos(saldo)}</strong>{" "}
            {saldo > 0
              ? "a seu favor"
              : saldo < 0
                ? "a compensar"
                : "— zerado"}
          </dd>
        </div>
        <div className={estilos.dado}>
          <dt>Média de hora extra por dia</dt>
          <dd>{formatarMinutos(bloco.media_he_por_dia_util_minutos ?? 0)}</dd>
        </div>
        <div className={estilos.dado}>
          <dt>Total de hora extra no último mês</dt>
          <dd>
            {formatarMinutos(bloco.total_he_ultimo_mes_minutos ?? 0)}
            {bloco.ultima_apuracao
              ? ` (${bloco.ultima_apuracao.competencia})`
              : " — nenhuma competência apurada ainda"}
          </dd>
        </div>
        {(bloco.intercorrencias_abertas ?? 0) > 0 && (
          <div className={estilos.dado}>
            <dt>Pendências no seu ponto</dt>
            <dd>
              {bloco.intercorrencias_abertas} em aberto — o DP está tratando.
            </dd>
          </div>
        )}
      </dl>
      {bloco.espelho_href && (
        <div className={estilos.acoesCartao}>
          <Link className={estilos.botaoLigacao} href={bloco.espelho_href}>
            Ver meu espelho do mês
          </Link>
        </div>
      )}
      <p className={estilos.notaRodape}>
        A média divide a hora extra do mês pelos dias com jornada prevista. O
        valor em reais da hora extra aparece no holerite, não aqui.
      </p>
    </section>
  );
}

function CartaoTreinamentos({ explicacao }: { explicacao: string }) {
  return (
    <section className={estilos.cartao}>
      <h2>Treinamentos</h2>
      <p className={estilos.vazio}>{explicacao}</p>
    </section>
  );
}

// ------------------------------------------------------------------ tela

export function PortalColaborador() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [ponto, setPonto] = useState<BlocoPonto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Bloco de ponto vem do domínio DONO do dado, com a chave dele
  // (ponto.ver.proprio). Falha aqui não derruba o portal: o cartão só não
  // aparece.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/ponto/resumo", {
          cache: "no-store",
        });
        if (!ativo || !resposta.ok) return;
        setPonto((await resposta.json()) as BlocoPonto);
      } catch {
        /* portal segue sem o bloco de ponto */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  // Recarrega a visão inteira. A H5 abriu ESCRITA no portal (dependentes), e
  // depois de gravar o payload muda — em vez de remendar o estado local, o
  // servidor volta a ser a única verdade.
  const recarregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/portais/colaborador", {
        cache: "no-store",
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setVisao(dados as Visao);
        setErro(null);
      } else {
        setErro(
          (dados as { erro?: string }).erro ?? "Falha ao carregar o portal."
        );
      }
    } catch {
      setErro("Falha de rede ao carregar o portal.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // A carga inicial mantém a forma guardada do resto do arquivo: a escrita de
  // estado acontece DEPOIS do await e só se o componente ainda estiver montado.
  // Chamar `recarregar()` cru aqui faria o estado ser escrito de dentro do
  // efeito, que é o que a regra react-hooks/set-state-in-effect barra.
  useEffect(() => {
    let ativo = true;
    void (async () => {
      if (!ativo) return;
      await recarregar();
    })();
    return () => {
      ativo = false;
    };
  }, [recarregar]);

  return (
    <div className={estilos.pagina}>
      <Cabecalho ocultarMeuPortal>
        <Link className={acaoCabecalho} href="/demandas">
          Solicitações
        </Link>
        <Link className={acaoCabecalho} href="/ferias">
          Férias
        </Link>
        <Link className={acaoCabecalho} href="/documentos">
          Documentos
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Meu portal</h1>
        <p className={estilos.subtitulo}>
          Seus dados, suas solicitações e o que está pendente com você — num só
          lugar.
        </p>

        {carregando && <p className={estilos.vazio}>Carregando…</p>}
        {erro !== null && <p className={estilos.erro}>{erro}</p>}

        {visao !== null && (
          <>
            <CartaoMeusDados dados={visao.meus_dados} />

            <div className={estilos.colunas}>
              {ponto !== null && <CartaoPonto bloco={ponto} />}
              {visao.ferias !== null && <CartaoFerias bloco={visao.ferias} />}
              {visao.solicitacoes !== null && (
                <CartaoSolicitacoes bloco={visao.solicitacoes} />
              )}
              {visao.beneficios !== null && (
                <CartaoBeneficios bloco={visao.beneficios} />
              )}
              {visao.dependentes !== null && (
                <CartaoDependentes
                  bloco={visao.dependentes}
                  aoMudar={recarregar}
                />
              )}
              {visao.documentos !== null && (
                <CartaoDocumentos bloco={visao.documentos} />
              )}
              {/* Cartão autônomo: busca o próprio dado e se esconde sozinho
                  (403/sem itens). Falha nele não derruba o portal. */}
              <CartaoMinhaPosse />
              <CartaoAvaliacoes bloco={visao.avaliacoes} />
              {visao.checkin !== null && (
                <CartaoCheckin bloco={visao.checkin} />
              )}
              <CartaoTreinamentos
                explicacao={visao.treinamentos.explicacao}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
