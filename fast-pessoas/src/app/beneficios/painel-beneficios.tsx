"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  CATEGORIAS_BENEFICIO,
  descreverCriterio,
  formatarMoeda,
  PARENTESCOS,
  ROTULOS_CATEGORIA,
  ROTULOS_NATUREZA,
  ROTULOS_PARENTESCO,
  ROTULOS_STATUS_ADESAO,
} from "@/dominios/beneficios/esquemas";
import { ROTULOS_VINCULO, TIPOS_VINCULO } from "@/dominios/colaboradores/esquemas";
import {
  formatarNumeroDemanda,
  ROTULOS_STATUS_DEMANDA,
  StatusDemanda,
} from "@/dominios/demandas/esquemas";
import estilos from "./page.module.css";
import {
  Adesao,
  Beneficio,
  Dependente,
  RegraVersao,
  Solicitacao,
  UnidadeOpcao,
  Visao,
} from "./tipos";

type AbaPrincipal = "meus" | "gerir" | "catalogo";

// Não há `{ tipo: "solicitar" }`: o colaborador não pede mais adesão (onda H1).
type Dialogo =
  | { tipo: "cancelamento_titular"; adesao: Adesao }
  | { tipo: "revisao_titular"; adesao: Adesao }
  | { tipo: "decidir_revisao"; solicitacao: Solicitacao; adesao: Adesao | null }
  | { tipo: "conceder"; solicitacao?: Solicitacao }
  | { tipo: "negar"; solicitacao: Solicitacao }
  | { tipo: "cancelar_adesao"; adesao: Adesao; solicitacao?: Solicitacao }
  | { tipo: "beneficio"; beneficio?: Beneficio }
  | { tipo: "regra"; beneficio: Beneficio }
  | { tipo: "dependente"; colaboradorId: number; dependente?: Dependente };

const BADGE_STATUS_DEMANDA: Record<StatusDemanda, string> = {
  aguardando_aprovacao: "badgeWarning",
  aberta: "badgeInfo",
  em_atendimento: "badgeInfo",
  concluida: "badgeSuccess",
  recusada: "badgeDanger",
};

const BADGE_STATUS_ADESAO: Record<Adesao["status"], string> = {
  ativa: "badgeSuccess",
  suspensa: "badgeWarning",
  cancelada: "badgeNeutro",
};

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

async function requisitar(
  url: string,
  metodo: string,
  corpo?: unknown
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const resposta = await fetch(url, {
      method: metodo,
      headers:
        corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (resposta.ok) return { ok: true };
    const dados = (await resposta.json().catch(() => ({}))) as {
      erro?: string;
    };
    return {
      ok: false,
      erro: dados.erro ?? "Não foi possível concluir a ação.",
    };
  } catch {
    return { ok: false, erro: "Falha de conexão. Tente novamente." };
  }
}

function numeroOuIndefinido(texto: string): number | undefined {
  if (texto.trim() === "") return undefined;
  const valor = Number(texto.replace(",", "."));
  return Number.isNaN(valor) ? undefined : valor;
}

// ------------------------------------------------------------------ casca de diálogo

function CascaDialogo({
  titulo,
  sub,
  textoEnviar,
  enviando,
  erro,
  aoFechar,
  aoEnviar,
  children,
}: {
  titulo: string;
  sub?: string;
  textoEnviar: string;
  enviando: boolean;
  erro: string | null;
  aoFechar: () => void;
  aoEnviar: (evento: FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={estilos.fundoDialogo}>
      <div className={estilos.dialogo} role="dialog" aria-modal="true">
        <h3>{titulo}</h3>
        {sub && <p className={estilos.subDialogo}>{sub}</p>}
        <form onSubmit={aoEnviar}>
          {children}
          {erro && <p className={estilos.erroAcao}>{erro}</p>}
          <div className={estilos.acoesDialogo}>
            <button
              className={estilos.botaoSecundario}
              type="button"
              onClick={aoFechar}
            >
              Cancelar
            </button>
            <button
              className={estilos.botaoPrimario}
              type="submit"
              disabled={enviando}
            >
              {enviando ? "Enviando…" : textoEnviar}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Prefixo "use" exigido pela regra de hooks do React.
function useEnvio(
  aoConcluir: () => void
): [boolean, string | null, (fn: () => Promise<{ ok: boolean; erro?: string }>) => void] {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  function executar(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setEnviando(true);
    setErro(null);
    fn()
      .then((resultado) => {
        if (resultado.ok) {
          aoConcluir();
        } else {
          setErro(resultado.erro ?? null);
        }
      })
      .finally(() => setEnviando(false));
  }
  return [enviando, erro, executar];
}

// ------------------------------------------------------------------ diálogos do titular
//
// `DialogoSolicitarAdesao` existia aqui. Saiu com a onda H1: a pessoa já entra
// com direito e quem concede é o DP. O pedido de CANCELAMENTO fica — o que
// acabou foi a candidatura, não a voz de quem quer sair do plano.

function DialogoCancelamentoTitular({
  adesao,
  aoFechar,
  aoConcluir,
}: {
  adesao: Adesao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  return (
    <CascaDialogo
      titulo={`Solicitar cancelamento — ${adesao.beneficio_nome}`}
      sub="O pedido vira uma demanda; o DP confirma o cancelamento."
      textoEnviar="Solicitar cancelamento"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar(
            `/api/beneficios/adesoes/${adesao.id}/solicitar-cancelamento`,
            "POST",
            { motivo }
          )
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="motivo-cancelamento">
        Motivo
      </label>
      <textarea
        className={`${estilos.campo} ${estilos.campoTexto}`}
        id="motivo-cancelamento"
        required
        maxLength={2000}
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
      />
    </CascaDialogo>
  );
}

/**
 * O titular pede que o VALOR seja revisto (H3) — o caso do dono: mudou de casa,
 * a passagem subiu. O valor aqui é PROPOSTA; quem decide é o DP, que pode
 * conceder outro. Nasce vazio: quem propõe é a pessoa, não o sistema.
 */
function DialogoRevisaoTitular({
  adesao,
  aoFechar,
  aoConcluir,
}: {
  adesao: Adesao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [valorPedido, setValorPedido] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  return (
    <CascaDialogo
      titulo={`Pedir revisão de valor — ${adesao.beneficio_nome}`}
      sub={`Hoje: valor ${formatarMoeda(adesao.valor)} · desconto ${formatarMoeda(adesao.desconto)}. O pedido vira demanda; o DP decide o valor final.`}
      textoEnviar="Pedir revisão"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar("/api/beneficios/adesoes/revisao", "POST", {
            adesao_id: adesao.id,
            valor_pedido: Number(valorPedido),
            motivo,
          })
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="valor-pedido-revisao">
        Valor que você está pedindo (R$)
      </label>
      <input
        className={estilos.campo}
        id="valor-pedido-revisao"
        type="number"
        min={0}
        step="0.01"
        required
        value={valorPedido}
        onChange={(evento) => setValorPedido(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="motivo-revisao">
        Motivo
      </label>
      <textarea
        className={`${estilos.campo} ${estilos.campoTexto}`}
        id="motivo-revisao"
        required
        minLength={10}
        maxLength={2000}
        placeholder="ex.: mudei de endereço e a passagem subiu"
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
      />
    </CascaDialogo>
  );
}

// ------------------------------------------------------------------ diálogos do DP

/** Texto do número como o campo `number` espera — "" quando não há sugestão. */
function textoDeReais(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

/**
 * O campo de dinheiro da concessão, com a sugestão VISÍVEL como sugestão.
 *
 * O defeito que isto fecha: o valor da pessoa nascia preenchido pelo servidor
 * quando o DP deixava o campo vazio, e nada na tela dizia que uma escolha
 * tinha sido feita. Agora a regra vigente preenche o campo — mas o campo diz,
 * embaixo, que aquele número veio da tabela e ainda não passou por ninguém. No
 * primeiro toque do DP a marca muda para "valor desta pessoa", e o caminho de
 * volta à sugestão continua a um clique.
 */
function CampoDinheiroSugerido({
  id,
  rotulo,
  valor,
  sugestao,
  ehSugestao,
  origemSugestao,
  aoDigitar,
  aoRestaurar,
}: {
  id: string;
  rotulo: string;
  valor: string;
  sugestao: number | null;
  ehSugestao: boolean;
  origemSugestao: string | null;
  aoDigitar: (texto: string) => void;
  aoRestaurar: () => void;
}) {
  return (
    <div>
      <label className={estilos.rotuloCampo} htmlFor={id}>
        {rotulo}
      </label>
      <input
        className={`${estilos.campo} ${ehSugestao ? estilos.campoSugerido : ""}`}
        id={id}
        type="number"
        min={0}
        step="0.01"
        required
        value={valor}
        onChange={(evento) => aoDigitar(evento.target.value)}
      />
      {ehSugestao ? (
        <p className={estilos.marcaSugestao}>
          sugerido pela regra {origemSugestao} — confirme ou troque
        </p>
      ) : sugestao !== null ? (
        <p className={estilos.marcaEscolhido}>
          valor desta pessoa ·{" "}
          <button
            className={estilos.ligacaoLeve}
            type="button"
            onClick={aoRestaurar}
          >
            voltar à sugestão ({formatarMoeda(sugestao)})
          </button>
        </p>
      ) : (
        <p className={estilos.marcaEscolhido}>
          a regra vigente não traz referência — o valor é o que você informar
        </p>
      )}
    </div>
  );
}

function DialogoConceder({
  solicitacao,
  visao,
  aoFechar,
  aoConcluir,
}: {
  solicitacao?: Solicitacao;
  visao: Visao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const beneficios = visao.gestao?.beneficios ?? [];
  const colaboradores = visao.gestao?.colaboradores ?? [];
  const beneficioInicial = solicitacao?.beneficio_id
    ? String(solicitacao.beneficio_id)
    : "";
  // A sugestão da demanda antiga também tem de aparecer já preenchida — por
  // isso o estado nasce da regra, e não vazio com um `useEffect` depois.
  const regraInicial =
    beneficios.find((item) => String(item.id) === beneficioInicial)?.regra ??
    null;

  const [colaboradorId, setColaboradorId] = useState(
    solicitacao?.solicitante_colaborador_id
      ? String(solicitacao.solicitante_colaborador_id)
      : ""
  );
  const [beneficioId, setBeneficioId] = useState(beneficioInicial);
  const [inicio, setInicio] = useState(hojeLocal());
  const [valor, setValor] = useState(textoDeReais(regraInicial?.valor_padrao));
  const [desconto, setDesconto] = useState(
    textoDeReais(regraInicial?.desconto_padrao)
  );
  // "Ninguém escolheu isto ainda." Vira false no primeiro toque do DP.
  const [valorSugerido, setValorSugerido] = useState(
    regraInicial?.valor_padrao != null
  );
  const [descontoSugerido, setDescontoSugerido] = useState(
    regraInicial?.desconto_padrao != null
  );
  const [enviando, erro, executar] = useEnvio(aoConcluir);

  const beneficio = beneficios.find((item) => String(item.id) === beneficioId);
  const regra = beneficio?.regra ?? null;
  const veioDeSolicitacao = solicitacao !== undefined;
  const origemSugestao = regra
    ? `vigente desde ${formatarData(regra.inicio_vigencia)}`
    : null;

  function trocarBeneficio(novoId: string) {
    setBeneficioId(novoId);
    const nova =
      beneficios.find((item) => String(item.id) === novoId)?.regra ?? null;
    setValor(textoDeReais(nova?.valor_padrao));
    setDesconto(textoDeReais(nova?.desconto_padrao));
    setValorSugerido(nova?.valor_padrao != null);
    setDescontoSugerido(nova?.desconto_padrao != null);
  }

  return (
    <CascaDialogo
      titulo="Conceder benefício"
      sub={
        veioDeSolicitacao
          ? `Pedido ${formatarNumeroDemanda(solicitacao.numero)} de ${solicitacao.solicitante_nome}, do tempo em que se pedia adesão — será concluído junto.`
          : "Ato do DP: a pessoa já tem direito. Informe o valor dela."
      }
      textoEnviar="Conceder"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar("/api/beneficios/adesoes", "POST", {
            colaborador_id: Number(colaboradorId),
            beneficio_id: Number(beneficioId),
            inicio,
            valor: numeroOuIndefinido(valor),
            desconto: numeroOuIndefinido(desconto),
            demanda_id: solicitacao?.demanda_id,
          })
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="conceder-colaborador">
        Colaborador
      </label>
      <select
        className={estilos.campo}
        id="conceder-colaborador"
        required
        disabled={veioDeSolicitacao}
        value={colaboradorId}
        onChange={(evento) => setColaboradorId(evento.target.value)}
      >
        <option value="">Selecione…</option>
        {colaboradores.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome_completo} ({item.matricula})
          </option>
        ))}
      </select>
      <label className={estilos.rotuloCampo} htmlFor="conceder-beneficio">
        Benefício
      </label>
      <select
        className={estilos.campo}
        id="conceder-beneficio"
        required
        disabled={veioDeSolicitacao && solicitacao.beneficio_id !== null}
        value={beneficioId}
        onChange={(evento) => trocarBeneficio(evento.target.value)}
      >
        <option value="">Selecione…</option>
        {beneficios.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </select>
      <label className={estilos.rotuloCampo} htmlFor="conceder-inicio">
        Início da vigência
      </label>
      <input
        className={estilos.campo}
        id="conceder-inicio"
        type="date"
        required
        value={inicio}
        onChange={(evento) => setInicio(evento.target.value)}
      />
      <div className={estilos.linhaCampos}>
        <CampoDinheiroSugerido
          id="conceder-valor"
          rotulo="Valor (R$)"
          valor={valor}
          sugestao={regra?.valor_padrao ?? null}
          ehSugestao={valorSugerido}
          origemSugestao={origemSugestao}
          aoDigitar={(texto) => {
            setValor(texto);
            setValorSugerido(false);
          }}
          aoRestaurar={() => {
            setValor(textoDeReais(regra?.valor_padrao));
            setValorSugerido(regra?.valor_padrao != null);
          }}
        />
        <CampoDinheiroSugerido
          id="conceder-desconto"
          rotulo="Desconto em folha (R$)"
          valor={desconto}
          sugestao={regra?.desconto_padrao ?? null}
          ehSugestao={descontoSugerido}
          origemSugestao={origemSugestao}
          aoDigitar={(texto) => {
            setDesconto(texto);
            setDescontoSugerido(false);
          }}
          aoRestaurar={() => {
            setDesconto(textoDeReais(regra?.desconto_padrao));
            setDescontoSugerido(regra?.desconto_padrao != null);
          }}
        />
      </div>
      <p className={estilos.dica}>
        Os dois são obrigatórios e valem só para esta pessoa: o VT de um pode ser
        R$ 600 e o de outro R$ 720. Sem desconto em folha, informe 0.
      </p>
    </CascaDialogo>
  );
}

/**
 * O DP decide a revisão de valor (H4). O concedido pode ser OUTRO valor — o
 * pedido fica à vista, mas os campos nascem vazios: a decisão é de quem decide.
 * Aprovar encerra a adesão vigente e abre outra; a data diz de quando a folha
 * usa o valor novo, e o servidor recusa data em competência fechada.
 */
function DialogoDecidirRevisao({
  solicitacao,
  adesao,
  aoFechar,
  aoConcluir,
}: {
  solicitacao: Solicitacao;
  adesao: Adesao | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [valor, setValor] = useState("");
  const [desconto, setDesconto] = useState("");
  const [inicio, setInicio] = useState("");
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  const atual = adesao
    ? `valor ${formatarMoeda(adesao.valor)} · desconto ${formatarMoeda(adesao.desconto)}`
    : "adesão vigente não localizada";
  const pedido =
    solicitacao.valor_pedido !== null
      ? formatarMoeda(solicitacao.valor_pedido)
      : "—";
  return (
    <CascaDialogo
      titulo={`Decidir revisão — ${solicitacao.beneficio_nome ?? "benefício"}`}
      sub={`Hoje: ${atual}. A pessoa pediu ${pedido}. O valor que vale é o que você conceder aqui.`}
      textoEnviar="Aprovar revisão"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar(
            `/api/beneficios/adesoes/revisao/${solicitacao.demanda_id}`,
            "PATCH",
            {
              valor: Number(valor),
              desconto: Number(desconto),
              inicio,
            }
          )
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="valor-decidir-revisao">
        Valor concedido (R$)
      </label>
      <input
        className={estilos.campo}
        id="valor-decidir-revisao"
        type="number"
        min={0}
        step="0.01"
        required
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="desconto-decidir-revisao">
        Desconto (R$)
      </label>
      <input
        className={estilos.campo}
        id="desconto-decidir-revisao"
        type="number"
        min={0}
        step="0.01"
        required
        value={desconto}
        onChange={(evento) => setDesconto(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="inicio-decidir-revisao">
        Vale a partir de
      </label>
      <input
        className={estilos.campo}
        id="inicio-decidir-revisao"
        type="date"
        required
        value={inicio}
        onChange={(evento) => setInicio(evento.target.value)}
      />
    </CascaDialogo>
  );
}

function DialogoNegar({
  solicitacao,
  aoFechar,
  aoConcluir,
}: {
  solicitacao: Solicitacao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  return (
    <CascaDialogo
      titulo={`Negar solicitação ${formatarNumeroDemanda(solicitacao.numero)}`}
      sub="O solicitante vê o motivo na demanda recusada."
      textoEnviar="Negar"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar(
            `/api/beneficios/solicitacoes/${solicitacao.demanda_id}/negar`,
            "POST",
            { motivo }
          )
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="motivo-negativa">
        Motivo
      </label>
      <textarea
        className={`${estilos.campo} ${estilos.campoTexto}`}
        id="motivo-negativa"
        required
        maxLength={2000}
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
      />
    </CascaDialogo>
  );
}

function DialogoCancelarAdesao({
  adesao,
  solicitacao,
  aoFechar,
  aoConcluir,
}: {
  adesao: Adesao;
  solicitacao?: Solicitacao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [fim, setFim] = useState(hojeLocal());
  const [motivo, setMotivo] = useState("");
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  return (
    <CascaDialogo
      titulo={`Cancelar adesão — ${adesao.beneficio_nome}`}
      sub={`${adesao.colaborador_nome} (${adesao.colaborador_matricula}) — a vigência fecha, nada é apagado.`}
      textoEnviar="Cancelar adesão"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar(`/api/beneficios/adesoes/${adesao.id}/cancelar`, "POST", {
            fim,
            motivo: motivo.trim() === "" ? undefined : motivo,
            demanda_id: solicitacao?.demanda_id,
          })
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="fim-adesao">
        Fim da vigência
      </label>
      <input
        className={estilos.campo}
        id="fim-adesao"
        type="date"
        required
        value={fim}
        onChange={(evento) => setFim(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="motivo-cancelar-adesao">
        Motivo (opcional)
      </label>
      <textarea
        className={`${estilos.campo} ${estilos.campoTexto}`}
        id="motivo-cancelar-adesao"
        maxLength={2000}
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
      />
    </CascaDialogo>
  );
}

// ------------------------------------------------------------------ diálogos do catálogo (administrar)

function DialogoBeneficio({
  beneficio,
  aoFechar,
  aoConcluir,
}: {
  beneficio?: Beneficio;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [chave, setChave] = useState(beneficio?.chave ?? "");
  const [nome, setNome] = useState(beneficio?.nome ?? "");
  const [categoria, setCategoria] = useState<string>(
    beneficio?.categoria ?? "outro"
  );
  const [ativo, setAtivo] = useState(beneficio?.ativo ?? true);
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  const edicao = beneficio !== undefined;
  return (
    <CascaDialogo
      titulo={edicao ? `Editar benefício — ${beneficio.nome}` : "Novo benefício"}
      sub={
        edicao
          ? "Desativar não apaga nada: só fecha para adesões novas."
          : "A elegibilidade e os valores entram depois, como versão de regra."
      }
      textoEnviar={edicao ? "Salvar" : "Criar benefício"}
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          edicao
            ? requisitar(`/api/beneficios/${beneficio.id}`, "PATCH", {
                nome,
                categoria,
                ativo,
              })
            : requisitar("/api/beneficios", "POST", { chave, nome, categoria })
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="beneficio-chave">
        Chave (identidade estável, ex.: vt, plano_saude)
      </label>
      <input
        className={estilos.campo}
        id="beneficio-chave"
        required
        disabled={edicao}
        maxLength={40}
        pattern="[a-z][a-z0-9_]{1,39}"
        value={chave}
        onChange={(evento) => setChave(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="beneficio-nome">
        Nome
      </label>
      <input
        className={estilos.campo}
        id="beneficio-nome"
        required
        maxLength={120}
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="beneficio-categoria">
        Categoria
      </label>
      <select
        className={estilos.campo}
        id="beneficio-categoria"
        value={categoria}
        onChange={(evento) => setCategoria(evento.target.value)}
      >
        {CATEGORIAS_BENEFICIO.map((item) => (
          <option key={item} value={item}>
            {ROTULOS_CATEGORIA[item]}
          </option>
        ))}
      </select>
      {edicao && (
        <label className={`${estilos.rotuloCampo} ${estilos.opcaoCaixa}`}>
          <input
            type="checkbox"
            checked={ativo}
            onChange={(evento) => setAtivo(evento.target.checked)}
          />
          Aberto para adesões novas
        </label>
      )}
    </CascaDialogo>
  );
}

function DialogoRegra({
  beneficio,
  unidades,
  aoFechar,
  aoConcluir,
}: {
  beneficio: Beneficio;
  unidades: UnidadeOpcao[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [vinculos, setVinculos] = useState<string[]>(
    beneficio.regra?.criterio.tipos_vinculo ?? []
  );
  const [unidadesSel, setUnidadesSel] = useState<number[]>(
    beneficio.regra?.criterio.unidades ?? []
  );
  const [valorPadrao, setValorPadrao] = useState(
    beneficio.regra?.valor_padrao?.toString() ?? ""
  );
  const [descontoPadrao, setDescontoPadrao] = useState(
    beneficio.regra?.desconto_padrao?.toString() ?? ""
  );
  const [inicioVigencia, setInicioVigencia] = useState(hojeLocal());
  const [enviando, erro, executar] = useEnvio(aoConcluir);

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor)
      ? lista.filter((item) => item !== valor)
      : [...lista, valor];
  }

  return (
    <CascaDialogo
      titulo={`Nova versão de regra — ${beneficio.nome}`}
      sub="A versão nova encerra a vigente. Adesões existentes não mudam; a regra vale para adesões novas."
      textoEnviar="Publicar versão"
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        executar(() =>
          requisitar(`/api/beneficios/${beneficio.id}/regras`, "POST", {
            criterio: {
              tipos_vinculo: vinculos.length > 0 ? vinculos : undefined,
              unidades: unidadesSel.length > 0 ? unidadesSel : undefined,
            },
            valor_padrao: numeroOuIndefinido(valorPadrao) ?? null,
            desconto_padrao: numeroOuIndefinido(descontoPadrao) ?? null,
            inicio_vigencia: inicioVigencia,
          })
        );
      }}
    >
      <span className={estilos.rotuloCampo}>
        Tipos de vínculo elegíveis (nenhum marcado = todos)
      </span>
      <div className={estilos.grupoOpcoes}>
        {TIPOS_VINCULO.map((item) => (
          <label key={item} className={estilos.opcaoCaixa}>
            <input
              type="checkbox"
              checked={vinculos.includes(item)}
              onChange={() => setVinculos(alternar(vinculos, item))}
            />
            {ROTULOS_VINCULO[item]}
          </label>
        ))}
      </div>
      <span className={estilos.rotuloCampo}>
        Unidades elegíveis (nenhuma marcada = todas)
      </span>
      <div className={estilos.grupoOpcoes}>
        {unidades.map((item) => (
          <label key={item.id} className={estilos.opcaoCaixa}>
            <input
              type="checkbox"
              checked={unidadesSel.includes(item.id)}
              onChange={() => setUnidadesSel(alternar(unidadesSel, item.id))}
            />
            {item.unidade ?? `Unidade #${item.id}`}
          </label>
        ))}
      </div>
      <div className={estilos.linhaCampos}>
        <div>
          <label className={estilos.rotuloCampo} htmlFor="regra-valor">
            Valor padrão (R$)
          </label>
          <input
            className={estilos.campo}
            id="regra-valor"
            type="number"
            min={0}
            step="0.01"
            value={valorPadrao}
            onChange={(evento) => setValorPadrao(evento.target.value)}
          />
        </div>
        <div>
          <label className={estilos.rotuloCampo} htmlFor="regra-desconto">
            Desconto padrão (R$)
          </label>
          <input
            className={estilos.campo}
            id="regra-desconto"
            type="number"
            min={0}
            step="0.01"
            value={descontoPadrao}
            onChange={(evento) => setDescontoPadrao(evento.target.value)}
          />
        </div>
      </div>
      <label className={estilos.rotuloCampo} htmlFor="regra-inicio">
        Início de vigência
      </label>
      <input
        className={estilos.campo}
        id="regra-inicio"
        type="date"
        required
        value={inicioVigencia}
        onChange={(evento) => setInicioVigencia(evento.target.value)}
      />
    </CascaDialogo>
  );
}

// ------------------------------------------------------------------ diálogo de dependente

function DialogoDependente({
  colaboradorId,
  dependente,
  aoFechar,
  aoConcluir,
}: {
  colaboradorId: number;
  dependente?: Dependente;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [nome, setNome] = useState(dependente?.nome ?? "");
  const [nascimento, setNascimento] = useState(dependente?.nascimento ?? "");
  const [parentesco, setParentesco] = useState<string>(
    dependente?.parentesco ?? "filho"
  );
  const [cpf, setCpf] = useState(dependente?.cpf ?? "");
  const [deduzIrrf, setDeduzIrrf] = useState(dependente?.deduz_irrf ?? false);
  const [enviando, erro, executar] = useEnvio(aoConcluir);
  const edicao = dependente !== undefined;
  return (
    <CascaDialogo
      titulo={edicao ? `Editar dependente — ${dependente.nome}` : "Novo dependente"}
      sub="Cadastro mínimo (dado de terceiro): só o necessário para vincular a benefício."
      textoEnviar={edicao ? "Salvar" : "Cadastrar"}
      enviando={enviando}
      erro={erro}
      aoFechar={aoFechar}
      aoEnviar={(evento) => {
        evento.preventDefault();
        const cpfLimpo = cpf.replace(/\D/g, "");
        executar(() =>
          edicao
            ? requisitar(`/api/beneficios/dependentes/${dependente.id}`, "PATCH", {
                nome,
                nascimento,
                parentesco,
                cpf: cpfLimpo === "" ? null : cpfLimpo,
                deduz_irrf: deduzIrrf,
              })
            : requisitar("/api/beneficios/dependentes", "POST", {
                colaborador_id: colaboradorId,
                nome,
                nascimento,
                parentesco,
                cpf: cpfLimpo === "" ? undefined : cpfLimpo,
                deduz_irrf: deduzIrrf,
              })
        );
      }}
    >
      <label className={estilos.rotuloCampo} htmlFor="dependente-nome">
        Nome completo
      </label>
      <input
        className={estilos.campo}
        id="dependente-nome"
        required
        maxLength={200}
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
      />
      <div className={estilos.linhaCampos}>
        <div>
          <label className={estilos.rotuloCampo} htmlFor="dependente-nascimento">
            Nascimento
          </label>
          <input
            className={estilos.campo}
            id="dependente-nascimento"
            type="date"
            required
            value={nascimento}
            onChange={(evento) => setNascimento(evento.target.value)}
          />
        </div>
        <div>
          <label className={estilos.rotuloCampo} htmlFor="dependente-parentesco">
            Parentesco
          </label>
          <select
            className={estilos.campo}
            id="dependente-parentesco"
            value={parentesco}
            onChange={(evento) => setParentesco(evento.target.value)}
          >
            {PARENTESCOS.map((item) => (
              <option key={item} value={item}>
                {ROTULOS_PARENTESCO[item]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className={estilos.rotuloCampo} htmlFor="dependente-cpf">
        CPF (opcional — menores podem não ter)
      </label>
      <input
        className={estilos.campo}
        id="dependente-cpf"
        maxLength={14}
        value={cpf}
        onChange={(evento) => setCpf(evento.target.value)}
      />
      <label className={estilos.rotuloCampo} htmlFor="dependente-irrf">
        <input
          id="dependente-irrf"
          type="checkbox"
          checked={deduzIrrf}
          onChange={(evento) => setDeduzIrrf(evento.target.checked)}
        />{" "}
        Abate no IRRF — dependente elegível (Lei 9.250: filho até 21, ou 24 se
        universitário; ou cônjuge). Conferência do DP; o autoatendimento não marca.
      </label>
    </CascaDialogo>
  );
}

// ------------------------------------------------------------------ painel

export function PainelBeneficios() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [abaPrincipal, setAbaPrincipal] = useState<AbaPrincipal>("meus");
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [versao, setVersao] = useState(0);

  // Dependentes geridos pelo DP (por colaborador escolhido).
  const [colaboradorDependentes, setColaboradorDependentes] = useState("");
  const [dependentesDp, setDependentesDp] = useState<Dependente[] | null>(null);

  // Histórico de versões de regra aberto por benefício (catálogo).
  const [versoesAbertas, setVersoesAbertas] = useState<
    Record<number, RegraVersao[] | undefined>
  >({});

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/beneficios");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(
            (dados as { erro?: string }).erro ??
              "Não foi possível carregar os benefícios."
          );
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

  function recarregar() {
    setDialogo(null);
    setErroAcao(null);
    setVersoesAbertas({});
    setVersao((atual) => atual + 1);
    if (colaboradorDependentes !== "") {
      void carregarDependentesDp(colaboradorDependentes);
    }
  }

  async function carregarDependentesDp(colaboradorId: string) {
    setDependentesDp(null);
    try {
      const resposta = await fetch(
        `/api/beneficios/dependentes?colaborador_id=${colaboradorId}`
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDependentesDp((dados as { dependentes: Dependente[] }).dependentes);
        setErroAcao(null);
      } else {
        setErroAcao(
          (dados as { erro?: string }).erro ??
            "Não foi possível carregar os dependentes."
        );
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    }
  }

  async function acaoDireta(url: string, metodo = "POST") {
    setErroAcao(null);
    const resultado = await requisitar(url, metodo);
    if (resultado.ok) {
      recarregar();
    } else {
      setErroAcao(resultado.erro ?? null);
    }
  }

  async function alternarVersoes(beneficioId: number) {
    if (versoesAbertas[beneficioId]) {
      setVersoesAbertas((atual) => ({ ...atual, [beneficioId]: undefined }));
      return;
    }
    try {
      const resposta = await fetch(`/api/beneficios/${beneficioId}/regras`);
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setVersoesAbertas((atual) => ({
          ...atual,
          [beneficioId]: (dados as { versoes: RegraVersao[] }).versoes,
        }));
      } else {
        setErroAcao(
          (dados as { erro?: string }).erro ??
            "Não foi possível carregar as versões."
        );
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    }
  }

  function badgeDemanda(status: StatusDemanda) {
    return (
      <span
        className={`${estilos.badge} ${estilos[BADGE_STATUS_DEMANDA[status]]}`}
      >
        {ROTULOS_STATUS_DEMANDA[status]}
      </span>
    );
  }

  function badgeAdesao(adesao: Adesao) {
    return (
      <span
        className={`${estilos.badge} ${estilos[BADGE_STATUS_ADESAO[adesao.status]]}`}
      >
        {ROTULOS_STATUS_ADESAO[adesao.status]}
      </span>
    );
  }

  function cartaoSolicitacao(item: Solicitacao, comAcoesDp: boolean) {
    const adesaoAlvo =
      item.adesao_id !== null
        ? (visao?.gestao?.adesoes.find((adesao) => adesao.id === item.adesao_id) ??
          null)
        : null;
    return (
      <div key={item.demanda_id} className={estilos.cartao}>
        <div className={estilos.topo}>
          <span className={estilos.numero}>
            {formatarNumeroDemanda(item.numero)}
          </span>
          <span className={estilos.nome}>
            {item.beneficio_nome ?? "Benefício"}
          </span>
          {item.natureza && (
            <span className={`${estilos.badge} ${estilos.badgeNeutro}`}>
              {ROTULOS_NATUREZA[item.natureza]}
            </span>
          )}
          {badgeDemanda(item.status)}
        </div>
        <div className={estilos.meta}>
          {item.solicitante_nome} · prazo {formatarData(item.prazo)}
          {item.dias_ate_prazo < 0 &&
            item.status !== "concluida" &&
            item.status !== "recusada" &&
            " · atrasada"}
        </div>
        <div className={estilos.descricao}>{item.descricao}</div>
        {comAcoesDp && (
          <div className={estilos.acoes}>
            {item.natureza === "adesao" && (
              <button
                className={estilos.botaoPrimario}
                type="button"
                onClick={() => setDialogo({ tipo: "conceder", solicitacao: item })}
              >
                Conceder benefício
              </button>
            )}
            {item.natureza === "cancelamento" && adesaoAlvo && (
              <button
                className={estilos.botaoPrimario}
                type="button"
                onClick={() =>
                  setDialogo({
                    tipo: "cancelar_adesao",
                    adesao: adesaoAlvo,
                    solicitacao: item,
                  })
                }
              >
                Confirmar cancelamento
              </button>
            )}
            {item.natureza === "cancelamento" && !adesaoAlvo && (
              <span className={estilos.meta}>
                Sem adesão vigente correspondente — negue com o motivo.
              </span>
            )}
            {item.natureza === "revisao" && (
              <button
                className={estilos.botaoPrimario}
                type="button"
                onClick={() =>
                  setDialogo({
                    tipo: "decidir_revisao",
                    solicitacao: item,
                    adesao: adesaoAlvo,
                  })
                }
              >
                Decidir revisão
              </button>
            )}
            <button
              className={estilos.botaoSecundario}
              type="button"
              onClick={() => setDialogo({ tipo: "negar", solicitacao: item })}
            >
              Negar
            </button>
          </div>
        )}
      </div>
    );
  }

  function cartaoAdesao(adesao: Adesao, ehTitular: boolean) {
    const podeGerir = visao?.pode.gerir ?? false;
    return (
      <div key={adesao.id} className={estilos.cartao}>
        <div className={estilos.topo}>
          <span className={estilos.nome}>{adesao.beneficio_nome}</span>
          <span className={`${estilos.badge} ${estilos.badgeNeutro}`}>
            {ROTULOS_CATEGORIA[adesao.categoria]}
          </span>
          {badgeAdesao(adesao)}
        </div>
        <div className={estilos.meta}>
          {!ehTitular &&
            `${adesao.colaborador_nome} (${adesao.colaborador_matricula}) · `}
          início {formatarData(adesao.inicio)}
          {adesao.fim && ` · fim ${formatarData(adesao.fim)}`}
          {` · valor ${formatarMoeda(adesao.valor)} · desconto ${formatarMoeda(adesao.desconto)}`}
        </div>
        <div className={estilos.acoes}>
          {ehTitular && adesao.fim === null && (
            <>
              {/* H3 — o pedido que o dono cobrou: "mudou de casa, a passagem
                  subiu". Só sobre adesão vigente. */}
              <button
                className={estilos.botaoSecundario}
                type="button"
                onClick={() => setDialogo({ tipo: "revisao_titular", adesao })}
              >
                Pedir revisão de valor
              </button>
              <button
                className={estilos.botaoSecundario}
                type="button"
                onClick={() =>
                  setDialogo({ tipo: "cancelamento_titular", adesao })
                }
              >
                Solicitar cancelamento
              </button>
            </>
          )}
          {!ehTitular && podeGerir && adesao.fim === null && (
            <>
              {adesao.status === "ativa" && (
                <button
                  className={estilos.botaoSecundario}
                  type="button"
                  onClick={() =>
                    acaoDireta(`/api/beneficios/adesoes/${adesao.id}/suspender`)
                  }
                >
                  Suspender
                </button>
              )}
              {adesao.status === "suspensa" && (
                <button
                  className={estilos.botaoSecundario}
                  type="button"
                  onClick={() =>
                    acaoDireta(`/api/beneficios/adesoes/${adesao.id}/reativar`)
                  }
                >
                  Reativar
                </button>
              )}
              <button
                className={estilos.ligacaoLeve}
                type="button"
                onClick={() => setDialogo({ tipo: "cancelar_adesao", adesao })}
              >
                Cancelar adesão
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const mostraGerir = Boolean(visao && (visao.pode.gerir || visao.pode.ver));
  const mostraCatalogo = Boolean(visao?.pode.administrar);
  const mostraMeus = Boolean(visao?.pode.solicitar);

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Benefícios</h1>
          {abaPrincipal === "catalogo" && mostraCatalogo && (
            <button
              className={estilos.botaoPrimario}
              type="button"
              onClick={() => setDialogo({ tipo: "beneficio" })}
            >
              + Novo benefício
            </button>
          )}
          {abaPrincipal === "gerir" && visao?.pode.gerir && (
            <button
              className={estilos.botaoPrimario}
              type="button"
              onClick={() => setDialogo({ tipo: "conceder" })}
            >
              + Conceder benefício
            </button>
          )}
        </div>
        <p className={estilos.subtitulo}>
          Catálogo, regras de referência e adesões — conceder é ato do DP, com o
          valor de cada pessoa; o pedido de cancelamento continua sendo do
          titular.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {erroAcao && <p className={estilos.erro}>{erroAcao}</p>}
        {carregando && !visao && <p className={estilos.vazio}>Carregando…</p>}

        {visao && (
          <>
            {(mostraGerir || mostraCatalogo) && (
              <div className={estilos.abasPrincipais}>
                {mostraMeus && (
                  <button
                    className={`${estilos.aba} ${abaPrincipal === "meus" ? estilos.abaAtiva : ""}`}
                    type="button"
                    onClick={() => setAbaPrincipal("meus")}
                  >
                    Meus benefícios
                  </button>
                )}
                {mostraGerir && (
                  <button
                    className={`${estilos.aba} ${abaPrincipal === "gerir" ? estilos.abaAtiva : ""}`}
                    type="button"
                    onClick={() => setAbaPrincipal("gerir")}
                  >
                    Gerir adesões
                    {visao.gestao &&
                    visao.gestao.solicitacoes_pendentes.length > 0
                      ? ` (${visao.gestao.solicitacoes_pendentes.length})`
                      : ""}
                  </button>
                )}
                {mostraCatalogo && (
                  <button
                    className={`${estilos.aba} ${abaPrincipal === "catalogo" ? estilos.abaAtiva : ""}`}
                    type="button"
                    onClick={() => setAbaPrincipal("catalogo")}
                  >
                    Catálogo
                  </button>
                )}
              </div>
            )}

            {/* ---------------------------------------------- meus benefícios */}
            {abaPrincipal === "meus" && mostraMeus && (
              <>
                {!visao.perfil && (
                  <p className={estilos.aviso}>
                    Sua conta não está ligada a uma ficha de colaborador —
                    benefício é concedido a um vínculo, e esta conta não tem um.
                  </p>
                )}
                {visao.perfil && (
                  <p className={estilos.aviso}>
                    {visao.perfil.nome_completo} · matrícula{" "}
                    {visao.perfil.matricula} · {visao.perfil.tipo_vinculo}
                    {visao.perfil.unidade ? ` · ${visao.perfil.unidade}` : ""}
                  </p>
                )}

                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>
                    Benefícios da empresa
                  </h2>
                  <p className={estilos.dica}>
                    Quem concede é o DP, com o valor de cada pessoa — não há
                    mais pedido de adesão. Falta algum? Procure o DP.
                  </p>
                  {visao.catalogo.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhum benefício ativo no catálogo.
                    </p>
                  ) : (
                    <div className={estilos.gradeCatalogo}>
                      {visao.catalogo.map((item) => (
                        <div key={item.beneficio_id} className={estilos.cartao}>
                          <div className={estilos.topo}>
                            <span className={estilos.nome}>{item.nome}</span>
                            <span
                              className={`${estilos.badge} ${estilos.badgeNeutro}`}
                            >
                              {item.categoria_rotulo}
                            </span>
                          </div>
                          <div className={estilos.meta}>
                            {/* Valor de TABELA, não o desta pessoa: o dela está
                                na adesão, em "Minhas adesões". */}
                            tabela: valor {formatarMoeda(item.valor_padrao)} ·
                            desconto {formatarMoeda(item.desconto_padrao)}
                          </div>
                          <div className={estilos.acoes}>
                            {item.ja_aderido ? (
                              <span
                                className={`${estilos.badge} ${estilos.badgeSuccess}`}
                              >
                                Você tem
                              </span>
                            ) : item.solicitacao_pendente ? (
                              <span
                                className={`${estilos.badge} ${estilos.badgeWarning}`}
                              >
                                Pedido antigo na fila do DP
                              </span>
                            ) : (
                              <span className={estilos.meta}>
                                Concedido pelo DP
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>Minhas adesões</h2>
                  {visao.minhas_adesoes.length === 0 ? (
                    <p className={estilos.vazio}>Nenhuma adesão registrada.</p>
                  ) : (
                    visao.minhas_adesoes.map((adesao) =>
                      cartaoAdesao(adesao, true)
                    )
                  )}
                </section>

                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>Meus pedidos</h2>
                  {visao.minhas_solicitacoes.length === 0 ? (
                    <p className={estilos.vazio}>Nenhum pedido.</p>
                  ) : (
                    visao.minhas_solicitacoes.map((item) =>
                      cartaoSolicitacao(item, false)
                    )
                  )}
                </section>

                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>Meus dependentes</h2>
                  {visao.meus_dependentes.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhum dependente cadastrado — o cadastro é feito pelo DP.
                    </p>
                  ) : (
                    visao.meus_dependentes.map((dependente) => (
                      <div key={dependente.id} className={estilos.cartao}>
                        <div className={estilos.topo}>
                          <span className={estilos.nome}>{dependente.nome}</span>
                          <span
                            className={`${estilos.badge} ${estilos.badgeNeutro}`}
                          >
                            {ROTULOS_PARENTESCO[dependente.parentesco]}
                          </span>
                        </div>
                        <div className={estilos.meta}>
                          nascimento {formatarData(dependente.nascimento)}
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </>
            )}

            {/* ---------------------------------------------- gerir (DP) */}
            {abaPrincipal === "gerir" && visao.gestao && (
              <>
                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>Pedidos pendentes</h2>
                  <p className={estilos.dica}>
                    Cancelamentos pedidos pelo titular e as adesões que ficaram
                    na fila do tempo em que se pedia adesão — conceda ou negue;
                    pedido novo de adesão não entra mais.
                  </p>
                  {visao.gestao.solicitacoes_pendentes.length === 0 ? (
                    <p className={estilos.vazio}>Nada pendente.</p>
                  ) : (
                    visao.gestao.solicitacoes_pendentes.map((item) =>
                      cartaoSolicitacao(item, visao.pode.gerir)
                    )
                  )}
                </section>

                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>Adesões vigentes</h2>
                  {visao.gestao.adesoes.length === 0 ? (
                    <p className={estilos.vazio}>Nenhuma adesão vigente.</p>
                  ) : (
                    visao.gestao.adesoes.map((adesao) =>
                      cartaoAdesao(adesao, false)
                    )
                  )}
                </section>

                {visao.pode.gerir && (
                  <section className={estilos.area}>
                    <h2 className={estilos.tituloArea}>
                      Dependentes por colaborador
                    </h2>
                    <div className={estilos.filtros}>
                      Colaborador:
                      <select
                        className={estilos.seletor}
                        value={colaboradorDependentes}
                        onChange={(evento) => {
                          setColaboradorDependentes(evento.target.value);
                          setDependentesDp(null);
                          if (evento.target.value !== "") {
                            void carregarDependentesDp(evento.target.value);
                          }
                        }}
                      >
                        <option value="">Selecione…</option>
                        {visao.gestao.colaboradores.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome_completo} ({item.matricula})
                          </option>
                        ))}
                      </select>
                      {colaboradorDependentes !== "" && (
                        <button
                          className={estilos.botaoSecundario}
                          type="button"
                          onClick={() =>
                            setDialogo({
                              tipo: "dependente",
                              colaboradorId: Number(colaboradorDependentes),
                            })
                          }
                        >
                          + Novo dependente
                        </button>
                      )}
                    </div>
                    {colaboradorDependentes !== "" && dependentesDp && (
                      <>
                        {dependentesDp.length === 0 ? (
                          <p className={estilos.vazio}>
                            Nenhum dependente cadastrado.
                          </p>
                        ) : (
                          dependentesDp.map((dependente) => (
                            <div key={dependente.id} className={estilos.cartao}>
                              <div className={estilos.topo}>
                                <span className={estilos.nome}>
                                  {dependente.nome}
                                </span>
                                <span
                                  className={`${estilos.badge} ${estilos.badgeNeutro}`}
                                >
                                  {ROTULOS_PARENTESCO[dependente.parentesco]}
                                </span>
                              </div>
                              <div className={estilos.meta}>
                                nascimento {formatarData(dependente.nascimento)}
                                {dependente.cpf && ` · CPF ${dependente.cpf}`}
                              </div>
                              <div className={estilos.acoes}>
                                <button
                                  className={estilos.botaoSecundario}
                                  type="button"
                                  onClick={() =>
                                    setDialogo({
                                      tipo: "dependente",
                                      colaboradorId: dependente.colaborador_id,
                                      dependente,
                                    })
                                  }
                                >
                                  Editar
                                </button>
                                <button
                                  className={estilos.ligacaoLeve}
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Remover o dependente ${dependente.nome}?`
                                      )
                                    ) {
                                      void acaoDireta(
                                        `/api/beneficios/dependentes/${dependente.id}`,
                                        "DELETE"
                                      );
                                    }
                                  }}
                                >
                                  Remover
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}

            {/* ---------------------------------------------- catálogo (administrar) */}
            {abaPrincipal === "catalogo" && visao.administracao && (
              <section className={estilos.area}>
                <h2 className={estilos.tituloArea}>Benefícios cadastrados</h2>
                {visao.administracao.beneficios.length === 0 ? (
                  <p className={estilos.vazio}>Nenhum benefício cadastrado.</p>
                ) : (
                  visao.administracao.beneficios.map((beneficio) => {
                    const nomesUnidades = new Map(
                      visao.administracao?.unidades.map((item) => [
                        item.id,
                        item.unidade ?? `#${item.id}`,
                      ]) ?? []
                    );
                    const versoes = versoesAbertas[beneficio.id];
                    return (
                      <div key={beneficio.id} className={estilos.cartao}>
                        <div className={estilos.topo}>
                          <span className={estilos.nome}>{beneficio.nome}</span>
                          <span className={estilos.numero}>
                            {beneficio.chave}
                          </span>
                          <span
                            className={`${estilos.badge} ${estilos.badgeNeutro}`}
                          >
                            {ROTULOS_CATEGORIA[beneficio.categoria]}
                          </span>
                          <span
                            className={`${estilos.badge} ${beneficio.ativo ? estilos.badgeSuccess : estilos.badgeDanger}`}
                          >
                            {beneficio.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <div className={estilos.meta}>
                          {beneficio.regra
                            ? `Regra vigente desde ${formatarData(beneficio.regra.inicio_vigencia)}: ${descreverCriterio(beneficio.regra.criterio, ROTULOS_VINCULO, nomesUnidades)} · valor ${formatarMoeda(beneficio.regra.valor_padrao)} · desconto ${formatarMoeda(beneficio.regra.desconto_padrao)}`
                            : "Sem regra de elegibilidade vigente — ninguém consegue aderir."}
                        </div>
                        <div className={estilos.acoes}>
                          <button
                            className={estilos.botaoSecundario}
                            type="button"
                            onClick={() =>
                              setDialogo({ tipo: "beneficio", beneficio })
                            }
                          >
                            Editar
                          </button>
                          <button
                            className={estilos.botaoSecundario}
                            type="button"
                            onClick={() =>
                              setDialogo({ tipo: "regra", beneficio })
                            }
                          >
                            Nova versão de regra
                          </button>
                          <button
                            className={estilos.ligacaoLeve}
                            type="button"
                            onClick={() => void alternarVersoes(beneficio.id)}
                          >
                            {versoes ? "Ocultar versões" : "Ver versões"}
                          </button>
                        </div>
                        {versoes && (
                          <ul className={estilos.listaVersoes}>
                            {versoes.map((item) => (
                              <li key={item.id}>
                                {formatarData(item.inicio_vigencia)}
                                {item.fim_vigencia
                                  ? ` a ${formatarData(item.fim_vigencia)}`
                                  : " em diante"}{" "}
                                ({item.status}) —{" "}
                                {descreverCriterio(
                                  item.criterio,
                                  ROTULOS_VINCULO,
                                  nomesUnidades
                                )}{" "}
                                · valor {formatarMoeda(item.valor_padrao)} ·
                                desconto {formatarMoeda(item.desconto_padrao)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* ---------------------------------------------- diálogos */}
      {dialogo?.tipo === "cancelamento_titular" && (
        <DialogoCancelamentoTitular
          adesao={dialogo.adesao}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "revisao_titular" && (
        <DialogoRevisaoTitular
          adesao={dialogo.adesao}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "decidir_revisao" && (
        <DialogoDecidirRevisao
          solicitacao={dialogo.solicitacao}
          adesao={dialogo.adesao}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "conceder" && visao && (
        <DialogoConceder
          solicitacao={dialogo.solicitacao}
          visao={visao}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "negar" && (
        <DialogoNegar
          solicitacao={dialogo.solicitacao}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "cancelar_adesao" && (
        <DialogoCancelarAdesao
          adesao={dialogo.adesao}
          solicitacao={dialogo.solicitacao}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "beneficio" && (
        <DialogoBeneficio
          beneficio={dialogo.beneficio}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "regra" && visao?.administracao && (
        <DialogoRegra
          beneficio={dialogo.beneficio}
          unidades={visao.administracao.unidades}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
      {dialogo?.tipo === "dependente" && (
        <DialogoDependente
          colaboradorId={dialogo.colaboradorId}
          dependente={dialogo.dependente}
          aoFechar={() => setDialogo(null)}
          aoConcluir={recarregar}
        />
      )}
    </div>
  );
}
