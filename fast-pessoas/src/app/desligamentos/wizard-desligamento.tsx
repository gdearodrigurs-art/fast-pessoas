"use client";

import { useState } from "react";
import {
  INICIATIVAS,
  Iniciativa,
  MODALIDADES_AVISO,
  ModalidadeAviso,
  RESULTADOS_ESTABILIDADE,
  ResultadoEstabilidade,
  ROTULOS_INICIATIVA,
  ROTULOS_MODALIDADE_AVISO,
  ROTULOS_RESULTADO_ESTABILIDADE,
  ROTULOS_TIPO_ESTABILIDADE,
  TIPOS_DECLARACAO,
  TipoDeclaracao,
} from "@/dominios/desligamento/esquemas";
import comum from "./comum.module.css";
import { formatarData } from "./formato";
import {
  ColaboradorElegivel,
  PreviaEstabilidades,
  TipoDesligamento,
} from "./tipos";

const PASSOS = ["Colaborador", "Tipo e datas", "Estabilidades", "Confirmação"];

interface Declaracao {
  resultado: ResultadoEstabilidade;
  justificativa: string;
}

const DECLARACAO_INICIAL: Record<TipoDeclaracao, Declaracao> = {
  gestante: { resultado: "livre", justificativa: "" },
  cipeiro: { resultado: "livre", justificativa: "" },
  pre_aposentadoria: { resultado: "livre", justificativa: "" },
};

export function WizardDesligamento({
  tipos,
  colaboradores,
  aoCriar,
  aoFechar,
}: {
  tipos: TipoDesligamento[];
  colaboradores: ColaboradorElegivel[];
  aoCriar: () => void;
  aoFechar: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [colaboradorId, setColaboradorId] = useState<number | "">("");
  const [tipoVersaoId, setTipoVersaoId] = useState<number | "">("");
  const [iniciativa, setIniciativa] = useState<Iniciativa>("empregador");
  const [modalidade, setModalidade] = useState<ModalidadeAviso>("trabalhado");
  const [dataComunicacao, setDataComunicacao] = useState("");
  const [dataTermino, setDataTermino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [declaracoes, setDeclaracoes] =
    useState<Record<TipoDeclaracao, Declaracao>>(DECLARACAO_INICIAL);
  const [previa, setPrevia] = useState<PreviaEstabilidades | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const tipoSelecionado = tipos.find((tipo) => tipo.id === tipoVersaoId);
  const colaboradorSelecionado = colaboradores.find(
    (colaborador) => colaborador.id === colaboradorId
  );

  // Prévia automática do gate (acidentário), disparada ao entrar no passo de
  // estabilidades — sem efeito: a busca nasce da ação do usuário.
  async function carregarPrevia(colaborador: number) {
    try {
      const resposta = await fetch(
        `/api/desligamentos/estabilidades?colaborador_id=${colaborador}`
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setPrevia(dados as PreviaEstabilidades);
      } else {
        setErroPrevia(
          dados.erro ?? "Não foi possível verificar as estabilidades."
        );
      }
    } catch {
      setErroPrevia("Falha de conexão. Tente novamente.");
    }
  }

  function avancarPasso() {
    const proximo = passo + 1;
    setPasso(proximo);
    if (proximo === 2 && previa === null && colaboradorId !== "") {
      void carregarPrevia(colaboradorId);
    }
  }

  const temBloqueio =
    previa?.acidentario.resultado === "bloqueado" ||
    TIPOS_DECLARACAO.some(
      (tipo) => declaracoes[tipo].resultado === "bloqueado"
    );

  function podeAvancar(): boolean {
    if (passo === 0) return colaboradorId !== "";
    if (passo === 1) {
      return (
        tipoVersaoId !== "" &&
        dataComunicacao !== "" &&
        dataTermino !== "" &&
        dataTermino >= dataComunicacao
      );
    }
    if (passo === 2) {
      if (previa === null) return false;
      const declaradasOk = TIPOS_DECLARACAO.every(
        (tipo) =>
          declaracoes[tipo].resultado === "livre" ||
          declaracoes[tipo].justificativa.trim() !== ""
      );
      return declaradasOk && (!temBloqueio || override.trim() !== "");
    }
    return true;
  }

  function atualizarDeclaracao(
    tipo: TipoDeclaracao,
    campos: Partial<Declaracao>
  ) {
    setDeclaracoes((atuais) => ({
      ...atuais,
      [tipo]: { ...atuais[tipo], ...campos },
    }));
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const corpo: Record<string, unknown> = {
        colaborador_id: colaboradorId,
        tipo_versao_id: tipoVersaoId,
        iniciativa,
        modalidade_aviso: modalidade,
        data_comunicacao: dataComunicacao,
        data_projetada_termino: dataTermino,
        declaracoes: Object.fromEntries(
          TIPOS_DECLARACAO.map((tipo) => [
            tipo,
            {
              resultado: declaracoes[tipo].resultado,
              ...(declaracoes[tipo].justificativa.trim()
                ? { justificativa: declaracoes[tipo].justificativa.trim() }
                : {}),
            },
          ])
        ),
      };
      if (motivo.trim()) corpo.motivo = motivo.trim();
      if (override.trim()) corpo.override_justificativa = override.trim();
      const resposta = await fetch("/api/desligamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        aoCriar();
      } else if (dados.campo === "override_justificativa") {
        setPasso(2);
        setErro(dados.erro ?? "Estabilidade bloqueada exige override.");
      } else {
        setErro(dados.erro ?? "Não foi possível iniciar o processo.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comum.fundoDialogo}>
      <div className={comum.dialogo} role="dialog" aria-modal="true">
        <h3>Iniciar desligamento</h3>
        <p className={comum.subDialogo}>
          A verificação de estabilidades é o gate de abertura: bloqueio só se
          supera com justificativa auditada.
        </p>

        <div className={comum.passos}>
          {PASSOS.map((nome, indice) => (
            <span
              key={nome}
              className={`${comum.passo} ${indice === passo ? comum.passoAtivo : ""}`}
            >
              {indice + 1}. {nome}
            </span>
          ))}
        </div>

        {passo === 0 && (
          <>
            <label className={comum.rotuloCampo} htmlFor="wizard-colaborador">
              Colaborador (ativo, sem processo aberto)
            </label>
            <select
              className={comum.campo}
              id="wizard-colaborador"
              value={colaboradorId}
              onChange={(e) => {
                setColaboradorId(e.target.value ? Number(e.target.value) : "");
                // Colaborador novo invalida a prévia de estabilidades.
                setPrevia(null);
                setErroPrevia(null);
              }}
            >
              <option value="">Selecione…</option>
              {colaboradores.map((colaborador) => (
                <option key={colaborador.id} value={colaborador.id}>
                  {colaborador.nome_completo} (mat. {colaborador.matricula})
                </option>
              ))}
            </select>
            {colaboradores.length === 0 && (
              <p className={comum.dica}>
                Nenhum colaborador ativo sem processo aberto.
              </p>
            )}
          </>
        )}

        {passo === 1 && (
          <>
            <label className={comum.rotuloCampo} htmlFor="wizard-tipo">
              Tipo de desligamento (versão vigente)
            </label>
            <select
              className={comum.campo}
              id="wizard-tipo"
              value={tipoVersaoId}
              onChange={(e) =>
                setTipoVersaoId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">Selecione…</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nome}
                </option>
              ))}
            </select>
            {tipoSelecionado && (
              <p className={comum.dica}>
                {tipoSelecionado.exige_aviso
                  ? "Exige aviso prévio"
                  : "Sem aviso prévio"}
                {tipoSelecionado.admite_indenizado ? " · admite indenizado" : ""}
                {tipoSelecionado.direito_manutencao_plano
                  ? " · direito de manutenção do plano (arts. 30/31)"
                  : ""}
                {tipoSelecionado.elegivel_entrevista
                  ? " · entrevista de desligamento será oferecida"
                  : " · tipo fora do indicador de entrevistas"}
              </p>
            )}

            <label className={comum.rotuloCampo} htmlFor="wizard-iniciativa">
              Iniciativa
            </label>
            <select
              className={comum.campo}
              id="wizard-iniciativa"
              value={iniciativa}
              onChange={(e) => setIniciativa(e.target.value as Iniciativa)}
            >
              {INICIATIVAS.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULOS_INICIATIVA[valor]}
                </option>
              ))}
            </select>

            <label className={comum.rotuloCampo} htmlFor="wizard-modalidade">
              Modalidade do aviso
            </label>
            <select
              className={comum.campo}
              id="wizard-modalidade"
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value as ModalidadeAviso)}
            >
              {MODALIDADES_AVISO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULOS_MODALIDADE_AVISO[valor]}
                </option>
              ))}
            </select>

            <label className={comum.rotuloCampo} htmlFor="wizard-comunicacao">
              Data da comunicação
            </label>
            <input
              className={comum.campo}
              id="wizard-comunicacao"
              type="date"
              value={dataComunicacao}
              onChange={(e) => setDataComunicacao(e.target.value)}
            />

            <label className={comum.rotuloCampo} htmlFor="wizard-termino">
              Término projetado
            </label>
            <input
              className={comum.campo}
              id="wizard-termino"
              type="date"
              value={dataTermino}
              onChange={(e) => setDataTermino(e.target.value)}
            />
            {dataComunicacao && dataTermino && dataTermino < dataComunicacao && (
              <p className={comum.erroAcao}>
                O término não pode ser anterior à comunicação.
              </p>
            )}
            <p className={comum.dica}>
              Prazo do art. 477: 10 dias corridos após o término projetado.
            </p>

            <label className={comum.rotuloCampo} htmlFor="wizard-motivo">
              Motivo (restrito — visível só com permissão própria)
            </label>
            <textarea
              className={`${comum.campo} ${comum.campoTexto}`}
              id="wizard-motivo"
              maxLength={4000}
              placeholder="opcional"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </>
        )}

        {passo === 2 && (
          <>
            <div className={comum.blocoEstabilidade}>
              <div className={comum.tituloEstabilidade}>
                {ROTULOS_TIPO_ESTABILIDADE.acidentario}
                {previa && (
                  <span
                    className={`${comum.badge} ${
                      previa.acidentario.resultado === "bloqueado"
                        ? comum.badgeDanger
                        : comum.badgeSuccess
                    }`}
                  >
                    {ROTULOS_RESULTADO_ESTABILIDADE[previa.acidentario.resultado]}
                  </span>
                )}
              </div>
              <p className={comum.dica}>
                {erroPrevia ??
                  previa?.acidentario.detalhe ??
                  "Verificando afastamentos acidentários…"}
              </p>
              {erroPrevia && colaboradorId !== "" && (
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => {
                    setErroPrevia(null);
                    void carregarPrevia(colaboradorId);
                  }}
                >
                  Tentar novamente
                </button>
              )}
            </div>

            {TIPOS_DECLARACAO.map((tipo) => (
              <div key={tipo} className={comum.blocoEstabilidade}>
                <div className={comum.tituloEstabilidade}>
                  {ROTULOS_TIPO_ESTABILIDADE[tipo]}
                </div>
                <p className={comum.dica}>
                  Sem dado no sistema — declaração humana obrigatória.
                </p>
                <select
                  className={comum.campo}
                  aria-label={`Resultado — ${ROTULOS_TIPO_ESTABILIDADE[tipo]}`}
                  value={declaracoes[tipo].resultado}
                  onChange={(e) =>
                    atualizarDeclaracao(tipo, {
                      resultado: e.target.value as ResultadoEstabilidade,
                    })
                  }
                >
                  {RESULTADOS_ESTABILIDADE.map((resultado) => (
                    <option key={resultado} value={resultado}>
                      {ROTULOS_RESULTADO_ESTABILIDADE[resultado]}
                    </option>
                  ))}
                </select>
                {declaracoes[tipo].resultado !== "livre" && (
                  <input
                    className={comum.campo}
                    style={{ marginTop: 8 }}
                    type="text"
                    maxLength={2000}
                    placeholder="Justificativa da declaração (obrigatória)"
                    value={declaracoes[tipo].justificativa}
                    onChange={(e) =>
                      atualizarDeclaracao(tipo, {
                        justificativa: e.target.value,
                      })
                    }
                  />
                )}
              </div>
            ))}

            {temBloqueio && (
              <div className={comum.avisoTrava}>
                Há estabilidade com resultado <b>bloqueado</b>. Para prosseguir
                mesmo assim, registre a justificativa de override — a decisão
                fica auditada com o seu usuário.
                <textarea
                  className={`${comum.campo} ${comum.campoTexto}`}
                  style={{ marginTop: 8 }}
                  maxLength={2000}
                  placeholder="Justificativa do override (obrigatória)"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {passo === 3 && (
          <div className={comum.resumoConfirmacao}>
            <p>
              <b>Colaborador:</b>{" "}
              {colaboradorSelecionado
                ? `${colaboradorSelecionado.nome_completo} (mat. ${colaboradorSelecionado.matricula})`
                : "—"}
              <br />
              <b>Tipo:</b> {tipoSelecionado?.nome ?? "—"}
              <br />
              <b>Iniciativa:</b> {ROTULOS_INICIATIVA[iniciativa]}
              <br />
              <b>Aviso:</b> {ROTULOS_MODALIDADE_AVISO[modalidade]}
              <br />
              <b>Comunicação:</b>{" "}
              {dataComunicacao ? formatarData(dataComunicacao) : "—"} ·{" "}
              <b>Término projetado:</b>{" "}
              {dataTermino ? formatarData(dataTermino) : "—"}
              <br />
              <b>Estabilidades:</b>{" "}
              {previa
                ? `acidentário ${ROTULOS_RESULTADO_ESTABILIDADE[previa.acidentario.resultado].toLowerCase()}`
                : "—"}
              {TIPOS_DECLARACAO.map(
                (tipo) =>
                  `; ${ROTULOS_TIPO_ESTABILIDADE[tipo].split(" (")[0].toLowerCase()} ${ROTULOS_RESULTADO_ESTABILIDADE[declaracoes[tipo].resultado].toLowerCase()}`
              ).join("")}
              {temBloqueio ? " (com override justificado)" : ""}
              <br />
              <b>Entrevista:</b>{" "}
              {tipoSelecionado?.elegivel_entrevista
                ? "será oferecida na abertura"
                : "tipo não elegível"}
            </p>
            <p className={comum.dica}>
              Ao confirmar, o processo nasce no estado &quot;Iniciado&quot; e o
              prazo do art. 477 passa a ser monitorado.
            </p>
          </div>
        )}

        {erro && <p className={comum.erroAcao}>{erro}</p>}

        <div className={comum.acoesDialogo}>
          <button
            className={comum.botaoSecundario}
            type="button"
            onClick={aoFechar}
          >
            Cancelar
          </button>
          {passo > 0 && (
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={() => setPasso(passo - 1)}
            >
              Voltar
            </button>
          )}
          {passo < PASSOS.length - 1 ? (
            <button
              className={comum.botaoPrimario}
              type="button"
              disabled={!podeAvancar()}
              onClick={avancarPasso}
            >
              Avançar
            </button>
          ) : (
            <button
              className={comum.botaoPrimario}
              type="button"
              disabled={enviando}
              onClick={confirmar}
            >
              {enviando ? "Iniciando…" : "Iniciar processo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
