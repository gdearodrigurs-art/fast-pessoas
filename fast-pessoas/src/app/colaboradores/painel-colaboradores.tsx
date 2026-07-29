"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  GENEROS,
  Genero,
  ROTULOS_GENERO,
  ROTULOS_STATUS,
  ROTULOS_VINCULO,
  STATUS_COLABORADOR,
  StatusColaborador,
  TIPOS_VINCULO,
  TipoVinculo,
} from "@/dominios/colaboradores/esquemas";
import estilos from "./page.module.css";

interface ColaboradorListado {
  id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  cargo_nome: string | null;
  unidade: string | null;
  feedback_vencido: boolean;
}

const ESTILO_PILL: Record<StatusColaborador, string> = {
  ativo: estilos.pillAtivo,
  afastado: estilos.pillAfastado,
  desligado: estilos.pillDesligado,
};

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PainelColaboradores({ podeCriar }: { podeCriar: boolean }) {
  const [colaboradores, setColaboradores] = useState<ColaboradorListado[]>([]);
  const [alcance, setAlcance] = useState<string>("todos");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erroCriacao, setErroCriacao] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{
    nome: string;
    email: string;
    senha: string;
    id: number;
  } | null>(null);
  const [novo, setNovo] = useState({
    nome_completo: "",
    email: "",
    matricula: "",
    cpf: "",
    tipo_vinculo: "clt" as TipoVinculo,
    data_admissao: "",
    data_nascimento: "",
    genero: "nao_informado" as Genero,
    retrato: "",
    contexto: "",
  });

  const carregar = useCallback(
    async (buscaAtual: string, statusAtual: string) => {
      setCarregando(true);
      setErro(null);
      try {
        const parametros = new URLSearchParams();
        if (buscaAtual.trim()) parametros.set("busca", buscaAtual.trim());
        if (statusAtual) parametros.set("status", statusAtual);
        const consulta = parametros.toString();
        const resposta = await fetch(
          `/api/colaboradores${consulta ? `?${consulta}` : ""}`
        );
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.ok) {
          setColaboradores(dados.colaboradores ?? []);
          setAlcance(dados.alcance ?? "todos");
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os colaboradores.");
        }
      } catch {
        setErro("Falha de conexão. Recarregue a página.");
      } finally {
        setCarregando(false);
      }
    },
    []
  );

  useEffect(() => {
    void (async () => {
      await carregar("", "");
    })();
  }, [carregar]);

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    carregar(busca, status);
  }

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroCriacao(null);
    setSenhaGerada(null);
    setCriando(true);
    try {
      const resposta = await fetch("/api/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: novo.nome_completo,
          email: novo.email,
          matricula: novo.matricula,
          cpf: novo.cpf,
          tipo_vinculo: novo.tipo_vinculo,
          data_admissao: novo.data_admissao,
          data_nascimento: novo.data_nascimento,
          genero: novo.genero,
          retrato: novo.retrato.trim() || undefined,
          contexto: novo.contexto.trim() || undefined,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setSenhaGerada({
          nome: dados.colaborador.nome_completo,
          email: novo.email,
          senha: dados.senha_temporaria,
          id: dados.colaborador.id,
        });
        setNovo({
          nome_completo: "",
          email: "",
          matricula: "",
          cpf: "",
          tipo_vinculo: "clt",
          data_admissao: "",
          data_nascimento: "",
          genero: "nao_informado",
          retrato: "",
          contexto: "",
        });
        carregar(busca, status);
      } else {
        setErroCriacao(dados.erro ?? "Não foi possível criar o colaborador.");
      }
    } catch {
      setErroCriacao("Falha de conexão. Tente novamente.");
    } finally {
      setCriando(false);
    }
  }

  const tituloLista =
    alcance === "todos"
      ? "Todos os colaboradores"
      : alcance === "equipe"
        ? "Sua ficha e sua equipe (relação gestor→liderado vigente)"
        : "Sua ficha";

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Colaboradores</h1>
        <p className={estilos.subtitulo}>{tituloLista}</p>

        {podeCriar && (
          <section className={estilos.cartao}>
            <h2>Novo colaborador</h2>
            {!mostrarForm && !senhaGerada && (
              <button
                className={estilos.botao}
                type="button"
                onClick={() => setMostrarForm(true)}
              >
                + Novo colaborador
              </button>
            )}
            {mostrarForm && (
              <form className={estilos.formulario} onSubmit={criar}>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoNome">
                    Nome completo
                  </label>
                  <input
                    className={estilos.campo}
                    id="novoNome"
                    type="text"
                    required
                    maxLength={200}
                    value={novo.nome_completo}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        nome_completo: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoEmail">
                    E-mail
                  </label>
                  <input
                    className={estilos.campo}
                    id="novoEmail"
                    type="email"
                    required
                    maxLength={254}
                    value={novo.email}
                    onChange={(e) =>
                      setNovo((atual) => ({ ...atual, email: e.target.value }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novaMatricula">
                    Matrícula
                  </label>
                  <input
                    className={estilos.campo}
                    id="novaMatricula"
                    type="text"
                    required
                    maxLength={10}
                    value={novo.matricula}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        matricula: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoCpf">
                    CPF
                  </label>
                  <input
                    className={estilos.campo}
                    id="novoCpf"
                    type="text"
                    required
                    maxLength={14}
                    value={novo.cpf}
                    onChange={(e) =>
                      setNovo((atual) => ({ ...atual, cpf: e.target.value }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoVinculo">
                    Tipo de vínculo
                  </label>
                  <select
                    className={estilos.campo}
                    id="novoVinculo"
                    value={novo.tipo_vinculo}
                    onChange={(e) =>
                      setNovo((atual) => ({
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
                  <label className={estilos.rotulo} htmlFor="novaAdmissao">
                    Data de admissão
                  </label>
                  <input
                    className={estilos.campo}
                    id="novaAdmissao"
                    type="date"
                    required
                    value={novo.data_admissao}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        data_admissao: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoNascimento">
                    Data de nascimento
                  </label>
                  <input
                    className={estilos.campo}
                    id="novoNascimento"
                    type="date"
                    required
                    value={novo.data_nascimento}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        data_nascimento: e.target.value,
                      }))
                    }
                  />
                </div>
                {/* Autodeclarado: usado só em relatório agregado (diversidade),
                    nunca exibido na ficha nem na listagem. */}
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoGenero">
                    Gênero (autodeclarado)
                  </label>
                  <select
                    className={estilos.campo}
                    id="novoGenero"
                    value={novo.genero}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        genero: e.target.value as Genero,
                      }))
                    }
                  >
                    {GENEROS.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {ROTULOS_GENERO[opcao]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={estilos.campoGrupoLargo}>
                  <label className={estilos.rotulo} htmlFor="novoRetrato">
                    Retrato atual (opcional)
                  </label>
                  <textarea
                    className={estilos.campo}
                    id="novoRetrato"
                    rows={2}
                    maxLength={2000}
                    value={novo.retrato}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        retrato: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupoLargo}>
                  <label className={estilos.rotulo} htmlFor="novoContexto">
                    Contexto histórico (opcional)
                  </label>
                  <textarea
                    className={estilos.campo}
                    id="novoContexto"
                    rows={2}
                    maxLength={4000}
                    value={novo.contexto}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        contexto: e.target.value,
                      }))
                    }
                  />
                </div>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={criando}
                >
                  {criando ? "Criando…" : "Criar colaborador"}
                </button>
                <button
                  className={estilos.botaoLinha}
                  type="button"
                  onClick={() => {
                    setMostrarForm(false);
                    setErroCriacao(null);
                  }}
                >
                  Cancelar
                </button>
              </form>
            )}
            {erroCriacao && <p className={estilos.erro}>{erroCriacao}</p>}
            {senhaGerada && (
              <div className={estilos.avisoSenha}>
                <p>
                  Colaborador <strong>{senhaGerada.nome}</strong> criado. Senha
                  temporária de <strong>{senhaGerada.email}</strong>:
                </p>
                <code className={estilos.senha}>{senhaGerada.senha}</code>
                <p>
                  Copie agora e repasse à pessoa — esta senha não será exibida
                  novamente. Ela deve trocá-la no primeiro acesso.{" "}
                  <Link className={estilos.acao} href={`/colaboradores/${senhaGerada.id}`}>
                    Abrir ficha
                  </Link>
                </p>
              </div>
            )}
          </section>
        )}

        <form className={estilos.barraBusca} onSubmit={buscar}>
          <div className={estilos.campoGrupo}>
            <label className={estilos.rotulo} htmlFor="busca">
              Buscar por nome ou matrícula
            </label>
            <input
              className={estilos.campo}
              id="busca"
              type="text"
              maxLength={100}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className={estilos.campoGrupo}>
            <label className={estilos.rotulo} htmlFor="filtroStatus">
              Status
            </label>
            <select
              className={estilos.campo}
              id="filtroStatus"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos</option>
              {STATUS_COLABORADOR.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {ROTULOS_STATUS[opcao]}
                </option>
              ))}
            </select>
          </div>
          <button className={estilos.botao} type="submit">
            Buscar
          </button>
        </form>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando ? (
          <p className={estilos.subtitulo}>Carregando…</p>
        ) : colaboradores.length === 0 ? (
          <p className={estilos.vazio}>Nenhum colaborador encontrado.</p>
        ) : (
          <div className={estilos.grade}>
            {colaboradores.map((colaborador) => (
              <Link
                key={colaborador.id}
                className={estilos.cardColaborador}
                href={`/colaboradores/${colaborador.id}`}
              >
                <div className={estilos.avatar}>
                  {iniciais(colaborador.nome_completo)}
                </div>
                <div>
                  <h3>{colaborador.nome_completo}</h3>
                  <div className={estilos.cardSub}>
                    {colaborador.cargo_nome ?? "Sem cargo definido"} · matrícula{" "}
                    {colaborador.matricula}
                  </div>
                  <div className={estilos.chips}>
                    {colaborador.unidade && (
                      <span className={estilos.chip}>{colaborador.unidade}</span>
                    )}
                    <span
                      className={`${estilos.pill} ${ESTILO_PILL[colaborador.status]}`}
                    >
                      {ROTULOS_STATUS[colaborador.status]}
                    </span>
                    <span className={estilos.chip}>
                      admissão {formatarData(colaborador.data_admissao)}
                    </span>
                    <span className={estilos.chip}>
                      {ROTULOS_VINCULO[colaborador.tipo_vinculo]}
                    </span>
                    {alcance !== "proprio" &&
                      colaborador.status === "ativo" &&
                      colaborador.feedback_vencido && (
                        <span className={estilos.chipAlerta}>
                          feedback 90d vencido
                        </span>
                      )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {alcance === "proprio" && (
          <div className={estilos.aviso}>
            Como funcionário, você acessa apenas a própria ficha. Correções
            cadastrais são solicitadas ao DP.
          </div>
        )}
      </main>
    </div>
  );
}
