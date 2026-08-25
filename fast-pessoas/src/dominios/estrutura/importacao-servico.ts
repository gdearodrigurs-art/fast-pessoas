// Importadores da CARGA INICIAL (Onda 3, decisões F1:a e F2:b do dono):
// estrutura (empresa do grupo, estabelecimento, centro de custo) e cargos/RCF,
// por planilha CSV. O layout NOSSO está em importacao-analise.ts.
//
// AS TRÊS REGRAS DESTE ARQUIVO:
//
//   1. Validação LINHA A LINHA (molde ponto/servico.ts importarMarcacoes):
//      linha ruim vira rejeição com motivo no relatório e o resto entra.
//
//   2. IDEMPOTENTE: linha cuja identidade já existe (CNPJ; nome normalizado;
//      código do CC na empresa certa) conta como "já existia" — nem erro, nem
//      duplicata. Reimportar o mesmo arquivo é seguro por construção.
//
//   3. REUSO dos serviços de criação (criarEmpresa, criarEstabelecimento,
//      criarCentroCusto, criarCargo): cada entidade nasce pelo MESMO caminho
//      da tela — validação, versão vigente e trilha de auditoria inclusas.
//      Consequência assumida: cada criação é uma transação própria; uma linha
//      que falha no meio deixa o que já criou (ex.: empresa sim, CC não) — e a
//      reimportação da linha corrigida acha o que ficou como "já existia".
//
// Vigência de tudo: HOJE em São Paulo (F1:a — a carga é a posição ATUAL; o
// histórico não entra, e ajuste retroativo é ato auditado pela tela, depois).

import { PoolClient } from "pg";

import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { listarNiveisHierarquicos } from "../colaboradores/repositorio";
import {
  criarCargo,
  criarEstabelecimento,
  listarCargosAdministraveis,
  listarEstabelecimentosAdministraveis,
} from "../colaboradores/servico";
import { PayloadSessao } from "../identidade/esquemas";
import { EntradaCarga } from "./esquemas";
import {
  analisarLinhaCargo,
  analisarLinhaEstrutura,
  CargoExistente,
  chaveDeNome,
  COLUNAS_CARGOS,
  COLUNAS_ESTRUTURA,
  decidirEmpresaDaLinha,
  divergenciaDeCargoHomonimo,
  dividirLinhas,
  ehCabecalho,
  EmpresaExistente,
  LinhaRejeitadaCarga,
  ResultadoCarga,
} from "./importacao-analise";
import {
  inserirLoteCarga,
  listarLotesCarga as listarLotesCargaSql,
  LoteCarga,
  TipoLoteCarga,
} from "./importacao-repositorio";
import {
  criarCentroCusto,
  criarEmpresa,
  listarCentrosCustoAdministraveis,
  listarEmpresasAdministraveis,
} from "./servico";

/** Recusa de UMA linha: vira rejeição com motivo, nunca aborta o lote. */
class RecusaDeLinha extends Error {}

function motivoDoErro(erro: unknown): string {
  if (erro instanceof RecusaDeLinha) return erro.message;
  // Os serviços reusados falam ErroHttp com mensagem de gente (400/404/409) —
  // a mensagem da tela serve igual no relatório do lote.
  if (erro instanceof ErroHttp) return erro.message;
  return `Falha ao gravar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`;
}

/** HOJE no fuso de negócio (eixo 3) — vigência de tudo que a carga cria. */
async function hojeDeSaoPaulo(): Promise<string> {
  const linhas = await consultar<{ hoje: string }>(
    "SELECT rh.hoje()::text AS hoje"
  );
  return linhas[0].hoje;
}

function exigirLinhasUteis(conteudo: string): { numero: number; bruta: string }[] {
  const linhas = dividirLinhas(conteudo);
  if (linhas.length === 0) {
    throw new ErroHttpCampo(422, "Arquivo sem nenhuma linha útil", "conteudo");
  }
  return linhas;
}

/**
 * B4: a transação do lote nasce ANTES de qualquer leitura de identidade e toma
 * o advisory lock da carga inicial. Dois imports simultâneos (estrutura e/ou
 * cargos) corriam entre o "não existe" dos mapas e o criar — e duplicavam
 * empresa sem CNPJ, estabelecimento e cargo, identidades que não têm UNIQUE no
 * banco. Com o lock, o segundo lote só lê os mapas depois que o primeiro
 * commitou o lote inteiro. xact_lock: solto no COMMIT/ROLLBACK, sem risco de
 * ficar preso se a conexão cair.
 */
async function travarCargaInicial(cliente: PoolClient): Promise<void> {
  await cliente.query(
    "SELECT pg_advisory_xact_lock(hashtext('fast.carga-inicial'))"
  );
}

/** Fecha o lote (na transação que segura o lock) com a trilha do ato de importar. */
async function gravarLote(
  cliente: PoolClient,
  sessao: PayloadSessao,
  tipo: TipoLoteCarga,
  entrada: EntradaCarga,
  contas: { lidas: number; aceitas: number; jaExistiam: number },
  rejeicoes: LinhaRejeitadaCarga[],
  colunas: readonly string[]
): Promise<ResultadoCarga> {
  const resumo =
    `${contas.aceitas} de ${contas.lidas} linha(s) criaram algo; ` +
    `${contas.jaExistiam} já existiam por inteiro; ` +
    `${rejeicoes.length} rejeitada(s) com motivo individual`;
  const loteId = await inserirLoteCarga(cliente, {
    tipo,
    arquivo: entrada.arquivo,
    linhas_lidas: contas.lidas,
    linhas_aceitas: contas.aceitas,
    linhas_ja_existiam: contas.jaExistiam,
    linhas_rejeitadas: rejeicoes.length,
    relatorio: {
      separador: entrada.separador,
      colunas_esperadas: [...colunas],
      rejeitadas: rejeicoes,
      resumo,
    },
    importado_por: sessao.usuario_id,
  });
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "carga.importacao",
    tabela: "rh.lote_carga",
    registroId: String(loteId),
    diff: {
      Tipo: { de: null, para: tipo },
      Arquivo: { de: null, para: entrada.arquivo },
      "Linhas lidas": { de: null, para: String(contas.lidas) },
      "Linhas aceitas": { de: null, para: String(contas.aceitas) },
      "Linhas que já existiam": { de: null, para: String(contas.jaExistiam) },
      "Linhas rejeitadas": { de: null, para: String(rejeicoes.length) },
    },
  });
  return {
    lote_id: loteId,
    linhas_lidas: contas.lidas,
    linhas_aceitas: contas.aceitas,
    linhas_ja_existiam: contas.jaExistiam,
    linhas_rejeitadas: rejeicoes.length,
    rejeicoes,
    resumo,
  };
}

// ------------------------------------------------------------------ estrutura

async function carregarEmpresas(): Promise<{
  porCnpj: Map<string, EmpresaExistente>;
  porNome: Map<string, EmpresaExistente>;
}> {
  const porCnpj = new Map<string, EmpresaExistente>();
  const porNome = new Map<string, EmpresaExistente>();
  for (const empresa of await listarEmpresasAdministraveis()) {
    // Inativa fica FORA dos mapas de identidade: além de a carga não dever
    // pendurar nada nela, a listagem ordena inativas por último — uma homônima
    // inativa SOBRESCREVIA a ativa em porNome e o CC ia parar na empresa errada.
    if (empresa.inativada_em !== null) continue;
    const conhecida = { id: empresa.id, cnpj: empresa.cnpj };
    if (empresa.cnpj) porCnpj.set(empresa.cnpj, conhecida);
    if (empresa.nome_fantasia) {
      porNome.set(chaveDeNome(empresa.nome_fantasia), conhecida);
    }
  }
  return { porCnpj, porNome };
}

export async function importarEstrutura(
  sessao: PayloadSessao,
  entrada: EntradaCarga
): Promise<ResultadoCarga> {
  const linhas = exigirLinhasUteis(entrada.conteudo);
  return comTransacao(sessao.usuario_id, async (cliente) => {
    await travarCargaInicial(cliente);
    return importarEstruturaTravado(cliente, sessao, entrada, linhas);
  });
}

/** O miolo roda já DONO do lock (B4); `cliente` é a transação do lote. */
async function importarEstruturaTravado(
  cliente: PoolClient,
  sessao: PayloadSessao,
  entrada: EntradaCarga,
  linhas: { numero: number; bruta: string }[]
): Promise<ResultadoCarga> {
  const hoje = await hojeDeSaoPaulo();

  // Identidades que JÁ existem — a base da idempotência. Os conjuntos são
  // atualizados a cada criação, para a segunda linha do MESMO arquivo que
  // repete a empresa cair em "já existia", não em duplicata.
  let empresas = await carregarEmpresas();
  const estabelecimentos = new Set<string>();
  for (const estab of await listarEstabelecimentosAdministraveis()) {
    if (estab.unidade) estabelecimentos.add(chaveDeNome(estab.unidade));
  }
  const centros = new Set<string>();
  for (const centro of await listarCentrosCustoAdministraveis()) {
    centros.add(`${centro.empresa_id}|${chaveDeNome(centro.codigo)}`);
  }

  const rejeicoes: LinhaRejeitadaCarga[] = [];
  let lidas = 0;
  let aceitas = 0;
  let jaExistiam = 0;

  for (let indice = 0; indice < linhas.length; indice += 1) {
    const { numero, bruta } = linhas[indice];
    const colunas = bruta.split(entrada.separador);
    if (indice === 0 && ehCabecalho(colunas[0] ?? "", "empresa")) continue;
    lidas += 1;

    const analise = analisarLinhaEstrutura(colunas);
    if (!analise.ok) {
      rejeicoes.push({ linha: numero, motivo: analise.motivo, conteudo: bruta });
      continue;
    }
    const dados = analise.dados;

    try {
      let criouAlgo = false;

      // -- EMPRESA. Identidade: com CNPJ na linha, SÓ o CNPJ casa (B1) —
      // homônima com CNPJ divergente ou sem CNPJ no banco vira rejeição com
      // motivo, nunca "já existia". O fallback por nome vale só para linha
      // sem CNPJ. A carga NÃO atualiza CNPJ de empresa existente: correção de
      // cadastro é ato da tela de estrutura (criarVersaoEmpresa), auditado.
      const decisao = decidirEmpresaDaLinha(
        dados,
        empresas.porCnpj,
        empresas.porNome
      );
      if (decisao.acao === "rejeitar") {
        throw new RecusaDeLinha(decisao.motivo);
      }
      let empresa: EmpresaExistente | undefined =
        decisao.acao === "usar" ? decisao.empresa : undefined;
      if (!empresa) {
        if (!dados.tipo) {
          throw new RecusaDeLinha(
            `Empresa nova "${dados.empresa_nome}" sem a coluna 4 (tipo: matriz ou filial)`
          );
        }
        await criarEmpresa(sessao, {
          cnpj: dados.cnpj,
          razao_social: dados.razao_social ?? undefined,
          nome_fantasia: dados.empresa_nome,
          tipo: dados.tipo,
          inicio_vigencia: hoje,
        });
        empresas = await carregarEmpresas();
        // Reencontro pela MESMA régua do casamento: CNPJ quando a linha o
        // informou; nome só quando a linha veio sem CNPJ.
        empresa = dados.cnpj
          ? empresas.porCnpj.get(dados.cnpj)
          : empresas.porNome.get(chaveDeNome(dados.empresa_nome));
        if (!empresa) {
          throw new RecusaDeLinha(
            "Empresa criada mas não reencontrada na releitura — reimporte a linha"
          );
        }
        criouAlgo = true;
      }

      // -- ESTABELECIMENTO (LOTAÇÃO). Identidade: nome da unidade. O local
      // físico não pertence à empresa (0047) — a coluna 1 não entra na chave.
      if (dados.estabelecimento) {
        const chave = chaveDeNome(dados.estabelecimento);
        if (!estabelecimentos.has(chave)) {
          await criarEstabelecimento(sessao, {
            unidade: dados.estabelecimento,
            inicio_vigencia: hoje,
          });
          estabelecimentos.add(chave);
          criouAlgo = true;
        }
      }

      // -- CENTRO DE CUSTO. Identidade: código DENTRO da empresa da linha
      // (o UNIQUE do banco é (empresa_id, codigo)). A análise garante que
      // código e nome vêm juntos.
      if (dados.cc_codigo && dados.cc_nome) {
        const chaveCentro = `${empresa.id}|${chaveDeNome(dados.cc_codigo)}`;
        if (!centros.has(chaveCentro)) {
          await criarCentroCusto(sessao, {
            empresa_id: empresa.id,
            codigo: dados.cc_codigo,
            nome: dados.cc_nome,
            inicio_vigencia: hoje,
          });
          centros.add(chaveCentro);
          criouAlgo = true;
        }
      }

      if (criouAlgo) aceitas += 1;
      else jaExistiam += 1;
    } catch (erro) {
      rejeicoes.push({ linha: numero, motivo: motivoDoErro(erro), conteudo: bruta });
    }
  }

  return gravarLote(
    cliente,
    sessao,
    "estrutura",
    entrada,
    { lidas, aceitas, jaExistiam },
    rejeicoes,
    COLUNAS_ESTRUTURA
  );
}

// ------------------------------------------------------------------ cargos

export async function importarCargos(
  sessao: PayloadSessao,
  entrada: EntradaCarga
): Promise<ResultadoCarga> {
  const linhas = exigirLinhasUteis(entrada.conteudo);
  return comTransacao(sessao.usuario_id, async (cliente) => {
    await travarCargaInicial(cliente);
    return importarCargosTravado(cliente, sessao, entrada, linhas);
  });
}

/** O miolo roda já DONO do lock (B4); `cliente` é a transação do lote. */
async function importarCargosTravado(
  cliente: PoolClient,
  sessao: PayloadSessao,
  entrada: EntradaCarga,
  linhas: { numero: number; bruta: string }[]
): Promise<ResultadoCarga> {
  const hoje = await hojeDeSaoPaulo();

  // Identidade do cargo: nome da versão ATIVA, normalizado — com nível e
  // faixa (em centavos) junto, para o homônimo divergente virar rejeição (B3),
  // não "já existia" silencioso.
  const cargos = new Map<string, CargoExistente>();
  for (const cargo of await listarCargosAdministraveis()) {
    if (!cargo.nome) continue;
    cargos.set(chaveDeNome(cargo.nome), {
      nivel_id: cargo.nivel_hierarquico_id,
      // O resumo fala em REAIS (NUMERIC de duas casas); a comparação é em
      // centavo inteiro (eixo 5) — Math.round fecha o resto binário do float.
      faixa_min_centavos:
        cargo.faixa_min === null ? null : Math.round(cargo.faixa_min * 100),
      faixa_max_centavos:
        cargo.faixa_max === null ? null : Math.round(cargo.faixa_max * 100),
    });
  }
  // Nível hierárquico: por NOME do catálogo administrável (A6:a) — a carga não
  // cria nível; nome fora do catálogo é rejeição com motivo.
  const niveis = new Map<string, number>();
  for (const nivel of await listarNiveisHierarquicos(true)) {
    niveis.set(chaveDeNome(nivel.nome), nivel.id);
  }

  const rejeicoes: LinhaRejeitadaCarga[] = [];
  let lidas = 0;
  let aceitas = 0;
  let jaExistiam = 0;

  for (let indice = 0; indice < linhas.length; indice += 1) {
    const { numero, bruta } = linhas[indice];
    const colunas = bruta.split(entrada.separador);
    if (indice === 0 && ehCabecalho(colunas[0] ?? "", "cargo")) continue;
    lidas += 1;

    const analise = analisarLinhaCargo(colunas);
    if (!analise.ok) {
      rejeicoes.push({ linha: numero, motivo: analise.motivo, conteudo: bruta });
      continue;
    }
    const dados = analise.dados;

    // O nível resolve ANTES do teste de homônimo: tanto a criação quanto a
    // comparação de divergência (B3) precisam do id do catálogo.
    let nivelId: number | null = null;
    if (dados.nivel !== null) {
      nivelId = niveis.get(chaveDeNome(dados.nivel)) ?? null;
      if (nivelId === null) {
        rejeicoes.push({
          linha: numero,
          motivo: `Nível "${dados.nivel}" não está no catálogo de níveis hierárquicos (crie-o na tela de cargos antes)`,
          conteudo: bruta,
        });
        continue;
      }
    }

    const existente = cargos.get(chaveDeNome(dados.nome));
    if (existente) {
      // B3: homônimo com nível/faixa divergentes NÃO é "já existia" — engolir
      // a linha perdia a posição do quadro em silêncio. Igual por inteiro
      // (no que a linha informa) segue idempotente.
      const divergencia = divergenciaDeCargoHomonimo(
        {
          nivel_id: nivelId,
          faixa_min_centavos: dados.faixa_min_centavos,
          faixa_max_centavos: dados.faixa_max_centavos,
        },
        existente
      );
      if (divergencia) {
        rejeicoes.push({ linha: numero, motivo: divergencia, conteudo: bruta });
      } else {
        jaExistiam += 1;
      }
      continue;
    }

    try {
      await criarCargo(sessao, {
        nome: dados.nome,
        inicio_vigencia: hoje,
        nivel_hierarquico_id: nivelId,
        // Centavo inteiro na análise; o serviço fala em reais (NUMERIC de duas
        // casas) — a divisão por 100 é exata porque o dividendo é inteiro.
        ...(dados.faixa_min_centavos !== null &&
        dados.faixa_max_centavos !== null
          ? {
              faixa_min: dados.faixa_min_centavos / 100,
              faixa_max: dados.faixa_max_centavos / 100,
            }
          : {}),
      });
      cargos.set(chaveDeNome(dados.nome), {
        nivel_id: nivelId,
        faixa_min_centavos: dados.faixa_min_centavos,
        faixa_max_centavos: dados.faixa_max_centavos,
      });
      aceitas += 1;
    } catch (erro) {
      rejeicoes.push({ linha: numero, motivo: motivoDoErro(erro), conteudo: bruta });
    }
  }

  return gravarLote(
    cliente,
    sessao,
    "cargos",
    entrada,
    { lidas, aceitas, jaExistiam },
    rejeicoes,
    COLUNAS_CARGOS
  );
}

// ------------------------------------------------------------------ lotes

export async function listarLotesDeCarga(
  tipo: TipoLoteCarga
): Promise<LoteCarga[]> {
  return listarLotesCargaSql(tipo);
}
