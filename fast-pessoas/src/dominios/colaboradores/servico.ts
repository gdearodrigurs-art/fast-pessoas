import { hash } from "bcryptjs";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { criar as criarUsuario } from "../usuarios/repositorio";
import { gerarSenhaTemporaria } from "../usuarios/servico";
import {
  AtualizacaoColaborador,
  CriacaoColaborador,
  FiltroColaboradores,
  ROTULOS_STATUS,
  ROTULOS_VINCULO,
} from "./esquemas";
import {
  atualizar,
  buscarFicha,
  buscarParaAtualizar,
  CamposColaborador,
  ColaboradorResumo,
  criar,
  desativarUsuario,
  EventoLinhaTempo,
  FichaColaborador,
  inserirEvento,
  listar,
  listarEventos,
} from "./repositorio";

const ORIGEM_COLABORADOR = "rh.colaborador";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function mapearConflito(erro: unknown): never {
  const restricao = violacaoUnica(erro);
  if (restricao === "usuario_email_unico") {
    throw new ErroHttpCampo(409, "Já existe um usuário com este e-mail.", "email");
  }
  if (restricao === "colaborador_matricula_key") {
    throw new ErroHttpCampo(
      409,
      "Já existe um colaborador com esta matrícula.",
      "matricula"
    );
  }
  if (restricao === "colaborador_cpf_key") {
    throw new ErroHttpCampo(409, "Já existe um colaborador com este CPF.", "cpf");
  }
  throw erro;
}

export async function listarColaboradores(
  filtro: FiltroColaboradores
): Promise<ColaboradorResumo[]> {
  return listar(filtro);
}

export async function obterColaborador(id: number): Promise<{
  colaborador: FichaColaborador;
  linha_do_tempo: EventoLinhaTempo[];
}> {
  const ficha = await buscarFicha(id);
  if (!ficha) {
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
  const linhaDoTempo = await listarEventos(id);
  return { colaborador: ficha, linha_do_tempo: linhaDoTempo };
}

export async function criarColaborador(
  sessao: PayloadSessao,
  dados: CriacaoColaborador
): Promise<{ colaborador: ColaboradorResumo; senha_temporaria: string }> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await hash(senhaTemporaria, 12);
  try {
    const colaborador = await comTransacao(
      sessao.usuario_id,
      async (cliente) => {
        const usuario = await criarUsuario(cliente, {
          email: dados.email,
          nome: dados.nome_completo,
          papel: "funcionario",
          senhaHash,
        });
        const criado = await criar(cliente, {
          usuario_id: usuario.id,
          matricula: dados.matricula,
          matricula_esocial: dados.matricula,
          cpf: dados.cpf,
          nome_completo: dados.nome_completo,
          tipo_vinculo: dados.tipo_vinculo,
          data_admissao: dados.data_admissao,
          retrato: dados.retrato ?? null,
          contexto: dados.contexto ?? null,
        });
        await inserirEvento(cliente, {
          colaborador_id: criado.id,
          tipo: "admissao",
          ocorrido_em: `${dados.data_admissao}T00:00:00Z`,
          origem_tabela: ORIGEM_COLABORADOR,
          origem_id: criado.id,
          resumo: `Admissão de ${dados.nome_completo} (matrícula ${dados.matricula}) como ${ROTULOS_VINCULO[dados.tipo_vinculo]} em ${formatarData(dados.data_admissao)}`,
          payload: {
            tipo_vinculo: dados.tipo_vinculo,
            data_admissao: dados.data_admissao,
          },
          registrado_por: sessao.usuario_id,
        });
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: "sistema.usuario",
          registroId: String(usuario.id),
          diff: {
            "E-mail": { de: null, para: usuario.email },
            Nome: { de: null, para: usuario.nome },
            Papel: { de: null, para: "Funcionário" },
            Ativo: { de: null, para: "Sim" },
          },
        });
        const diffColaborador: Diff = {
          "Matrícula": { de: null, para: dados.matricula },
          CPF: { de: null, para: dados.cpf },
          "Nome completo": { de: null, para: dados.nome_completo },
          "Vínculo": { de: null, para: ROTULOS_VINCULO[dados.tipo_vinculo] },
          "Data de admissão": {
            de: null,
            para: formatarData(dados.data_admissao),
          },
          Status: { de: null, para: ROTULOS_STATUS.ativo },
        };
        if (dados.retrato) {
          diffColaborador.Retrato = { de: null, para: dados.retrato };
        }
        if (dados.contexto) {
          diffColaborador.Contexto = { de: null, para: dados.contexto };
        }
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: ORIGEM_COLABORADOR,
          registroId: String(criado.id),
          diff: diffColaborador,
        });
        return criado;
      }
    );
    return { colaborador, senha_temporaria: senhaTemporaria };
  } catch (erro) {
    mapearConflito(erro);
  }
}

export async function atualizarColaborador(
  sessao: PayloadSessao,
  id: number,
  dados: AtualizacaoColaborador
): Promise<FichaColaborador> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarParaAtualizar(cliente, id);
    if (!atual) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }

    const campos: CamposColaborador = {};
    const diff: Diff = {};

    if (
      dados.nome_completo !== undefined &&
      dados.nome_completo !== atual.nome_completo
    ) {
      campos.nome_completo = dados.nome_completo;
      diff["Nome completo"] = {
        de: atual.nome_completo,
        para: dados.nome_completo,
      };
    }
    if (dados.retrato !== undefined && dados.retrato !== atual.retrato) {
      campos.retrato = dados.retrato;
      diff.Retrato = { de: atual.retrato, para: dados.retrato };
    }
    if (dados.contexto !== undefined && dados.contexto !== atual.contexto) {
      campos.contexto = dados.contexto;
      diff.Contexto = { de: atual.contexto, para: dados.contexto };
    }
    if (
      dados.tipo_vinculo !== undefined &&
      dados.tipo_vinculo !== atual.tipo_vinculo
    ) {
      campos.tipo_vinculo = dados.tipo_vinculo;
      diff["Vínculo"] = {
        de: ROTULOS_VINCULO[atual.tipo_vinculo],
        para: ROTULOS_VINCULO[dados.tipo_vinculo],
      };
    }
    if (dados.status !== undefined) {
      if (dados.status !== atual.status) {
        campos.status = dados.status;
        diff.Status = {
          de: ROTULOS_STATUS[atual.status],
          para: ROTULOS_STATUS[dados.status],
        };
      }
      if (
        dados.status === "desligado" &&
        dados.data_desligamento !== undefined &&
        dados.data_desligamento !== atual.data_desligamento
      ) {
        campos.data_desligamento = dados.data_desligamento;
        diff["Data de desligamento"] = {
          de: atual.data_desligamento
            ? formatarData(atual.data_desligamento)
            : null,
          para: formatarData(dados.data_desligamento),
        };
      }
      if (
        dados.status !== "desligado" &&
        campos.status !== undefined &&
        atual.data_desligamento !== null
      ) {
        campos.data_desligamento = null;
        diff["Data de desligamento"] = {
          de: formatarData(atual.data_desligamento),
          para: null,
        };
      }
    }

    if (Object.keys(campos).length === 0) {
      return;
    }

    await atualizar(cliente, id, campos);

    const desligando =
      campos.status === "desligado" && dados.data_desligamento !== undefined;
    if (desligando && dados.data_desligamento) {
      if (atual.usuario_ativo) {
        await desativarUsuario(cliente, atual.usuario_id);
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "atualizacao",
          tabela: "sistema.usuario",
          registroId: String(atual.usuario_id),
          diff: { Ativo: { de: "Sim", para: "Não" } },
        });
      }
      await inserirEvento(cliente, {
        colaborador_id: id,
        tipo: "desligamento",
        ocorrido_em: `${dados.data_desligamento}T00:00:00Z`,
        origem_tabela: ORIGEM_COLABORADOR,
        origem_id: id,
        resumo: `Desligamento de ${atual.nome_completo} (matrícula ${atual.matricula}) em ${formatarData(dados.data_desligamento)}`,
        payload: { data_desligamento: dados.data_desligamento },
        registrado_por: sessao.usuario_id,
      });
    } else if (campos.status !== undefined) {
      await inserirEvento(cliente, {
        colaborador_id: id,
        tipo: "alteracao_status",
        ocorrido_em: new Date().toISOString(),
        origem_tabela: ORIGEM_COLABORADOR,
        origem_id: id,
        resumo: `Status de ${atual.nome_completo} alterado de ${ROTULOS_STATUS[atual.status]} para ${ROTULOS_STATUS[campos.status]}`,
        payload: { de: atual.status, para: campos.status },
        registrado_por: sessao.usuario_id,
      });
    }
    if (campos.tipo_vinculo !== undefined) {
      await inserirEvento(cliente, {
        colaborador_id: id,
        tipo: "alteracao_vinculo",
        ocorrido_em: new Date().toISOString(),
        origem_tabela: ORIGEM_COLABORADOR,
        origem_id: id,
        resumo: `Vínculo de ${atual.nome_completo} alterado de ${ROTULOS_VINCULO[atual.tipo_vinculo]} para ${ROTULOS_VINCULO[campos.tipo_vinculo]}`,
        payload: { de: atual.tipo_vinculo, para: campos.tipo_vinculo },
        registrado_por: sessao.usuario_id,
      });
    }

    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: ORIGEM_COLABORADOR,
      registroId: String(id),
      diff,
    });
  });

  const ficha = await buscarFicha(id);
  if (!ficha) {
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
  return ficha;
}
