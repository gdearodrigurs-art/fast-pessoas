"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  FILTRO_ESTRUTURA_VAZIO,
  FiltroEstrutura,
  filtroEstruturaAtivo,
  parametrosFiltroEstrutura,
  type OpcoesFiltroEstrutura,
  type ValorFiltroEstrutura,
} from "@/app/filtro-estrutura";
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
  /** Os TRÊS da 0047, cada um com rótulo próprio no cartão. */
  empresa_nome: string | null;
  unidade: string | null;
  centro_custo: string | null;
  centro_custo_nome: string | null;
  feedback_vencido: boolean;
}

/**
 * O catálogo mínimo (decisão A4:a): o resto do quadro para quem não alcança a
 * empresa inteira. Só nome, cargo e unidade — o clique abre a ficha em modo
 * crachá, que soma o contato corporativo e o líder, e nada além.
 */
interface ColegaMinimo {
  id: number;
  nome_completo: string;
  cargo_nome: string | null;
  unidade: string | null;
}

/**
 * O que o servidor devolve no 409 quando o CPF digitado já é de gente do grupo.
 * A tela existe para MOSTRAR isto antes de perguntar — confirmar "é a mesma
 * pessoa?" sem ver de quem se fala é o mesmo que juntar duas pessoas no escuro.
 */
interface PessoaReconhecida {
  id: number;
  nome_completo: string;
  conta_email: string | null;
  conta_ativa: boolean;
  vinculos: {
    id: number;
    matricula: string;
    tipo_vinculo: TipoVinculo;
    status: StatusColaborador;
    data_admissao: string;
    data_desligamento: string | null;
    empresa_nome: string | null;
  }[];
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
  const [colegasMinimos, setColegasMinimos] = useState<ColegaMinimo[]>([]);
  const [alcance, setAlcance] = useState<string>("todos");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  // Os três campos nascem VAZIOS: em branco = todos. Nenhum valor padrão de
  // negócio é inventado aqui — quem escolhe o recorte é quem está lendo.
  const [estrutura, setEstrutura] = useState<ValorFiltroEstrutura>(
    FILTRO_ESTRUTURA_VAZIO
  );
  const [opcoesEstrutura, setOpcoesEstrutura] =
    useState<OpcoesFiltroEstrutura | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erroCriacao, setErroCriacao] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{
    nome: string;
    email: string;
    senha: string;
    id: number;
  } | null>(null);
  // O 409 "este CPF já é de alguém" vira PERGUNTA, não erro vermelho.
  const [reconhecida, setReconhecida] = useState<PessoaReconhecida | null>(null);
  const [vinculoAberto, setVinculoAberto] = useState<{
    nome: string;
    matricula: string;
    id: number;
    conta_email: string | null;
    conta_reativada: boolean;
    vinculo_anterior: string | null;
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
    telefone_corporativo: "",
    email_corporativo: "",
    retrato: "",
    contexto: "",
  });

  const carregar = useCallback(
    async (
      buscaAtual: string,
      statusAtual: string,
      estruturaAtual: ValorFiltroEstrutura
    ) => {
      setCarregando(true);
      setErro(null);
      try {
        const parametros = new URLSearchParams();
        if (buscaAtual.trim()) parametros.set("busca", buscaAtual.trim());
        if (statusAtual) parametros.set("status", statusAtual);
        parametrosFiltroEstrutura(estruturaAtual, parametros);
        const consulta = parametros.toString();
        const resposta = await fetch(
          `/api/colaboradores${consulta ? `?${consulta}` : ""}`
        );
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.ok) {
          setColaboradores(dados.colaboradores ?? []);
          setColegasMinimos(dados.colegas_minimos ?? []);
          setAlcance(dados.alcance ?? "todos");
          setOpcoesEstrutura(dados.estrutura_opcoes ?? null);
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
      await carregar("", "", FILTRO_ESTRUTURA_VAZIO);
    })();
  }, [carregar]);

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    carregar(busca, status, estrutura);
  }

  /** Mexer num dos três recarrega na hora — não faz sentido "aplicar" depois. */
  function mudarEstrutura(valor: ValorFiltroEstrutura) {
    setEstrutura(valor);
    void carregar(busca, status, valor);
  }

  function limparFormulario() {
    setNovo({
      nome_completo: "",
      email: "",
      matricula: "",
      cpf: "",
      tipo_vinculo: "clt",
      data_admissao: "",
      data_nascimento: "",
      genero: "nao_informado",
      telefone_corporativo: "",
      email_corporativo: "",
      retrato: "",
      contexto: "",
    });
  }

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroCriacao(null);
    setSenhaGerada(null);
    setVinculoAberto(null);
    setReconhecida(null);
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
          // Da PESSOA (A7:b): opcionais na admissão. Raça-cor não entra —
          // é autodeclaração da própria pessoa, pelo portal (A5:b).
          telefone_corporativo: novo.telefone_corporativo.trim() || undefined,
          email_corporativo: novo.email_corporativo.trim() || undefined,
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
        limparFormulario();
        carregar(busca, status, estrutura);
      } else if (
        resposta.status === 409 &&
        dados.confirmacao === "pessoa_ja_cadastrada" &&
        dados.detalhe?.pessoa
      ) {
        // Não é recusa: o CPF é de alguém que já esteve na casa e não tem mais
        // vínculo em pé. A tela mostra QUEM é e pergunta. Os outros 409 desta
        // rota (CPF de quem está ativo, matrícula em uso) continuam erro:
        // insistir neles traria o mesmo erro de volta.
        setReconhecida(dados.detalhe.pessoa as PessoaReconhecida);
      } else {
        setErroCriacao(dados.erro ?? "Não foi possível criar o colaborador.");
      }
    } catch {
      setErroCriacao("Falha de conexão. Tente novamente.");
    } finally {
      setCriando(false);
    }
  }

  /**
   * O "sim, é a mesma pessoa". Manda SÓ o contrato mais o id que a tela acabou
   * de mostrar: nome, e-mail, nascimento e gênero NÃO vão — são da pessoa, já
   * existem, e reenviá-los daria um jeito de sobrescrever, pela tela de
   * admissão, o cadastro de quem já está na casa.
   */
  async function abrirNovoVinculo(pessoa: PessoaReconhecida) {
    setErroCriacao(null);
    setCriando(true);
    try {
      const resposta = await fetch("/api/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmar_pessoa_id: pessoa.id,
          cpf: novo.cpf,
          matricula: novo.matricula,
          tipo_vinculo: novo.tipo_vinculo,
          data_admissao: novo.data_admissao,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setReconhecida(null);
        setVinculoAberto({
          nome: dados.colaborador.nome_completo,
          matricula: dados.colaborador.matricula,
          id: dados.colaborador.id,
          conta_email: dados.pessoa_reaproveitada?.conta_email ?? null,
          conta_reativada: Boolean(dados.pessoa_reaproveitada?.conta_reativada),
          vinculo_anterior: dados.pessoa_reaproveitada?.vinculo_anterior ?? null,
        });
        limparFormulario();
        carregar(busca, status, estrutura);
      } else {
        setErroCriacao(dados.erro ?? "Não foi possível abrir o novo vínculo.");
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
        ? "Sua ficha e sua equipe (sub-árvore vigente: liderados diretos e indiretos)"
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
                {/* Contato corporativo é DA PESSOA (A7:b) — o mesmo em todos
                    os vínculos dela; faz parte do crachá público (A4:a). */}
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoTelCorp">
                    Telefone corporativo (opcional)
                  </label>
                  <input
                    className={estilos.campo}
                    id="novoTelCorp"
                    type="text"
                    maxLength={40}
                    value={novo.telefone_corporativo}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        telefone_corporativo: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="novoEmailCorp">
                    E-mail corporativo (opcional)
                  </label>
                  <input
                    className={estilos.campo}
                    id="novoEmailCorp"
                    type="email"
                    maxLength={254}
                    value={novo.email_corporativo}
                    onChange={(e) =>
                      setNovo((atual) => ({
                        ...atual,
                        email_corporativo: e.target.value,
                      }))
                    }
                  />
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

            {/* CPF reconhecido: a tela DIZ de quem é antes de perguntar.
                Sem este bloco, confirmar "é a mesma pessoa" seria assinar em
                branco — e juntar duas pessoas num CPF só é irreversível. */}
            {reconhecida && (
              <div className={estilos.reconhecida}>
                <h3>CPF já cadastrado: {reconhecida.nome_completo}</h3>
                <p>
                  Este CPF já é de gente do grupo, e ela não tem mais nenhum
                  vínculo em pé. Confira se é a mesma pessoa:
                </p>
                <ul className={estilos.vinculosAnteriores}>
                  {reconhecida.vinculos.map((vinculo) => (
                    <li key={vinculo.id}>
                      Matrícula {vinculo.matricula} —{" "}
                      {vinculo.empresa_nome ?? "sem registro definido"} —{" "}
                      {ROTULOS_VINCULO[vinculo.tipo_vinculo]}, admitida em{" "}
                      {formatarData(vinculo.data_admissao)}
                      {vinculo.data_desligamento
                        ? `, desligada em ${formatarData(vinculo.data_desligamento)}`
                        : ""}
                    </li>
                  ))}
                </ul>
                <p>
                  Confirmando, nasce <strong>só o vínculo novo</strong>: matrícula{" "}
                  <strong>{novo.matricula || "(informe a matrícula)"}</strong>,{" "}
                  {ROTULOS_VINCULO[novo.tipo_vinculo]}, admissão em{" "}
                  <strong>
                    {novo.data_admissao
                      ? formatarData(novo.data_admissao)
                      : "(informe a data)"}
                  </strong>
                  . CPF, nome, nascimento e o histórico continuam sendo os dela, e o
                  acesso volta a ser{" "}
                  <strong>{reconhecida.conta_email ?? "a conta já existente"}</strong>{" "}
                  com a mesma senha — nenhuma conta nova, nenhum dado sobrescrito.
                </p>
                <div className={estilos.acoesReconhecida}>
                  <button
                    className={estilos.botao}
                    type="button"
                    disabled={criando}
                    onClick={() => abrirNovoVinculo(reconhecida)}
                  >
                    {criando
                      ? "Abrindo…"
                      : "É a mesma pessoa — abrir novo vínculo"}
                  </button>
                  <button
                    className={estilos.botaoLinha}
                    type="button"
                    disabled={criando}
                    onClick={() => {
                      setReconhecida(null);
                      setNovo((atual) => ({ ...atual, cpf: "" }));
                    }}
                  >
                    Não é a mesma pessoa — corrigir o CPF
                  </button>
                </div>
              </div>
            )}

            {vinculoAberto && (
              <div className={estilos.reconhecida}>
                <p>
                  Novo vínculo aberto para <strong>{vinculoAberto.nome}</strong> —
                  matrícula <strong>{vinculoAberto.matricula}</strong>. A pessoa é a
                  mesma: CPF, cadastro e histórico foram reaproveitados.
                </p>
                {vinculoAberto.vinculo_anterior && (
                  <p>Vínculo anterior: {vinculoAberto.vinculo_anterior}.</p>
                )}
                <p>
                  Acesso:{" "}
                  <strong>{vinculoAberto.conta_email ?? "conta existente"}</strong>{" "}
                  {vinculoAberto.conta_reativada
                    ? "— a conta estava desativada e foi reaberta, com a MESMA senha de antes (nenhuma senha nova foi gerada)."
                    : "— a conta já estava ativa, com a MESMA senha de antes."}{" "}
                  <Link
                    className={estilos.acao}
                    href={`/colaboradores/${vinculoAberto.id}`}
                  >
                    Abrir ficha
                  </Link>
                </p>
              </div>
            )}

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

        {/* Os três campos do dono, combináveis entre si e com a busca acima.
            O que a API devolve é o mesmo que os cartões mostram: o registro,
            a lotação e o centro de custo da alocação vigente do vínculo (ou da
            última, quando o contrato acabou). */}
        <section className={estilos.cartao}>
          <h2>Recorte por registro, lotação e centro de custo</h2>
          <FiltroEstrutura
            prefixoId="colab"
            opcoes={opcoesEstrutura}
            valor={estrutura}
            aoMudar={mudarEstrutura}
            desabilitado={carregando}
          />
        </section>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando ? (
          <p className={estilos.subtitulo}>Carregando…</p>
        ) : colaboradores.length === 0 ? (
          <p className={estilos.vazio}>
            Nenhum colaborador encontrado
            {filtroEstruturaAtivo(estrutura)
              ? " com este recorte de registro, lotação e centro de custo."
              : "."}
          </p>
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
                    {/* Cada um dos três com rótulo próprio: sem rótulo, três
                        nomes soltos no cartão viram adivinhação. */}
                    {colaborador.empresa_nome && (
                      <span className={estilos.chip}>
                        registro: {colaborador.empresa_nome}
                      </span>
                    )}
                    {colaborador.unidade && (
                      <span className={estilos.chip}>
                        lotação: {colaborador.unidade}
                      </span>
                    )}
                    {colaborador.centro_custo && (
                      <span className={estilos.chip}>
                        centro de custo: {colaborador.centro_custo}
                        {colaborador.centro_custo_nome &&
                        colaborador.centro_custo_nome !==
                          colaborador.centro_custo
                          ? ` — ${colaborador.centro_custo_nome}`
                          : ""}
                      </span>
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

        {/* A4:a — o catálogo mínimo: o resto do quadro, visível a todo logado
            só com nome, cargo e unidade. O clique abre a ficha em modo crachá.
            A busca por nome se aplica; status e recorte de estrutura são
            filtros de FICHA e não alcançam este catálogo. */}
        {!carregando && colegasMinimos.length > 0 && (
          <section className={estilos.cartao} style={{ marginTop: 16 }}>
            <h2>Demais colegas — catálogo mínimo</h2>
            <p className={estilos.subtitulo}>
              Todo colaborador logado vê o crachá de qualquer colega: nome,
              cargo, unidade, contato corporativo e líder atual — e nada além.
            </p>
            <div className={estilos.grade}>
              {colegasMinimos.map((colega) => (
                <Link
                  key={colega.id}
                  className={estilos.cardColaborador}
                  href={`/colaboradores/${colega.id}`}
                >
                  <div className={estilos.avatar}>
                    {iniciais(colega.nome_completo)}
                  </div>
                  <div>
                    <h3>{colega.nome_completo}</h3>
                    <div className={estilos.cardSub}>
                      {colega.cargo_nome ?? "Sem cargo definido"}
                    </div>
                    <div className={estilos.chips}>
                      {colega.unidade && (
                        <span className={estilos.chip}>
                          lotação: {colega.unidade}
                        </span>
                      )}
                      <span className={estilos.chip}>crachá</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {alcance === "proprio" && (
          <div className={estilos.aviso}>
            Como funcionário, você acessa a própria ficha completa; dos colegas,
            o catálogo mínimo acima (crachá). Correções cadastrais são
            solicitadas ao DP.
          </div>
        )}
      </main>
    </div>
  );
}
