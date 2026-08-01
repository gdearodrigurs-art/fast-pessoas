import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { exigirVigenciaNaoFutura } from "../../lib/vigencia";
import { PayloadSessao } from "../identidade/esquemas";
import {
  CriacaoCentroCusto,
  CriacaoEmpresa,
  NovaVersaoCentroCusto,
  NovaVersaoEmpresa,
} from "./esquemas";
import {
  atualizarCnpjEmpresa,
  buscarCentroCusto,
  buscarEmpresa,
  buscarVersaoCentroCustoAtiva,
  buscarVersaoEmpresaAtiva,
  CentroCustoResumo,
  definirInativacaoCentroCusto,
  definirInativacaoEmpresa,
  EmpresaResumo,
  encerrarVersaoCentroCusto,
  encerrarVersaoEmpresa,
  existeEmpresaAtiva,
  inserirCentroCusto,
  inserirEmpresa,
  inserirVersaoCentroCusto,
  inserirVersaoEmpresa,
  listarCentrosCusto,
  listarCentrosCustoAtivos,
  listarEmpresas,
  listarEmpresasAtivas,
  OpcaoCentroCusto,
  OpcaoEmpresa,
} from "./repositorio";

// Regra do dono: empresa e centro de custo são administráveis pela tela —
// adicionar, renomear e inativar, sem chamar dev. Renomear NUNCA reescreve o
// passado: é versão nova com vigência, e a anterior é encerrada (o banco
// congela versão encerrada por trigger). Excluir não existe: quem tem gente
// apontando fica; o que se faz é inativar.

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ leitura

export async function listarEmpresasAdministraveis(): Promise<EmpresaResumo[]> {
  return listarEmpresas();
}

export async function listarCentrosCustoAdministraveis(): Promise<
  CentroCustoResumo[]
> {
  return listarCentrosCusto();
}

/** Seletores da alocação: só o que está ativo entra na escolha de hoje. */
export async function listarOpcoesDeEstrutura(): Promise<{
  empresas: OpcaoEmpresa[];
  centros_custo: OpcaoCentroCusto[];
}> {
  const [empresas, centros_custo] = await Promise.all([
    listarEmpresasAtivas(),
    listarCentrosCustoAtivos(),
  ]);
  return { empresas, centros_custo };
}

// ------------------------------------------------------------------ empresa do grupo

export async function criarEmpresa(
  sessao: PayloadSessao,
  dados: CriacaoEmpresa
): Promise<void> {
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const empresaId = await inserirEmpresa(cliente, dados.cnpj ?? null);
      const versaoId = await inserirVersaoEmpresa(cliente, {
        empresa_id: empresaId,
        razao_social: dados.razao_social ?? null,
        nome_fantasia: dados.nome_fantasia,
        tipo: dados.tipo,
        inicio_vigencia: dados.inicio_vigencia,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.empresa_grupo_versao",
        registroId: String(versaoId),
        diff: {
          CNPJ: { de: null, para: dados.cnpj ?? null },
          "Razão social": { de: null, para: dados.razao_social ?? null },
          "Nome fantasia": { de: null, para: dados.nome_fantasia },
          Tipo: { de: null, para: dados.tipo },
          "Início da vigência": {
            de: null,
            para: formatarData(dados.inicio_vigencia),
          },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "empresa_grupo_cnpj_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe uma empresa do grupo com este CNPJ.",
        "cnpj"
      );
    }
    throw erro;
  }
}

/** Renomear/reclassificar = nova versão vigente. O CNPJ é correção de cadastro. */
export async function criarVersaoEmpresa(
  sessao: PayloadSessao,
  empresaId: number,
  dados: NovaVersaoEmpresa
): Promise<void> {
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const empresa = await buscarEmpresa(cliente, empresaId);
      if (!empresa) throw new ErroHttp(404, "Empresa não encontrada.");
      await exigirVigenciaNaoFutura(cliente, dados.inicio_vigencia);
      const ativa = await buscarVersaoEmpresaAtiva(cliente, empresaId, true);
      if (ativa) {
        if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
          throw new ErroHttpCampo(
            400,
            `Início deve ser posterior à vigência atual (${formatarData(ativa.inicio_vigencia)}).`,
            "inicio_vigencia"
          );
        }
        await encerrarVersaoEmpresa(cliente, ativa.id, dados.inicio_vigencia);
      }
      const versaoId = await inserirVersaoEmpresa(cliente, {
        empresa_id: empresaId,
        razao_social: dados.razao_social ?? null,
        nome_fantasia: dados.nome_fantasia,
        tipo: dados.tipo,
        inicio_vigencia: dados.inicio_vigencia,
      });
      // O CNPJ não é versionado: é a identidade fiscal da empresa. Mudar aqui é
      // corrigir/completar o cadastro (a empresa nasceu sem número), não
      // "trocar de CNPJ" — isso seria outra empresa.
      const cnpjNovo = dados.cnpj ?? null;
      if (cnpjNovo !== empresa.cnpj) {
        await atualizarCnpjEmpresa(cliente, empresaId, cnpjNovo);
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.empresa_grupo_versao",
        registroId: String(versaoId),
        diff: {
          CNPJ: { de: empresa.cnpj, para: cnpjNovo },
          "Razão social": {
            de: ativa?.razao_social ?? null,
            para: dados.razao_social ?? null,
          },
          "Nome fantasia": {
            de: ativa?.nome_fantasia ?? null,
            para: dados.nome_fantasia,
          },
          Tipo: { de: ativa?.tipo ?? null, para: dados.tipo },
          "Início da vigência": {
            de: ativa ? formatarData(ativa.inicio_vigencia) : null,
            para: formatarData(dados.inicio_vigencia),
          },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "empresa_grupo_cnpj_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe uma empresa do grupo com este CNPJ.",
        "cnpj"
      );
    }
    throw erro;
  }
}

export async function definirEmpresaInativa(
  sessao: PayloadSessao,
  empresaId: number,
  inativo: boolean
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const empresa = await buscarEmpresa(cliente, empresaId);
    if (!empresa) throw new ErroHttp(404, "Empresa não encontrada.");
    if (inativo === (empresa.inativada_em !== null)) return;
    await definirInativacaoEmpresa(
      cliente,
      empresaId,
      inativo ? sessao.usuario_id : null
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "edicao",
      tabela: "rh.empresa_grupo",
      registroId: String(empresaId),
      diff: {
        Situação: {
          de: inativo ? "ativa" : "inativa",
          para: inativo ? "inativa" : "ativa",
        },
      },
    });
  });
}

// ------------------------------------------------------------------ centro de custo

export async function criarCentroCusto(
  sessao: PayloadSessao,
  dados: CriacaoCentroCusto
): Promise<void> {
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      if (!(await existeEmpresaAtiva(cliente, dados.empresa_id))) {
        throw new ErroHttpCampo(
          400,
          "Empresa inexistente ou inativa.",
          "empresa_id"
        );
      }
      const centroId = await inserirCentroCusto(cliente, {
        empresa_id: dados.empresa_id,
        codigo: dados.codigo,
      });
      const versaoId = await inserirVersaoCentroCusto(cliente, {
        centro_custo_id: centroId,
        nome: dados.nome,
        inicio_vigencia: dados.inicio_vigencia,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.centro_custo_versao",
        registroId: String(versaoId),
        diff: {
          Código: { de: null, para: dados.codigo },
          Nome: { de: null, para: dados.nome },
          "Início da vigência": {
            de: null,
            para: formatarData(dados.inicio_vigencia),
          },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "centro_custo_empresa_id_codigo_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe um centro de custo com este código nesta empresa.",
        "codigo"
      );
    }
    throw erro;
  }
}

/**
 * Renomear o centro de custo. O CÓDIGO não muda por aqui de propósito: ele é a
 * identidade contábil, está projetado em toda alocação e é o que amarra o
 * passado. O que a operação precisa mudar é o NOME, e nome é versionado.
 */
export async function criarVersaoCentroCusto(
  sessao: PayloadSessao,
  centroCustoId: number,
  dados: NovaVersaoCentroCusto
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const centro = await buscarCentroCusto(cliente, centroCustoId);
    if (!centro) throw new ErroHttp(404, "Centro de custo não encontrado.");
    await exigirVigenciaNaoFutura(cliente, dados.inicio_vigencia);
    const ativa = await buscarVersaoCentroCustoAtiva(
      cliente,
      centroCustoId,
      true
    );
    if (ativa) {
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(ativa.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarVersaoCentroCusto(
        cliente,
        ativa.id,
        dados.inicio_vigencia
      );
    }
    const versaoId = await inserirVersaoCentroCusto(cliente, {
      centro_custo_id: centroCustoId,
      nome: dados.nome,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.centro_custo_versao",
      registroId: String(versaoId),
      diff: {
        Nome: { de: ativa?.nome ?? null, para: dados.nome },
        "Início da vigência": {
          de: ativa ? formatarData(ativa.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}

export async function definirCentroCustoInativo(
  sessao: PayloadSessao,
  centroCustoId: number,
  inativo: boolean
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const centro = await buscarCentroCusto(cliente, centroCustoId);
    if (!centro) throw new ErroHttp(404, "Centro de custo não encontrado.");
    if (inativo === (centro.inativado_em !== null)) return;
    await definirInativacaoCentroCusto(
      cliente,
      centroCustoId,
      inativo ? sessao.usuario_id : null
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "edicao",
      tabela: "rh.centro_custo",
      registroId: String(centroCustoId),
      diff: {
        Situação: {
          de: inativo ? "ativo" : "inativo",
          para: inativo ? "inativo" : "ativo",
        },
      },
    });
  });
}
