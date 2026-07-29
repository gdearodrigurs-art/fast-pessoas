"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ROTULOS_TIPO_MOVIMENTACAO,
  TIPOS_MOVIMENTACAO,
  TipoMovimentacao,
} from "@/dominios/demandas/esquemas";
import comum from "./comum.module.css";
import { OpcoesMovimentacao } from "./tipos";

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Formulário do pedido de promoção/transferência. O cargo destino carrega a
 * FAIXA VIGENTE e a tela avisa quando o valor sai dela — a justificativa de
 * exceção aparece só nesse caso (e o servidor recusa sem ela: a trava é lá, o
 * aviso aqui é conveniência).
 */
export function FormularioMovimentacao({
  aoFechar,
  aoCriar,
}: {
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [opcoes, setOpcoes] = useState<OpcoesMovimentacao | null>(null);
  const [tipo, setTipo] = useState<TipoMovimentacao>("promocao");
  const [colaboradorId, setColaboradorId] = useState("");
  const [cargoDestino, setCargoDestino] = useState("");
  const [unidadeDestino, setUnidadeDestino] = useState("");
  const [centroCusto, setCentroCusto] = useState("");
  const [salario, setSalario] = useState("");
  const [justificativaExcecao, setJustificativaExcecao] = useState("");
  const [dataPretendida, setDataPretendida] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [faixa, setFaixa] = useState<{
    faixa_min: number;
    faixa_max: number;
  } | null>(null);
  const [semFaixa, setSemFaixa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/demandas/movimentacao/opcoes");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) setOpcoes(dados as OpcoesMovimentacao);
        else setErro(dados.erro ?? "Não foi possível carregar as opções.");
      } catch {
        if (ativo) setErro("Falha de conexão. Tente novamente.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  // Faixa vigente do cargo destino — leitura registrada no servidor.
  useEffect(() => {
    if (tipo !== "promocao" || !cargoDestino) {
      setFaixa(null);
      setSemFaixa(false);
      return;
    }
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/demandas/movimentacao/faixa?cargo_id=${cargoDestino}`
        );
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo || !resposta.ok) return;
        setFaixa(dados.faixa ?? null);
        setSemFaixa(dados.faixa === null);
      } catch {
        /* sem faixa na tela não impede o envio: a trava vive no servidor */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [tipo, cargoDestino]);

  const valor = salario.trim() === "" ? null : Number(salario);
  const foraDaFaixa =
    faixa !== null &&
    valor !== null &&
    Number.isFinite(valor) &&
    (valor < faixa.faixa_min || valor > faixa.faixa_max);

  const alvo = opcoes?.alvos.find((item) => String(item.id) === colaboradorId);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const corpo: Record<string, unknown> = {
        tipo,
        colaborador_id: Number(colaboradorId),
        data_pretendida: dataPretendida,
        justificativa,
      };
      if (tipo === "promocao") {
        corpo.cargo_destino_id = Number(cargoDestino);
        if (valor !== null && Number.isFinite(valor)) {
          corpo.salario_proposto = valor;
        }
        if (foraDaFaixa && justificativaExcecao.trim()) {
          corpo.justificativa_excecao = justificativaExcecao.trim();
        }
      } else {
        corpo.estabelecimento_destino_id = Number(unidadeDestino);
        if (centroCusto.trim()) corpo.centro_custo_destino = centroCusto.trim();
      }
      const resposta = await fetch("/api/demandas/movimentacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        aoCriar();
        aoFechar();
      } else {
        setErro(dados.erro ?? "Não foi possível abrir o pedido.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comum.fundoDialogo}>
      <div
        className={`${comum.dialogo} ${comum.dialogoLargo}`}
        role="dialog"
        aria-modal="true"
      >
        <h3>Promoção ou transferência</h3>
        <p className={comum.subDialogo}>
          O pedido segue a cadeia <b>líder → diretoria</b>. Aprovado pela
          diretoria, a nova posição/lotação passa a vigorar e o DP e o T&amp;D
          são avisados automaticamente.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="mov-tipo">
            Tipo
          </label>
          <select
            className={comum.campo}
            id="mov-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMovimentacao)}
          >
            {TIPOS_MOVIMENTACAO.map((chave) => (
              <option key={chave} value={chave}>
                {ROTULOS_TIPO_MOVIMENTACAO[chave]}
              </option>
            ))}
          </select>

          <label className={comum.rotuloCampo} htmlFor="mov-colaborador">
            Colaborador
          </label>
          <select
            className={comum.campo}
            id="mov-colaborador"
            required
            value={colaboradorId}
            onChange={(e) => setColaboradorId(e.target.value)}
          >
            <option value="">selecione…</option>
            {opcoes?.alvos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome_completo}
              </option>
            ))}
          </select>
          {alvo && (
            <p className={comum.dicaSla}>
              Hoje: {alvo.cargo_atual ?? "sem cargo vigente"} ·{" "}
              {alvo.unidade_atual ?? "sem unidade vigente"}
            </p>
          )}

          {tipo === "promocao" ? (
            <>
              <label className={comum.rotuloCampo} htmlFor="mov-cargo">
                Cargo destino
              </label>
              <select
                className={comum.campo}
                id="mov-cargo"
                required
                value={cargoDestino}
                onChange={(e) => setCargoDestino(e.target.value)}
              >
                <option value="">selecione…</option>
                {opcoes?.cargos.map((cargo) => (
                  <option key={cargo.id} value={cargo.id}>
                    {cargo.nome}
                  </option>
                ))}
              </select>
              {faixa && (
                <p className={comum.dicaSla}>
                  Faixa vigente do cargo destino: {moeda(faixa.faixa_min)} a{" "}
                  {moeda(faixa.faixa_max)}
                </p>
              )}
              {semFaixa && (
                <p className={comum.dicaSla}>
                  Este cargo não tem faixa salarial vigente — não há
                  enquadramento a verificar.
                </p>
              )}

              <label className={comum.rotuloCampo} htmlFor="mov-salario">
                Salário proposto (opcional — em branco mantém o atual)
              </label>
              <input
                className={comum.campo}
                id="mov-salario"
                type="number"
                min="0"
                step="0.01"
                value={salario}
                onChange={(e) => setSalario(e.target.value)}
              />
              {foraDaFaixa && (
                <>
                  <div className={comum.avisoFaixa}>
                    O valor está <b>fora da faixa</b> do cargo destino: a
                    exceção precisa ser justificada e fica registrada.
                  </div>
                  <label
                    className={comum.rotuloCampo}
                    htmlFor="mov-excecao"
                  >
                    Justificativa da exceção de enquadramento
                  </label>
                  <textarea
                    className={`${comum.campo} ${comum.campoTexto}`}
                    id="mov-excecao"
                    required
                    maxLength={2000}
                    value={justificativaExcecao}
                    onChange={(e) => setJustificativaExcecao(e.target.value)}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <label className={comum.rotuloCampo} htmlFor="mov-unidade">
                Unidade destino
              </label>
              <select
                className={comum.campo}
                id="mov-unidade"
                required
                value={unidadeDestino}
                onChange={(e) => setUnidadeDestino(e.target.value)}
              >
                <option value="">selecione…</option>
                {opcoes?.unidades.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.unidade}
                  </option>
                ))}
              </select>
              <label className={comum.rotuloCampo} htmlFor="mov-cc">
                Centro de custo destino (em branco mantém o atual)
              </label>
              <input
                className={comum.campo}
                id="mov-cc"
                type="text"
                maxLength={60}
                value={centroCusto}
                onChange={(e) => setCentroCusto(e.target.value)}
              />
            </>
          )}

          <label className={comum.rotuloCampo} htmlFor="mov-data">
            Vigência pretendida
          </label>
          <input
            className={comum.campo}
            id="mov-data"
            type="date"
            required
            value={dataPretendida}
            onChange={(e) => setDataPretendida(e.target.value)}
          />

          <label className={comum.rotuloCampo} htmlFor="mov-justificativa">
            Justificativa do pedido
          </label>
          <textarea
            className={`${comum.campo} ${comum.campoTexto}`}
            id="mov-justificativa"
            required
            maxLength={4000}
            placeholder="ex.: assumiu a coordenação do time e entrega resultado acima do combinado desde março"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />

          {erro && <p className={comum.erroAcao}>{erro}</p>}
          <div className={comum.acoesDialogo}>
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={aoFechar}
            >
              Cancelar
            </button>
            <button
              className={comum.botaoPrimario}
              type="submit"
              disabled={enviando}
            >
              {enviando ? "Enviando…" : "Enviar pedido"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
