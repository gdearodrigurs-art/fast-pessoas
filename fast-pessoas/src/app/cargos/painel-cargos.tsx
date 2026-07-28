"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import type { Cha } from "@/dominios/colaboradores/esquemas";
import estilos from "./page.module.css";

interface CargoResumo {
  id: number;
  nome: string | null;
  descricao: string | null;
  cha: Cha | null;
  inicio_vigencia: string | null;
  faixa_min: number | null;
  faixa_max: number | null;
  faixa_inicio_vigencia: string | null;
}

interface EstabelecimentoResumo {
  id: number;
  cnpj: string;
  razao_social: string | null;
  unidade: string | null;
  endereco_resumido: string | null;
  inicio_vigencia: string | null;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarCnpj(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function listaCha(texto: string): string[] | undefined {
  const itens = texto
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return itens.length > 0 ? itens : undefined;
}

function resumoCha(cha: Cha | null): string {
  if (!cha) return "—";
  const partes: string[] = [];
  if (cha.conhecimentos?.length) partes.push(`C: ${cha.conhecimentos.join(", ")}`);
  if (cha.habilidades?.length) partes.push(`H: ${cha.habilidades.join(", ")}`);
  if (cha.atitudes?.length) partes.push(`A: ${cha.atitudes.join(", ")}`);
  return partes.length > 0 ? partes.join(" · ") : "—";
}

const NOVO_CARGO_VAZIO = {
  nome: "",
  descricao: "",
  conhecimentos: "",
  habilidades: "",
  atitudes: "",
  inicio_vigencia: "",
  faixa_min: "",
  faixa_max: "",
};

const NOVA_VERSAO_VAZIA = {
  nome: "",
  descricao: "",
  conhecimentos: "",
  habilidades: "",
  atitudes: "",
  inicio_vigencia: "",
};

const NOVA_FAIXA_VAZIA = { faixa_min: "", faixa_max: "", inicio_vigencia: "" };

const NOVO_ESTABELECIMENTO_VAZIO = {
  cnpj: "",
  razao_social: "",
  unidade: "",
  endereco_resumido: "",
  inicio_vigencia: "",
};

export function PainelCargos({
  podeAdminEstabelecimento,
}: {
  podeAdminEstabelecimento: boolean;
}) {
  const [cargos, setCargos] = useState<CargoResumo[]>([]);
  const [estabelecimentos, setEstabelecimentos] = useState<EstabelecimentoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [novoCargo, setNovoCargo] = useState(NOVO_CARGO_VAZIO);
  const [erroNovoCargo, setErroNovoCargo] = useState<string | null>(null);

  const [cargoEmEdicao, setCargoEmEdicao] = useState<{
    id: number;
    modo: "versao" | "faixa";
  } | null>(null);
  const [novaVersao, setNovaVersao] = useState(NOVA_VERSAO_VAZIA);
  const [novaFaixa, setNovaFaixa] = useState(NOVA_FAIXA_VAZIA);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const [novoEstabelecimento, setNovoEstabelecimento] = useState(
    NOVO_ESTABELECIMENTO_VAZIO
  );
  const [erroEstabelecimento, setErroEstabelecimento] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const requisicoes: Promise<Response>[] = [fetch("/api/cargos")];
      if (podeAdminEstabelecimento) {
        requisicoes.push(fetch("/api/estabelecimentos"));
      }
      const respostas = await Promise.all(requisicoes);
      const dadosCargos = await respostas[0].json().catch(() => ({}));
      if (respostas[0].ok) {
        setCargos(dadosCargos.cargos ?? []);
      } else {
        setErro(dadosCargos.erro ?? "Não foi possível carregar os cargos.");
      }
      if (podeAdminEstabelecimento && respostas[1]) {
        const dadosEstabelecimentos = await respostas[1].json().catch(() => ({}));
        if (respostas[1].ok) {
          setEstabelecimentos(dadosEstabelecimentos.estabelecimentos ?? []);
        }
      }
    } catch {
      setErro("Falha de conexão. Recarregue a página.");
    } finally {
      setCarregando(false);
    }
  }, [podeAdminEstabelecimento]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  async function criarCargo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroNovoCargo(null);
    try {
      const corpo: Record<string, unknown> = {
        nome: novoCargo.nome,
        descricao: novoCargo.descricao.trim() || undefined,
        inicio_vigencia: novoCargo.inicio_vigencia,
        cha: {
          conhecimentos: listaCha(novoCargo.conhecimentos),
          habilidades: listaCha(novoCargo.habilidades),
          atitudes: listaCha(novoCargo.atitudes),
        },
      };
      if (novoCargo.faixa_min !== "" && novoCargo.faixa_max !== "") {
        corpo.faixa_min = Number(novoCargo.faixa_min);
        corpo.faixa_max = Number(novoCargo.faixa_max);
      }
      const resposta = await fetch("/api/cargos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroNovoCargo(dados.erro ?? "Não foi possível criar o cargo.");
        return;
      }
      setCargos(dados.cargos ?? []);
      setNovoCargo(NOVO_CARGO_VAZIO);
    } catch {
      setErroNovoCargo("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarVersao(evento: FormEvent<HTMLFormElement>, cargoId: number) {
    evento.preventDefault();
    setSalvando(true);
    setErroEdicao(null);
    try {
      const resposta = await fetch(`/api/cargos/${cargoId}/versoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: novaVersao.nome,
          descricao: novaVersao.descricao.trim() || undefined,
          inicio_vigencia: novaVersao.inicio_vigencia,
          cha: {
            conhecimentos: listaCha(novaVersao.conhecimentos),
            habilidades: listaCha(novaVersao.habilidades),
            atitudes: listaCha(novaVersao.atitudes),
          },
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroEdicao(dados.erro ?? "Não foi possível criar a versão.");
        return;
      }
      setCargos(dados.cargos ?? []);
      setCargoEmEdicao(null);
      setNovaVersao(NOVA_VERSAO_VAZIA);
    } catch {
      setErroEdicao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarFaixa(evento: FormEvent<HTMLFormElement>, cargoId: number) {
    evento.preventDefault();
    setSalvando(true);
    setErroEdicao(null);
    try {
      const resposta = await fetch(`/api/cargos/${cargoId}/faixas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faixa_min: Number(novaFaixa.faixa_min),
          faixa_max: Number(novaFaixa.faixa_max),
          inicio_vigencia: novaFaixa.inicio_vigencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroEdicao(dados.erro ?? "Não foi possível criar a faixa.");
        return;
      }
      setCargos(dados.cargos ?? []);
      setCargoEmEdicao(null);
      setNovaFaixa(NOVA_FAIXA_VAZIA);
    } catch {
      setErroEdicao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarEstabelecimento(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroEstabelecimento(null);
    try {
      const resposta = await fetch("/api/estabelecimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: novoEstabelecimento.cnpj,
          razao_social: novoEstabelecimento.razao_social,
          unidade: novoEstabelecimento.unidade,
          endereco_resumido: novoEstabelecimento.endereco_resumido.trim() || undefined,
          inicio_vigencia: novoEstabelecimento.inicio_vigencia,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroEstabelecimento(
          dados.erro ?? "Não foi possível criar o estabelecimento."
        );
        return;
      }
      setEstabelecimentos(dados.estabelecimentos ?? []);
      setNovoEstabelecimento(NOVO_ESTABELECIMENTO_VAZIO);
    } catch {
      setErroEstabelecimento("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Cargos e estrutura</h1>
        <p className={estilos.subtitulo}>
          Cargos com CHA e faixa salarial por vigência — versão nova encerra a
          anterior, nunca edita o passado. Cargo funcional ≠ papel de acesso do
          app.
        </p>

        <section className={estilos.cartao}>
          <h2>Novo cargo</h2>
          <form className={estilos.formulario} onSubmit={criarCargo}>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgNome">
                Nome do cargo
              </label>
              <input
                className={estilos.campo}
                id="cgNome"
                type="text"
                required
                maxLength={120}
                value={novoCargo.nome}
                onChange={(e) =>
                  setNovoCargo((atual) => ({ ...atual, nome: e.target.value }))
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgInicio">
                Início da vigência
              </label>
              <input
                className={estilos.campo}
                id="cgInicio"
                type="date"
                required
                value={novoCargo.inicio_vigencia}
                onChange={(e) =>
                  setNovoCargo((atual) => ({
                    ...atual,
                    inicio_vigencia: e.target.value,
                  }))
                }
              />
            </div>
            <div className={estilos.campoGrupoLargo}>
              <label className={estilos.rotulo} htmlFor="cgDescricao">
                Descrição (opcional)
              </label>
              <textarea
                className={estilos.campo}
                id="cgDescricao"
                rows={2}
                maxLength={4000}
                value={novoCargo.descricao}
                onChange={(e) =>
                  setNovoCargo((atual) => ({ ...atual, descricao: e.target.value }))
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgConhecimentos">
                Conhecimentos (separe com ;)
              </label>
              <input
                className={estilos.campo}
                id="cgConhecimentos"
                type="text"
                value={novoCargo.conhecimentos}
                onChange={(e) =>
                  setNovoCargo((atual) => ({
                    ...atual,
                    conhecimentos: e.target.value,
                  }))
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgHabilidades">
                Habilidades (separe com ;)
              </label>
              <input
                className={estilos.campo}
                id="cgHabilidades"
                type="text"
                value={novoCargo.habilidades}
                onChange={(e) =>
                  setNovoCargo((atual) => ({
                    ...atual,
                    habilidades: e.target.value,
                  }))
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgAtitudes">
                Atitudes (separe com ;)
              </label>
              <input
                className={estilos.campo}
                id="cgAtitudes"
                type="text"
                value={novoCargo.atitudes}
                onChange={(e) =>
                  setNovoCargo((atual) => ({ ...atual, atitudes: e.target.value }))
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgFaixaMin">
                Faixa mínima R$ (opcional)
              </label>
              <input
                className={estilos.campo}
                id="cgFaixaMin"
                type="number"
                min="0"
                step="0.01"
                value={novoCargo.faixa_min}
                onChange={(e) =>
                  setNovoCargo((atual) => ({ ...atual, faixa_min: e.target.value }))
                }
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="cgFaixaMax">
                Faixa máxima R$ (opcional)
              </label>
              <input
                className={estilos.campo}
                id="cgFaixaMax"
                type="number"
                min="0"
                step="0.01"
                value={novoCargo.faixa_max}
                onChange={(e) =>
                  setNovoCargo((atual) => ({ ...atual, faixa_max: e.target.value }))
                }
              />
            </div>
            <button className={estilos.botao} type="submit" disabled={salvando}>
              {salvando ? "Criando…" : "Criar cargo"}
            </button>
          </form>
          {erroNovoCargo && <p className={estilos.erro}>{erroNovoCargo}</p>}
        </section>

        <section className={estilos.cartao}>
          <h2>Cargos cadastrados</h2>
          {erro && <p className={estilos.erro}>{erro}</p>}
          {carregando ? (
            <p className={estilos.vazio}>Carregando…</p>
          ) : cargos.length === 0 ? (
            <p className={estilos.vazio}>Nenhum cargo cadastrado.</p>
          ) : (
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Cargo (versão ativa)</th>
                    <th>CHA</th>
                    <th>Faixa salarial ativa</th>
                    <th>Vigência desde</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cargos.map((cargo) => (
                    <tr key={cargo.id}>
                      <td>
                        <strong>{cargo.nome ?? "(sem versão ativa)"}</strong>
                        {cargo.descricao && (
                          <div style={{ color: "#6b6763", fontSize: "0.85rem" }}>
                            {cargo.descricao}
                          </div>
                        )}
                      </td>
                      <td>{resumoCha(cargo.cha)}</td>
                      <td>
                        {cargo.faixa_min !== null && cargo.faixa_max !== null
                          ? `${formatarSalario(cargo.faixa_min)} – ${formatarSalario(cargo.faixa_max)}`
                          : "—"}
                      </td>
                      <td>
                        {cargo.inicio_vigencia
                          ? formatarData(cargo.inicio_vigencia)
                          : "—"}
                      </td>
                      <td>
                        <button
                          className={estilos.botaoLinha}
                          type="button"
                          onClick={() => {
                            setErroEdicao(null);
                            setNovaVersao({
                              nome: cargo.nome ?? "",
                              descricao: cargo.descricao ?? "",
                              conhecimentos: (cargo.cha?.conhecimentos ?? []).join("; "),
                              habilidades: (cargo.cha?.habilidades ?? []).join("; "),
                              atitudes: (cargo.cha?.atitudes ?? []).join("; "),
                              inicio_vigencia: "",
                            });
                            setCargoEmEdicao({ id: cargo.id, modo: "versao" });
                          }}
                        >
                          Nova versão
                        </button>{" "}
                        <button
                          className={estilos.botaoLinha}
                          type="button"
                          onClick={() => {
                            setErroEdicao(null);
                            setNovaFaixa(NOVA_FAIXA_VAZIA);
                            setCargoEmEdicao({ id: cargo.id, modo: "faixa" });
                          }}
                        >
                          Nova faixa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cargoEmEdicao?.modo === "versao" && (
            <div className={estilos.subFormulario}>
              <h3>
                Nova versão do cargo (encerra a versão ativa na data de início)
              </h3>
              <form
                className={estilos.formulario}
                onSubmit={(evento) => criarVersao(evento, cargoEmEdicao.id)}
              >
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="vsNome">
                    Nome
                  </label>
                  <input
                    className={estilos.campo}
                    id="vsNome"
                    type="text"
                    required
                    maxLength={120}
                    value={novaVersao.nome}
                    onChange={(e) =>
                      setNovaVersao((atual) => ({ ...atual, nome: e.target.value }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="vsInicio">
                    Início da vigência
                  </label>
                  <input
                    className={estilos.campo}
                    id="vsInicio"
                    type="date"
                    required
                    value={novaVersao.inicio_vigencia}
                    onChange={(e) =>
                      setNovaVersao((atual) => ({
                        ...atual,
                        inicio_vigencia: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupoLargo}>
                  <label className={estilos.rotulo} htmlFor="vsDescricao">
                    Descrição
                  </label>
                  <textarea
                    className={estilos.campo}
                    id="vsDescricao"
                    rows={2}
                    maxLength={4000}
                    value={novaVersao.descricao}
                    onChange={(e) =>
                      setNovaVersao((atual) => ({
                        ...atual,
                        descricao: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="vsConhecimentos">
                    Conhecimentos (;)
                  </label>
                  <input
                    className={estilos.campo}
                    id="vsConhecimentos"
                    type="text"
                    value={novaVersao.conhecimentos}
                    onChange={(e) =>
                      setNovaVersao((atual) => ({
                        ...atual,
                        conhecimentos: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="vsHabilidades">
                    Habilidades (;)
                  </label>
                  <input
                    className={estilos.campo}
                    id="vsHabilidades"
                    type="text"
                    value={novaVersao.habilidades}
                    onChange={(e) =>
                      setNovaVersao((atual) => ({
                        ...atual,
                        habilidades: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="vsAtitudes">
                    Atitudes (;)
                  </label>
                  <input
                    className={estilos.campo}
                    id="vsAtitudes"
                    type="text"
                    value={novaVersao.atitudes}
                    onChange={(e) =>
                      setNovaVersao((atual) => ({
                        ...atual,
                        atitudes: e.target.value,
                      }))
                    }
                  />
                </div>
                <button className={estilos.botao} type="submit" disabled={salvando}>
                  {salvando ? "Salvando…" : "Criar versão"}
                </button>
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => setCargoEmEdicao(null)}
                >
                  Cancelar
                </button>
              </form>
              {erroEdicao && <p className={estilos.erro}>{erroEdicao}</p>}
            </div>
          )}

          {cargoEmEdicao?.modo === "faixa" && (
            <div className={estilos.subFormulario}>
              <h3>Nova faixa salarial (encerra a faixa ativa na data de início)</h3>
              <form
                className={estilos.formulario}
                onSubmit={(evento) => criarFaixa(evento, cargoEmEdicao.id)}
              >
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="fxMin">
                    Faixa mínima R$
                  </label>
                  <input
                    className={estilos.campo}
                    id="fxMin"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={novaFaixa.faixa_min}
                    onChange={(e) =>
                      setNovaFaixa((atual) => ({ ...atual, faixa_min: e.target.value }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="fxMax">
                    Faixa máxima R$
                  </label>
                  <input
                    className={estilos.campo}
                    id="fxMax"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={novaFaixa.faixa_max}
                    onChange={(e) =>
                      setNovaFaixa((atual) => ({ ...atual, faixa_max: e.target.value }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="fxInicio">
                    Início da vigência
                  </label>
                  <input
                    className={estilos.campo}
                    id="fxInicio"
                    type="date"
                    required
                    value={novaFaixa.inicio_vigencia}
                    onChange={(e) =>
                      setNovaFaixa((atual) => ({
                        ...atual,
                        inicio_vigencia: e.target.value,
                      }))
                    }
                  />
                </div>
                <button className={estilos.botao} type="submit" disabled={salvando}>
                  {salvando ? "Salvando…" : "Criar faixa"}
                </button>
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => setCargoEmEdicao(null)}
                >
                  Cancelar
                </button>
              </form>
              {erroEdicao && <p className={estilos.erro}>{erroEdicao}</p>}
            </div>
          )}
        </section>

        {podeAdminEstabelecimento && (
          <section className={estilos.cartao}>
            <h2>Estabelecimentos (unidades)</h2>
            <p className={estilos.aviso}>
              Identidade estável é o CNPJ; dados descritivos mudam por versão com
              vigência. As unidades alimentam a lotação dos colaboradores.
            </p>
            {estabelecimentos.length === 0 ? (
              <p className={estilos.vazio}>Nenhum estabelecimento cadastrado.</p>
            ) : (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Unidade</th>
                      <th>Razão social</th>
                      <th>CNPJ</th>
                      <th>Vigência desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estabelecimentos.map((estabelecimento) => (
                      <tr key={estabelecimento.id}>
                        <td>{estabelecimento.unidade ?? "(sem versão ativa)"}</td>
                        <td>{estabelecimento.razao_social ?? "—"}</td>
                        <td>{formatarCnpj(estabelecimento.cnpj)}</td>
                        <td>
                          {estabelecimento.inicio_vigencia
                            ? formatarData(estabelecimento.inicio_vigencia)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form
              className={estilos.formulario}
              onSubmit={criarEstabelecimento}
              style={{ marginTop: 14 }}
            >
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="esCnpj">
                  CNPJ
                </label>
                <input
                  className={estilos.campo}
                  id="esCnpj"
                  type="text"
                  required
                  maxLength={18}
                  value={novoEstabelecimento.cnpj}
                  onChange={(e) =>
                    setNovoEstabelecimento((atual) => ({
                      ...atual,
                      cnpj: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="esRazao">
                  Razão social
                </label>
                <input
                  className={estilos.campo}
                  id="esRazao"
                  type="text"
                  required
                  maxLength={200}
                  value={novoEstabelecimento.razao_social}
                  onChange={(e) =>
                    setNovoEstabelecimento((atual) => ({
                      ...atual,
                      razao_social: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="esUnidade">
                  Nome da unidade
                </label>
                <input
                  className={estilos.campo}
                  id="esUnidade"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="ex.: Loja Centro"
                  value={novoEstabelecimento.unidade}
                  onChange={(e) =>
                    setNovoEstabelecimento((atual) => ({
                      ...atual,
                      unidade: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="esEndereco">
                  Endereço resumido (opcional)
                </label>
                <input
                  className={estilos.campo}
                  id="esEndereco"
                  type="text"
                  maxLength={300}
                  value={novoEstabelecimento.endereco_resumido}
                  onChange={(e) =>
                    setNovoEstabelecimento((atual) => ({
                      ...atual,
                      endereco_resumido: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="esInicio">
                  Início da vigência
                </label>
                <input
                  className={estilos.campo}
                  id="esInicio"
                  type="date"
                  required
                  value={novoEstabelecimento.inicio_vigencia}
                  onChange={(e) =>
                    setNovoEstabelecimento((atual) => ({
                      ...atual,
                      inicio_vigencia: e.target.value,
                    }))
                  }
                />
              </div>
              <button className={estilos.botao} type="submit" disabled={salvando}>
                {salvando ? "Criando…" : "Criar estabelecimento"}
              </button>
            </form>
            {erroEstabelecimento && (
              <p className={estilos.erro}>{erroEstabelecimento}</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
