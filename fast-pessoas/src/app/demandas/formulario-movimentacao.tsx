"use client";

import { FormEvent, useEffect, useState } from "react";
import { ROTULOS_VINCULO, TIPOS_VINCULO, TipoVinculo } from "@/dominios/colaboradores/esquemas";
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
  // Transferência entre empresas do grupo (0048): o vínculo NOVO precisa de
  // registro, lotação, centro de custo e matrícula própria.
  const [empresaDestino, setEmpresaDestino] = useState("");
  const [matriculaDestino, setMatriculaDestino] = useState("");
  const [vinculoDestino, setVinculoDestino] = useState<"" | TipoVinculo>("");
  // Líder NA EMPRESA DESTINO (0053). Nasce vazio e vazio é resposta: o vínculo
  // novo nasce sem líder e o DP designa. O que não existe mais é herdar o
  // líder de origem, que fica em outro CNPJ.
  const [gestorDestino, setGestorDestino] = useState("");
  const [salario, setSalario] = useState("");
  const [justificativaExcecao, setJustificativaExcecao] = useState("");
  const [dataPretendida, setDataPretendida] = useState("");
  const [justificativa, setJustificativa] = useState("");
  // Guarda a faixa JUNTO do cargo que a originou: assim trocar de cargo (ou de
  // tipo) não deixa a faixa antiga na tela e o efeito não precisa "limpar"
  // estado — a faixa exibida é derivada da escolha atual.
  const [faixaCarregada, setFaixaCarregada] = useState<{
    cargo_id: string;
    faixa: { faixa_min: number; faixa_max: number } | null;
  } | null>(null);
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
    if (tipo !== "promocao" || !cargoDestino) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/demandas/movimentacao/faixa?cargo_id=${cargoDestino}`
        );
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo || !resposta.ok) return;
        setFaixaCarregada({
          cargo_id: cargoDestino,
          faixa: dados.faixa ?? null,
        });
      } catch {
        /* sem faixa na tela não impede o envio: a trava vive no servidor */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [tipo, cargoDestino]);

  // Derivado da escolha atual: faixa de outro cargo nunca aparece.
  const carregado =
    tipo === "promocao" &&
    cargoDestino &&
    faixaCarregada?.cargo_id === cargoDestino
      ? faixaCarregada
      : null;
  const faixa = carregado?.faixa ?? null;
  const semFaixa = carregado !== null && carregado.faixa === null;

  const valor = salario.trim() === "" ? null : Number(salario);
  const foraDaFaixa =
    faixa !== null &&
    valor !== null &&
    Number.isFinite(valor) &&
    (valor < faixa.faixa_min || valor > faixa.faixa_max);

  const alvo = opcoes?.alvos.find((item) => String(item.id) === colaboradorId);

  // A transferência entre empresas do grupo só aparece para quem tem a chave
  // `movimentacao.transferir_empresa` — e a lista de empresas vem vazia da API
  // para quem não tem, então o servidor manda e a tela obedece.
  const podeTransferirEmpresa = (opcoes?.empresas.length ?? 0) > 0;
  // Candidatos a líder recortados pela empresa destino escolhida: quem lidera
  // "lá" tem de estar registrado lá.
  const gestoresDoDestino = (opcoes?.gestores ?? []).filter(
    (gestor) =>
      empresaDestino !== "" &&
      String(gestor.empresa_id) === empresaDestino &&
      String(gestor.colaborador_id) !== colaboradorId
  );
  const tiposOferecidos = TIPOS_MOVIMENTACAO.filter(
    (chave) => chave !== "transferencia_empresa" || podeTransferirEmpresa
  );

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
      } else if (tipo === "transferencia_empresa") {
        corpo.empresa_destino_id = Number(empresaDestino);
        corpo.estabelecimento_destino_id = Number(unidadeDestino);
        corpo.centro_custo_destino_id = Number(centroCusto);
        corpo.matricula_destino = matriculaDestino.trim();
        if (vinculoDestino) corpo.tipo_vinculo_destino = vinculoDestino;
        if (gestorDestino) {
          corpo.gestor_destino_colaborador_id = Number(gestorDestino);
        }
      } else {
        corpo.estabelecimento_destino_id = Number(unidadeDestino);
        if (centroCusto) corpo.centro_custo_destino_id = Number(centroCusto);
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
            {tiposOferecidos.map((chave) => (
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
          ) : tipo === "transferencia_empresa" ? (
            <>
              <div className={comum.avisoFaixa}>
                Este pedido <b>encerra o vínculo na empresa atual e abre outro</b>{" "}
                na empresa destino, na data de vigência. A <b>pessoa é a mesma</b>:
                mesmo CPF, mesma conta de acesso e a linha do tempo atravessa os
                dois contratos. Cargo e salário são mantidos; o período aquisitivo
                de férias recomeça e o banco de horas é acertado na saída.
              </div>

              <label className={comum.rotuloCampo} htmlFor="mov-empresa">
                Empresa destino (registro)
              </label>
              <select
                className={comum.campo}
                id="mov-empresa"
                required
                value={empresaDestino}
                onChange={(e) => setEmpresaDestino(e.target.value)}
              >
                <option value="">selecione…</option>
                {opcoes?.empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome_fantasia}
                    {empresa.cnpj ? ` (${empresa.cnpj})` : " (sem CNPJ informado)"}
                  </option>
                ))}
              </select>

              <label className={comum.rotuloCampo} htmlFor="mov-gestor-destino">
                Líder na empresa destino
              </label>
              <select
                className={comum.campo}
                id="mov-gestor-destino"
                value={gestorDestino}
                disabled={empresaDestino === ""}
                onChange={(e) => setGestorDestino(e.target.value)}
              >
                <option value="">
                  {empresaDestino === ""
                    ? "escolha a empresa destino primeiro"
                    : "sem líder definido (o DP designa depois)"}
                </option>
                {gestoresDoDestino.map((gestor) => (
                  <option
                    key={gestor.colaborador_id}
                    value={gestor.colaborador_id}
                  >
                    {gestor.nome_completo}
                    {gestor.cargo_atual ? ` — ${gestor.cargo_atual}` : ""}
                  </option>
                ))}
              </select>
              <p className={comum.dicaSla}>
                Só aparece quem está registrado na empresa destino. O líder de
                hoje NÃO atravessa: liderar dá acesso à ficha, ao ponto e à
                aprovação, e ele fica em outro CNPJ. Sem escolha aqui, o vínculo
                novo nasce sem líder e o DP designa.
              </p>

              <label className={comum.rotuloCampo} htmlFor="mov-empresa-unidade">
                Lotação destino (local de trabalho)
              </label>
              <select
                className={comum.campo}
                id="mov-empresa-unidade"
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

              <label className={comum.rotuloCampo} htmlFor="mov-empresa-cc">
                Centro de custo destino
              </label>
              <select
                className={comum.campo}
                id="mov-empresa-cc"
                required
                value={centroCusto}
                onChange={(e) => setCentroCusto(e.target.value)}
              >
                <option value="">selecione…</option>
                {opcoes?.centros_custo.map((centro) => (
                  <option key={centro.id} value={centro.id}>
                    {centro.codigo} — {centro.nome}
                    {centro.empresa_nome ? ` (${centro.empresa_nome})` : ""}
                  </option>
                ))}
              </select>

              <label className={comum.rotuloCampo} htmlFor="mov-matricula">
                Matrícula na empresa destino
              </label>
              <input
                className={comum.campo}
                id="mov-matricula"
                type="text"
                required
                maxLength={30}
                value={matriculaDestino}
                onChange={(e) => setMatriculaDestino(e.target.value)}
              />
              <p className={comum.dicaSla}>
                A matrícula é única no grupo inteiro: dois contratos, duas
                matrículas.
              </p>

              <label className={comum.rotuloCampo} htmlFor="mov-vinculo">
                Tipo de vínculo na empresa destino
              </label>
              <select
                className={comum.campo}
                id="mov-vinculo"
                value={vinculoDestino}
                onChange={(e) =>
                  setVinculoDestino(e.target.value as "" | TipoVinculo)
                }
              >
                <option value="">manter o atual</option>
                {TIPOS_VINCULO.map((chave) => (
                  <option key={chave} value={chave}>
                    {ROTULOS_VINCULO[chave]}
                  </option>
                ))}
              </select>
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
              <select
                className={comum.campo}
                id="mov-cc"
                value={centroCusto}
                onChange={(e) => setCentroCusto(e.target.value)}
              >
                <option value="">manter o atual</option>
                {opcoes?.centros_custo.map((centro) => (
                  <option key={centro.id} value={centro.id}>
                    {centro.codigo} — {centro.nome}
                    {centro.empresa_nome ? ` (${centro.empresa_nome})` : ""}
                  </option>
                ))}
              </select>
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
