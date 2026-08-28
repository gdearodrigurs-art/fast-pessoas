import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PAPEIS, Papel, PayloadSessao } from "../identidade/esquemas";
import { limparBloqueioTotp } from "../identidade/repositorio";
import {
  AtualizacaoUsuario,
  CHAVES_INDISPENSAVEIS_ADMIN,
  ComposicaoPerfil,
  CriacaoUsuario,
  DESCRICOES_PAPEL,
  chaveSensivel,
  grupoDaChave,
  ORDEM_GRUPOS,
  ROTULOS_PAPEL,
} from "./esquemas";
import {
  atualizar,
  buscarParaAtualizar,
  chavesDoPapelParaAtualizar,
  conceder,
  contarUsuariosDoPapel,
  contarUsuariosPorPapel,
  criar,
  descricoesDasChaves,
  idsAdminsAtivos,
  listar,
  listarCatalogoPermissoes,
  listarVinculosPapelPermissao,
  revogar,
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
    // Reativar devolve as 5 tentativas de TOTP inteiras: limpa o bloqueio
    // temporário e o contador de falhas (regra 0087 — C1 modificada).
    if (campos.ativo === true) await limparBloqueioTotp(cliente, id);
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

// ---------------------------------------------------------------------------
// Perfis de acesso — composição papel × chave (tela /perfis)
// ---------------------------------------------------------------------------
// Por que isto existe: até a migration 0019 a composição papel → chave vivia
// congelada em migration, e foi exatamente por isso que o papel `rh` virou
// balaio (acumulou R&S + histórico de DP). RBAC só é ferramenta de gestão
// quando o administrador consegue recompor perfil sem chamar dev — com trava
// para não trancar o sistema e trilha de auditoria em cada mudança.

export interface ChaveCatalogo {
  chave: string;
  descricao: string;
  grupo: string;
  /** Abre dado sensível (remuneração, saúde, sigilo) — a tela marca com selo. */
  sensivel: boolean;
}

export interface PerfilResumo {
  papel: string;
  rotulo: string;
  descricao: string;
  chaves: string[];
  usuarios_total: number;
  usuarios_ativos: number;
  /** Chaves que este papel não pode perder (a tela desabilita a caixa). */
  travadas: string[];
  /** Papel presente em papel_permissao mas fora do CHECK — só leitura. */
  editavel: boolean;
}

export interface PainelPerfis {
  catalogo: ChaveCatalogo[];
  /** Grupos com ao menos uma chave, na ordem de exibição. */
  grupos: string[];
  perfis: PerfilResumo[];
}

function ordenarGrupos(grupos: Set<string>): string[] {
  const conhecidos = ORDEM_GRUPOS.filter((grupo) => grupos.has(grupo));
  const resto = [...grupos]
    .filter((grupo) => !ORDEM_GRUPOS.includes(grupo))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...conhecidos, ...resto];
}

function travadasDoPapel(papel: string): string[] {
  return papel === "admin" ? [...CHAVES_INDISPENSAVEIS_ADMIN] : [];
}

export async function montarPainelPerfis(): Promise<PainelPerfis> {
  const [permissoes, vinculos, contagens] = await Promise.all([
    listarCatalogoPermissoes(),
    listarVinculosPapelPermissao(),
    contarUsuariosPorPapel(),
  ]);

  const catalogo: ChaveCatalogo[] = permissoes.map((permissao) => ({
    chave: permissao.chave,
    descricao: permissao.descricao,
    grupo: grupoDaChave(permissao.chave),
    sensivel: chaveSensivel(permissao.chave),
  }));

  const porPapel = new Map<string, string[]>();
  for (const vinculo of vinculos) {
    const lista = porPapel.get(vinculo.papel);
    if (lista) lista.push(vinculo.chave);
    else porPapel.set(vinculo.papel, [vinculo.chave]);
  }
  const contagemPorPapel = new Map(
    contagens.map((contagem) => [contagem.papel, contagem])
  );

  // Papéis do CHECK primeiro, na ordem canônica; depois qualquer papel órfão
  // que exista em papel_permissao mas não no CHECK (só leitura na tela — o
  // caminho para corrigir é migration, não a interface).
  const papeisConhecidos = PAPEIS as readonly string[];
  const orfaos = [...porPapel.keys()]
    .filter((papel) => !papeisConhecidos.includes(papel))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const perfis: PerfilResumo[] = [...papeisConhecidos, ...orfaos].map(
    (papel) => {
      const contagem = contagemPorPapel.get(papel);
      const conhecido = papeisConhecidos.includes(papel);
      return {
        papel,
        rotulo: conhecido ? ROTULOS_PAPEL[papel as Papel] : papel,
        descricao: conhecido
          ? DESCRICOES_PAPEL[papel as Papel]
          : "Papel fora da lista oficial do sistema — exibido apenas para conferência.",
        chaves: (porPapel.get(papel) ?? []).slice().sort(),
        usuarios_total: contagem?.total ?? 0,
        usuarios_ativos: contagem?.ativos ?? 0,
        travadas: travadasDoPapel(papel),
        editavel: conhecido,
      };
    }
  );

  return {
    catalogo,
    grupos: ordenarGrupos(new Set(catalogo.map((item) => item.grupo))),
    perfis,
  };
}

export interface ResultadoComposicao {
  perfil: PerfilResumo;
  concedidas: string[];
  revogadas: string[];
}

export async function atualizarPerfil(
  sessao: PayloadSessao,
  papel: Papel,
  dados: ComposicaoPerfil
): Promise<ResultadoComposicao> {
  const desejadas = new Set(dados.chaves);

  // Trava 1 — o sistema não pode se trancar: o papel `admin` sempre mantém
  // usuario.administrar e perfil.administrar. Sem elas, ninguém mais
  // administraria contas nem perfis e a saída seria SQL direto no banco.
  const travadas = travadasDoPapel(papel);
  const faltando = travadas.filter((chave) => !desejadas.has(chave));
  if (faltando.length > 0) {
    throw new ErroHttp(
      409,
      `O papel ${ROTULOS_PAPEL[papel]} não pode perder ${faltando.join(" e ")} — ` +
        "sem essas chaves ninguém conseguiria mais administrar o sistema."
    );
  }

  // Trava 2 — o administrador não retira do PRÓPRIO papel a chave que o deixa
  // administrar. Vale para qualquer papel que venha a receber essas chaves
  // (hoje só `admin`, mas a tela permite compor).
  if (papel === sessao.papel) {
    for (const chave of CHAVES_INDISPENSAVEIS_ADMIN) {
      if (!desejadas.has(chave)) {
        throw new ErroHttp(
          409,
          `Você está editando o seu próprio papel (${ROTULOS_PAPEL[papel]}) e ` +
            `removeria ${chave} de si mesmo. Peça a outro administrador.`
        );
      }
    }
  }

  return comTransacao(sessao.usuario_id, async (cliente) => {
    const atuais = await chavesDoPapelParaAtualizar(cliente, papel);
    const atual = new Set(atuais);

    const concedidas = [...desejadas].filter((chave) => !atual.has(chave)).sort();
    const revogadas = atuais.filter((chave) => !desejadas.has(chave));

    const contagem = await contarUsuariosDoPapel(cliente, papel);

    if (concedidas.length === 0 && revogadas.length === 0) {
      return {
        perfil: {
          papel,
          rotulo: ROTULOS_PAPEL[papel],
          descricao: DESCRICOES_PAPEL[papel],
          chaves: atuais,
          usuarios_total: contagem.total,
          usuarios_ativos: contagem.ativos,
          travadas,
          editavel: true,
        },
        concedidas: [],
        revogadas: [],
      };
    }

    // Rótulo da chave vem do catálogo do banco — e serve de validação: chave
    // desconhecida não chega ao INSERT (que a FK rejeitaria com erro cru).
    const rotulos = await descricoesDasChaves(cliente, [
      ...concedidas,
      ...revogadas,
    ]);
    const desconhecida = concedidas.find((chave) => !rotulos.has(chave));
    if (desconhecida) {
      throw new ErroHttp(
        400,
        `A chave de permissão "${desconhecida}" não existe no catálogo.`
      );
    }

    await conceder(cliente, papel, concedidas);
    await revogar(cliente, papel, revogadas);

    const diff: Diff = {};
    for (const chave of concedidas) {
      diff[`${rotulos.get(chave) ?? chave} (${chave})`] = {
        de: "Sem acesso",
        para: "Concedida",
      };
    }
    for (const chave of revogadas) {
      diff[`${rotulos.get(chave) ?? chave} (${chave})`] = {
        de: "Concedida",
        para: "Sem acesso",
      };
    }
    diff["Usuários afetados"] = {
      de: null,
      para: `${contagem.ativos} ativo(s) de ${contagem.total} com o papel ${ROTULOS_PAPEL[papel]}`,
    };

    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "composicao_perfil",
      tabela: "sistema.papel_permissao",
      registroId: papel,
      diff,
    });

    return {
      perfil: {
        papel,
        rotulo: ROTULOS_PAPEL[papel],
        descricao: DESCRICOES_PAPEL[papel],
        chaves: [...desejadas].sort(),
        usuarios_total: contagem.total,
        usuarios_ativos: contagem.ativos,
        travadas,
        editavel: true,
      },
      concedidas,
      revogadas,
    };
  });
}
