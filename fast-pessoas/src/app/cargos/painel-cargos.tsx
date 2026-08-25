"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  ROTULOS_VINCULO,
  TIPOS_VINCULO,
  type Cha,
  type TipoVinculo,
} from "@/dominios/colaboradores/esquemas";
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
  setor: string | null;
  cargo_lider_id: number | null;
  cargo_lider_nome: string | null;
  tipo_contrato_previsto: TipoVinculo | null;
  missao: string | null;
  atividades: string[] | null;
  observacoes: string | null;
  /** Nível hierárquico da versão ativa (A6:a — catálogo administrável). */
  nivel_hierarquico_id: number | null;
  nivel_hierarquico_nome: string | null;
  ocupantes: number;
}

/** Nível do catálogo administrável (A6:a, migration 0085). */
interface NivelHierarquico {
  id: number;
  nome: string;
  ordem: number;
  ativo: boolean;
  em_uso: number;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


/** CHA aceita ";" ou quebra de linha como separador (listas curtas). */
function listaCha(texto: string): string[] | undefined {
  const itens = texto
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return itens.length > 0 ? itens : undefined;
}

/**
 * Atividades: UMA POR LINHA, e a ordem é preservada — no documento impresso a
 * sequência das atividades é informação (é assim que o gestor descreve a rotina).
 */
function listaAtividades(texto: string): string[] | undefined {
  const itens = texto
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return itens.length > 0 ? itens : undefined;
}

function truncar(texto: string, limite: number): string {
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

// Campos do RCF na ORDEM do documento oficial
// (referencias/rcf-modelo-descritivo-de-cargos.md).
interface FormularioRcf {
  nome: string;
  setor: string;
  cargo_lider_id: string;
  nivel_hierarquico_id: string;
  tipo_contrato_previsto: string;
  missao: string;
  atividades: string;
  conhecimentos: string;
  habilidades: string;
  atitudes: string;
  observacoes: string;
  descricao: string;
  inicio_vigencia: string;
}

const RCF_VAZIO: FormularioRcf = {
  nome: "",
  setor: "",
  cargo_lider_id: "",
  nivel_hierarquico_id: "",
  tipo_contrato_previsto: "",
  missao: "",
  atividades: "",
  conhecimentos: "",
  habilidades: "",
  atitudes: "",
  observacoes: "",
  descricao: "",
  inicio_vigencia: "",
};

function rcfDoCargo(cargo: CargoResumo): FormularioRcf {
  return {
    nome: cargo.nome ?? "",
    setor: cargo.setor ?? "",
    cargo_lider_id:
      cargo.cargo_lider_id === null ? "" : String(cargo.cargo_lider_id),
    nivel_hierarquico_id:
      cargo.nivel_hierarquico_id === null
        ? ""
        : String(cargo.nivel_hierarquico_id),
    tipo_contrato_previsto: cargo.tipo_contrato_previsto ?? "",
    missao: cargo.missao ?? "",
    atividades: (cargo.atividades ?? []).join("\n"),
    conhecimentos: (cargo.cha?.conhecimentos ?? []).join("; "),
    habilidades: (cargo.cha?.habilidades ?? []).join("; "),
    atitudes: (cargo.cha?.atitudes ?? []).join("; "),
    observacoes: cargo.observacoes ?? "",
    descricao: cargo.descricao ?? "",
    inicio_vigencia: "",
  };
}

/** Corpo do POST — campo vazio vai como `undefined`, não como string vazia. */
function corpoRcf(formulario: FormularioRcf): Record<string, unknown> {
  return {
    nome: formulario.nome,
    setor: formulario.setor.trim() || undefined,
    cargo_lider_id:
      formulario.cargo_lider_id === ""
        ? null
        : Number(formulario.cargo_lider_id),
    nivel_hierarquico_id:
      formulario.nivel_hierarquico_id === ""
        ? null
        : Number(formulario.nivel_hierarquico_id),
    tipo_contrato_previsto: formulario.tipo_contrato_previsto || undefined,
    missao: formulario.missao.trim() || undefined,
    atividades: listaAtividades(formulario.atividades),
    cha: {
      conhecimentos: listaCha(formulario.conhecimentos),
      habilidades: listaCha(formulario.habilidades),
      atitudes: listaCha(formulario.atitudes),
    },
    observacoes: formulario.observacoes.trim() || undefined,
    descricao: formulario.descricao.trim() || undefined,
    inicio_vigencia: formulario.inicio_vigencia,
  };
}

const NOVA_FAIXA_VAZIA = { faixa_min: "", faixa_max: "", inicio_vigencia: "" };

/**
 * Formulário do RCF na ordem do documento. O mesmo componente serve para criar
 * cargo e para abrir versão nova — o documento é o mesmo, o que muda é o efeito
 * na vigência.
 */
function CamposRcf({
  prefixo,
  valores,
  cargos,
  niveis,
  cargoAtualId,
  aoAlterar,
}: {
  prefixo: string;
  valores: FormularioRcf;
  cargos: CargoResumo[];
  /** Níveis ATIVOS do catálogo (A6:a) — nada de lista chumbada aqui. */
  niveis: NivelHierarquico[];
  cargoAtualId: number | null;
  aoAlterar: (campo: keyof FormularioRcf, valor: string) => void;
}) {
  const id = (campo: string) => `${prefixo}${campo}`;
  return (
    <>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={id("Nome")}>
          Cargo
        </label>
        <input
          className={estilos.campo}
          id={id("Nome")}
          type="text"
          required
          maxLength={120}
          value={valores.nome}
          onChange={(e) => aoAlterar("nome", e.target.value)}
        />
      </div>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={id("Setor")}>
          Setor
        </label>
        <input
          className={estilos.campo}
          id={id("Setor")}
          type="text"
          maxLength={120}
          placeholder="ex.: Comercial"
          value={valores.setor}
          onChange={(e) => aoAlterar("setor", e.target.value)}
        />
      </div>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={id("Lider")}>
          Líder direto (cargo)
        </label>
        <select
          className={estilos.campo}
          id={id("Lider")}
          value={valores.cargo_lider_id}
          onChange={(e) => aoAlterar("cargo_lider_id", e.target.value)}
        >
          <option value="">Não definido</option>
          {cargos
            .filter((cargo) => cargo.id !== cargoAtualId && cargo.nome !== null)
            .map((cargo) => (
              <option key={cargo.id} value={String(cargo.id)}>
                {cargo.nome}
              </option>
            ))}
        </select>
      </div>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={id("Nivel")}>
          Nível hierárquico
        </label>
        {/* Opções do catálogo administrável (só ativos) — o dono acrescenta,
            renomeia e inativa níveis na seção abaixo, nunca no código. */}
        <select
          className={estilos.campo}
          id={id("Nivel")}
          value={valores.nivel_hierarquico_id}
          onChange={(e) => aoAlterar("nivel_hierarquico_id", e.target.value)}
        >
          <option value="">Não classificado</option>
          {niveis
            .filter((nivel) => nivel.ativo)
            .map((nivel) => (
              <option key={nivel.id} value={String(nivel.id)}>
                {nivel.nome}
              </option>
            ))}
        </select>
      </div>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={id("Contrato")}>
          Tipo de contrato previsto
        </label>
        <select
          className={estilos.campo}
          id={id("Contrato")}
          value={valores.tipo_contrato_previsto}
          onChange={(e) => aoAlterar("tipo_contrato_previsto", e.target.value)}
        >
          <option value="">Não definido</option>
          {TIPOS_VINCULO.map((opcao) => (
            <option key={opcao} value={opcao}>
              {ROTULOS_VINCULO[opcao]}
            </option>
          ))}
        </select>
      </div>
      <div className={estilos.campoGrupo}>
        <label className={estilos.rotulo} htmlFor={id("Inicio")}>
          Início da vigência
        </label>
        <input
          className={estilos.campo}
          id={id("Inicio")}
          type="date"
          required
          value={valores.inicio_vigencia}
          onChange={(e) => aoAlterar("inicio_vigencia", e.target.value)}
        />
      </div>
      <div className={estilos.campoGrupoLargo}>
        <label className={estilos.rotulo} htmlFor={id("Missao")}>
          Responsabilidade Chave da Função (missão do cargo)
        </label>
        <textarea
          className={estilos.campo}
          id={id("Missao")}
          rows={3}
          maxLength={4000}
          placeholder="Para que este cargo existe."
          value={valores.missao}
          onChange={(e) => aoAlterar("missao", e.target.value)}
        />
      </div>
      <div className={estilos.campoGrupoLargo}>
        <label className={estilos.rotulo} htmlFor={id("Atividades")}>
          Atividades a desempenhar — uma por linha, na ordem da rotina
        </label>
        <textarea
          className={estilos.campo}
          id={id("Atividades")}
          rows={5}
          value={valores.atividades}
          onChange={(e) => aoAlterar("atividades", e.target.value)}
        />
      </div>
      <div className={estilos.chaGrade}>
        <div className={estilos.chaColuna}>
          <label className={estilos.rotulo} htmlFor={id("Conhecimentos")}>
            Conhecimentos <span className={estilos.chaDica}>perfil técnico</span>
          </label>
          <textarea
            className={estilos.campo}
            id={id("Conhecimentos")}
            rows={4}
            placeholder="Separe com ; ou por linha"
            value={valores.conhecimentos}
            onChange={(e) => aoAlterar("conhecimentos", e.target.value)}
          />
        </div>
        <div className={estilos.chaColuna}>
          <label className={estilos.rotulo} htmlFor={id("Habilidades")}>
            Habilidades{" "}
            <span className={estilos.chaDica}>experiências necessárias</span>
          </label>
          <textarea
            className={estilos.campo}
            id={id("Habilidades")}
            rows={4}
            placeholder="Separe com ; ou por linha"
            value={valores.habilidades}
            onChange={(e) => aoAlterar("habilidades", e.target.value)}
          />
        </div>
        <div className={estilos.chaColuna}>
          <label className={estilos.rotulo} htmlFor={id("Atitudes")}>
            Atitudes <span className={estilos.chaDica}>comportamentos</span>
          </label>
          <textarea
            className={estilos.campo}
            id={id("Atitudes")}
            rows={4}
            placeholder="Separe com ; ou por linha"
            value={valores.atitudes}
            onChange={(e) => aoAlterar("atitudes", e.target.value)}
          />
        </div>
      </div>
      <div className={estilos.campoGrupoLargo}>
        <label className={estilos.rotulo} htmlFor={id("Observacoes")}>
          Observações importantes
        </label>
        <textarea
          className={estilos.campo}
          id={id("Observacoes")}
          rows={2}
          maxLength={4000}
          value={valores.observacoes}
          onChange={(e) => aoAlterar("observacoes", e.target.value)}
        />
      </div>
      <div className={estilos.campoGrupoLargo}>
        <label className={estilos.rotulo} htmlFor={id("Descricao")}>
          Descrição resumida (opcional — aparece nas listas do sistema)
        </label>
        <textarea
          className={estilos.campo}
          id={id("Descricao")}
          rows={2}
          maxLength={4000}
          value={valores.descricao}
          onChange={(e) => aoAlterar("descricao", e.target.value)}
        />
      </div>
    </>
  );
}

export function PainelCargos({
  podeAdministrar,
  podeAdminEstrutura,
}: {
  /** false = leitura do RCF apenas (chave rh.cargo.ver): sem formulários,
   *  sem faixa salarial (que a API já não envia). */
  podeAdministrar: boolean;
  /** Só para oferecer o atalho: os catálogos moram na tela de estrutura. */
  podeAdminEstrutura: boolean;
}) {
  const [cargos, setCargos] = useState<CargoResumo[]>([]);
  const [niveis, setNiveis] = useState<NivelHierarquico[]>([]);
  const [novoNivel, setNovoNivel] = useState("");
  const [erroNivel, setErroNivel] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [novoCargo, setNovoCargo] = useState<FormularioRcf>(RCF_VAZIO);
  const [novaFaixaNoCargo, setNovaFaixaNoCargo] = useState({
    faixa_min: "",
    faixa_max: "",
  });
  const [erroNovoCargo, setErroNovoCargo] = useState<string | null>(null);
  const [formNovoCargoAberto, setFormNovoCargoAberto] = useState(false);

  const [cargoEmEdicao, setCargoEmEdicao] = useState<{
    id: number;
    modo: "versao" | "faixa";
  } | null>(null);
  const [novaVersao, setNovaVersao] = useState<FormularioRcf>(RCF_VAZIO);
  const [novaFaixa, setNovaFaixa] = useState(NOVA_FAIXA_VAZIA);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [resposta, respostaNiveis] = await Promise.all([
        fetch("/api/cargos"),
        fetch("/api/cargos/niveis"),
      ]);
      const dadosCargos = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setCargos(dadosCargos.cargos ?? []);
      } else {
        setErro(dadosCargos.erro ?? "Não foi possível carregar os cargos.");
      }
      // Catálogo de níveis (A6:a): falha aqui não derruba a tela de cargos —
      // o seletor fica vazio e a coluna mostra o nome que veio com o cargo.
      if (respostaNiveis.ok) {
        const dadosNiveis = await respostaNiveis.json().catch(() => ({}));
        setNiveis(dadosNiveis.niveis ?? []);
      }
    } catch {
      setErro("Falha de conexão. Recarregue a página.");
    } finally {
      setCarregando(false);
    }
  }, []);

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
      const corpo = corpoRcf(novoCargo);
      if (novaFaixaNoCargo.faixa_min !== "" && novaFaixaNoCargo.faixa_max !== "") {
        corpo.faixa_min = Number(novaFaixaNoCargo.faixa_min);
        corpo.faixa_max = Number(novaFaixaNoCargo.faixa_max);
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
      setNovoCargo(RCF_VAZIO);
      setNovaFaixaNoCargo({ faixa_min: "", faixa_max: "" });
      setFormNovoCargoAberto(false);
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
        body: JSON.stringify(corpoRcf(novaVersao)),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroEdicao(dados.erro ?? "Não foi possível criar a versão.");
        return;
      }
      setCargos(dados.cargos ?? []);
      setCargoEmEdicao(null);
      setNovaVersao(RCF_VAZIO);
    } catch {
      setErroEdicao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  // -------------------------------------------------- catálogo de níveis (A6:a)

  async function criarNivel(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setErroNivel(null);
    try {
      const resposta = await fetch("/api/cargos/niveis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNivel }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroNivel(dados.erro ?? "Não foi possível criar o nível.");
        return;
      }
      setNiveis(dados.niveis ?? []);
      setNovoNivel("");
    } catch {
      setErroNivel("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarNivel(nivel: NivelHierarquico) {
    setSalvando(true);
    setErroNivel(null);
    try {
      const resposta = await fetch(`/api/cargos/niveis/${nivel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inativo: nivel.ativo }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroNivel(dados.erro ?? "Não foi possível atualizar o nível.");
        return;
      }
      setNiveis(dados.niveis ?? []);
    } catch {
      setErroNivel("Falha de conexão. Tente novamente.");
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

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Cargos e estrutura</h1>
        <p className={estilos.subtitulo}>
          Cada cargo tem um RCF — Responsabilidade Chave da Função, o descritivo
          oficial da Fast — versionado com vigência: versão nova encerra a
          anterior e o passado nunca é reescrito. Cargo funcional ≠ papel de
          acesso do app.
        </p>

        {!podeAdministrar && (
          <p className={estilos.aviso}>
            Você está em modo leitura do descritivo: pode consultar e imprimir o
            RCF de cada cargo. Criar cargo, abrir versão nova e ver faixa
            salarial exigem a chave de administração de cargos.
          </p>
        )}

        {podeAdministrar && (
        <section className={estilos.cartao}>
          <div className={estilos.cartaoTopo}>
            <h2>Novo cargo (RCF completo)</h2>
            <button
              className={estilos.botaoLinha}
              type="button"
              onClick={() => setFormNovoCargoAberto((aberto) => !aberto)}
            >
              {formNovoCargoAberto ? "Fechar" : "Abrir formulário"}
            </button>
          </div>
          {formNovoCargoAberto && (
            <>
              <p className={estilos.aviso}>
                O gestor preenche este documento quando abre uma vaga. Só o nome
                do cargo e a vigência são obrigatórios aqui — o resto pode ser
                completado depois com uma versão nova, mas requisição de vaga e
                avaliação usam a missão e o CHA como base.
              </p>
              <form className={estilos.formulario} onSubmit={criarCargo}>
                <CamposRcf
                  prefixo="cg"
                  valores={novoCargo}
                  cargos={cargos}
                  niveis={niveis}
                  cargoAtualId={null}
                  aoAlterar={(campo, valor) =>
                    setNovoCargo((atual) => ({ ...atual, [campo]: valor }))
                  }
                />
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
                    value={novaFaixaNoCargo.faixa_min}
                    onChange={(e) =>
                      setNovaFaixaNoCargo((atual) => ({
                        ...atual,
                        faixa_min: e.target.value,
                      }))
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
                    value={novaFaixaNoCargo.faixa_max}
                    onChange={(e) =>
                      setNovaFaixaNoCargo((atual) => ({
                        ...atual,
                        faixa_max: e.target.value,
                      }))
                    }
                  />
                </div>
                <button className={estilos.botao} type="submit" disabled={salvando}>
                  {salvando ? "Criando…" : "Criar cargo"}
                </button>
              </form>
            </>
          )}
          {erroNovoCargo && <p className={estilos.erro}>{erroNovoCargo}</p>}
        </section>
        )}

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
                    <th>Setor</th>
                    <th>Nível</th>
                    <th>Líder direto</th>
                    <th>RCF</th>
                    <th>Ocupantes</th>
                    {podeAdministrar && <th>Faixa salarial ativa</th>}
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
                          <div className={estilos.celulaNota}>
                            {truncar(cargo.descricao, 90)}
                          </div>
                        )}
                      </td>
                      <td>{cargo.setor ?? "—"}</td>
                      <td>{cargo.nivel_hierarquico_nome ?? "—"}</td>
                      <td>{cargo.cargo_lider_nome ?? "—"}</td>
                      <td>
                        {cargo.missao ? (
                          <span className={estilos.selo}>preenchido</span>
                        ) : (
                          <span className={estilos.seloVazio}>sem missão</span>
                        )}
                      </td>
                      <td className={estilos.numerico}>{cargo.ocupantes}</td>
                      {podeAdministrar && (
                        <td>
                          {cargo.faixa_min != null && cargo.faixa_max != null
                            ? `${formatarSalario(cargo.faixa_min)} – ${formatarSalario(cargo.faixa_max)}`
                            : "—"}
                        </td>
                      )}
                      <td>
                        {cargo.inicio_vigencia
                          ? formatarData(cargo.inicio_vigencia)
                          : "—"}
                      </td>
                      <td className={estilos.acoesCelula}>
                        {cargo.nome !== null && (
                          <Link
                            className={estilos.botaoLinha}
                            href={`/cargos/${cargo.id}/rcf`}
                          >
                            Ver/imprimir RCF
                          </Link>
                        )}{" "}
                        {podeAdministrar && (
                          <>
                            <button
                              className={estilos.botaoLinha}
                              type="button"
                              onClick={() => {
                                setErroEdicao(null);
                                setNovaVersao(rcfDoCargo(cargo));
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
                          </>
                        )}
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
                Nova versão do RCF (encerra a versão ativa no dia anterior ao
                início desta)
              </h3>
              <p className={estilos.aviso}>
                O formulário vem preenchido com o RCF vigente: ajuste o que
                mudou e informe a partir de quando vale. A versão anterior fica
                congelada no histórico.
              </p>
              <form
                className={estilos.formulario}
                onSubmit={(evento) => criarVersao(evento, cargoEmEdicao.id)}
              >
                <CamposRcf
                  prefixo="vs"
                  valores={novaVersao}
                  cargos={cargos}
                  niveis={niveis}
                  cargoAtualId={cargoEmEdicao.id}
                  aoAlterar={(campo, valor) =>
                    setNovaVersao((atual) => ({ ...atual, [campo]: valor }))
                  }
                />
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

        {/* A6:a — catálogo administrável de níveis hierárquicos (eixo 9):
            criar e inativar/reativar pela tela; exclusão não existe (versões
            de cargo antigas continuam apontando para o nível da época). */}
        {podeAdministrar && (
          <section className={estilos.cartao}>
            <h2>Níveis hierárquicos (catálogo)</h2>
            <p className={estilos.aviso}>
              O nível fica na VERSÃO do cargo: reclassificar é abrir versão
              nova, e o histórico continua apontando para o nível que valia na
              época. Inativar tira o nível das versões novas sem apagar nada.
            </p>
            <form className={estilos.formulario} onSubmit={criarNivel}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="nhNome">
                  Novo nível
                </label>
                <input
                  className={estilos.campo}
                  id="nhNome"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="ex.: Especialista"
                  value={novoNivel}
                  onChange={(e) => setNovoNivel(e.target.value)}
                />
              </div>
              <button className={estilos.botao} type="submit" disabled={salvando}>
                {salvando ? "Criando…" : "Criar nível"}
              </button>
            </form>
            {erroNivel && <p className={estilos.erro}>{erroNivel}</p>}
            {niveis.length === 0 ? (
              <p className={estilos.vazio}>Nenhum nível cadastrado.</p>
            ) : (
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Nível</th>
                      <th>Situação</th>
                      <th>Em uso (versões de cargo)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {niveis.map((nivel) => (
                      <tr key={nivel.id}>
                        <td>{nivel.nome}</td>
                        <td>{nivel.ativo ? "ativo" : "inativo"}</td>
                        <td className={estilos.numerico}>{nivel.em_uso}</td>
                        <td className={estilos.acoesCelula}>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={salvando}
                            onClick={() => void alternarNivel(nivel)}
                          >
                            {nivel.ativo ? "Inativar" : "Reativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {podeAdminEstrutura && (
          <section className={estilos.cartao}>
            <h2>Estrutura do grupo</h2>
            <p className={estilos.aviso}>
              Empresa do grupo (registro), lotação (local de trabalho) e centro
              de custo saíram daqui e viraram tela própria — os três são
              independentes e cada um tem catálogo com nome versionado.
            </p>
            <Link className={estilos.botaoLinha} href="/estrutura">
              Abrir estrutura do grupo
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
