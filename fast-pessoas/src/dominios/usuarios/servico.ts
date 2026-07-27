import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { Papel, PayloadSessao } from "../identidade/esquemas";
import {
  AtualizacaoUsuario,
  CriacaoUsuario,
  ROTULOS_PAPEL,
} from "./esquemas";
import {
  atualizar,
  buscarParaAtualizar,
  criar,
  idsAdminsAtivos,
  listar,
  UsuarioAdministravel,
} from "./repositorio";

const GRUPOS_SENHA = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnpqrstuvwxyz",
  "23456789",
  "!@#$%&*-_+=?",
];
const TAMANHO_SENHA = 16;

export function gerarSenhaTemporaria(): string {
  const todos = GRUPOS_SENHA.join("");
  const caracteres = GRUPOS_SENHA.map((grupo) => grupo[randomInt(grupo.length)]);
  while (caracteres.length < TAMANHO_SENHA) {
    caracteres.push(todos[randomInt(todos.length)]);
  }
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

export async function listarUsuarios(): Promise<UsuarioAdministravel[]> {
  return listar();
}

export async function criarUsuario(
  sessao: PayloadSessao,
  dados: CriacaoUsuario
): Promise<{ usuario: UsuarioAdministravel; senha_temporaria: string }> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await hash(senhaTemporaria, 12);
  try {
    const usuario = await comTransacao(sessao.usuario_id, async (cliente) => {
      const criado = await criar(cliente, { ...dados, senhaHash });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "sistema.usuario",
        registroId: String(criado.id),
        diff: {
          "E-mail": { de: null, para: criado.email },
          Nome: { de: null, para: criado.nome },
          Papel: { de: null, para: ROTULOS_PAPEL[criado.papel] },
          Ativo: { de: null, para: "Sim" },
        },
      });
      return criado;
    });
    return { usuario, senha_temporaria: senhaTemporaria };
  } catch (erro) {
    if (violacaoUnica(erro) === "usuario_email_unico") {
      throw new ErroHttpCampo(
        409,
        "Já existe um usuário com este e-mail.",
        "email"
      );
    }
    throw erro;
  }
}

export async function atualizarUsuario(
  sessao: PayloadSessao,
  id: number,
  dados: AtualizacaoUsuario
): Promise<UsuarioAdministravel> {
  if (dados.ativo === false && id === sessao.usuario_id) {
    throw new ErroHttp(400, "Você não pode desativar a si mesmo.");
  }

  return comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarParaAtualizar(cliente, id);
    if (!atual) {
      throw new ErroHttp(404, "Usuário não encontrado.");
    }

    const campos: { ativo?: boolean; papel?: Papel } = {};
    const diff: Diff = {};
    if (dados.papel !== undefined && dados.papel !== atual.papel) {
      campos.papel = dados.papel;
      diff.Papel = {
        de: ROTULOS_PAPEL[atual.papel],
        para: ROTULOS_PAPEL[dados.papel],
      };
    }
    if (dados.ativo !== undefined && dados.ativo !== atual.ativo) {
      campos.ativo = dados.ativo;
      diff.Ativo = {
        de: atual.ativo ? "Sim" : "Não",
        para: dados.ativo ? "Sim" : "Não",
      };
    }
    if (Object.keys(campos).length === 0) {
      return atual;
    }

    const deixaDeSerAdminAtivo =
      atual.papel === "admin" &&
      atual.ativo &&
      ((campos.papel !== undefined && campos.papel !== "admin") ||
        campos.ativo === false);
    if (deixaDeSerAdminAtivo) {
      const admins = await idsAdminsAtivos(cliente);
      if (admins.filter((adminId) => adminId !== id).length === 0) {
        throw new ErroHttp(
          409,
          "Não é possível desativar ou rebaixar o último administrador ativo."
        );
      }
    }

    await atualizar(cliente, id, campos);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: "sistema.usuario",
      registroId: String(id),
      diff,
    });
    return { ...atual, ...campos };
  });
}
