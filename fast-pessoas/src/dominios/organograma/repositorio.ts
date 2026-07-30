import { consultar } from "../../lib/banco";
import { OpcaoOrganograma, STATUS_VAGA_EM_ABERTO } from "./esquemas";

// ------------------------------------------------------------------ leitura plana
// O repositório entrega LINHAS PLANAS; quem monta a árvore (e defende de ciclo)
// é o serviço. Motivo: WITH RECURSIVE no Postgres entra em laço infinito com
// ciclo na hierarquia — a defesa fica em JS, onde o conjunto de visitados é
// explícito. O quadro ativo é da ordem de dezenas/centenas de linhas: uma
// varredura plana é mais barata e mais previsível que recursão no banco.
//
// "No quadro" = status <> 'desligado' (ativo OU afastado). Afastado continua
// ocupando posição e continua no organograma; desligado, não.

export interface LinhaPessoa {
  colaborador_id: number;
  nome: string;
  status: string;
  gestor_id: number | null;
  cargo_id: number | null;
  cargo_nome: string | null;
  estabelecimento_id: number | null;
  unidade: string | null;
}

export async function listarPessoasDoQuadro(): Promise<LinhaPessoa[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome: string;
    status: string;
    gestor_id: string | null;
    cargo_id: string | null;
    cargo_nome: string | null;
    estabelecimento_id: string | null;
    unidade: string | null;
  }>(
    `SELECT c.id                        AS colaborador_id,
            c.nome_completo             AS nome,
            c.status,
            rg.gestor_colaborador_id    AS gestor_id,
            cv.cargo_id,
            cv.nome                     AS cargo_nome,
            l.estabelecimento_id,
            ev.unidade
       FROM rh.colaborador c
       LEFT JOIN rh.relacao_gestor rg
              ON rg.liderado_colaborador_id = c.id AND rg.fim_vigencia IS NULL
       LEFT JOIN rh.posicao_colaborador pc
              ON pc.colaborador_id = c.id AND pc.fim_vigencia IS NULL
       LEFT JOIN rh.cargo_versao cv ON cv.id = pc.cargo_versao_id
       LEFT JOIN rh.lotacao l
              ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       LEFT JOIN rh.estabelecimento_versao ev
              ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE c.status <> 'desligado'
      ORDER BY c.nome_completo`
  );
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    nome: linha.nome,
    status: linha.status,
    gestor_id: linha.gestor_id === null ? null : Number(linha.gestor_id),
    cargo_id: linha.cargo_id === null ? null : Number(linha.cargo_id),
    cargo_nome: linha.cargo_nome,
    estabelecimento_id:
      linha.estabelecimento_id === null ? null : Number(linha.estabelecimento_id),
    unidade: linha.unidade,
  }));
}

export interface LinhaVagaEmAberto {
  vaga_id: number;
  titulo: string;
  status: string;
  prazo_alvo: string;
  cargo_id: number | null;
  cargo_nome: string | null;
  estabelecimento_id: number | null;
  unidade: string | null;
  /** Colaborador do usuário solicitante da requisição — o gestor da posição. */
  solicitante_colaborador_id: number | null;
}

/**
 * Vaga com posição realmente em aberto: requisição APROVADA e vaga que não foi
 * fechada nem cancelada. Sem faixa salarial no SELECT — de propósito.
 */
export async function listarVagasEmAberto(): Promise<LinhaVagaEmAberto[]> {
  const linhas = await consultar<{
    vaga_id: string;
    titulo: string;
    status: string;
    prazo_alvo: string;
    cargo_id: string | null;
    cargo_nome: string | null;
    estabelecimento_id: string | null;
    unidade: string | null;
    solicitante_colaborador_id: string | null;
  }>(
    `SELECT v.id                       AS vaga_id,
            v.titulo,
            v.status,
            to_char(v.prazo_alvo, 'YYYY-MM-DD') AS prazo_alvo,
            cv.cargo_id,
            cv.nome                    AS cargo_nome,
            ev.estabelecimento_id,
            ev.unidade,
            solicitante.id             AS solicitante_colaborador_id
       FROM rh.vaga v
       JOIN rh.requisicao_vaga r ON r.id = v.requisicao_id
       JOIN rh.cargo_versao cv ON cv.id = r.cargo_versao_id
       LEFT JOIN rh.estabelecimento_versao ev ON ev.id = r.estabelecimento_versao_id
       LEFT JOIN rh.colaborador solicitante
              ON solicitante.usuario_id = r.solicitante_usuario_id
      WHERE r.status = 'aprovada'
        AND v.status = ANY ($1::text[])
      ORDER BY v.prazo_alvo, v.id`,
    [[...STATUS_VAGA_EM_ABERTO]]
  );
  return linhas.map((linha) => ({
    vaga_id: Number(linha.vaga_id),
    titulo: linha.titulo,
    status: linha.status,
    prazo_alvo: linha.prazo_alvo,
    cargo_id: linha.cargo_id === null ? null : Number(linha.cargo_id),
    cargo_nome: linha.cargo_nome,
    estabelecimento_id:
      linha.estabelecimento_id === null ? null : Number(linha.estabelecimento_id),
    unidade: linha.unidade,
    solicitante_colaborador_id:
      linha.solicitante_colaborador_id === null
        ? null
        : Number(linha.solicitante_colaborador_id),
  }));
}

export async function listarUnidades(): Promise<OpcaoOrganograma[]> {
  const linhas = await consultar<{ id: string; nome: string }>(
    `SELECT ev.estabelecimento_id AS id, ev.unidade AS nome
       FROM rh.estabelecimento_versao ev
      WHERE ev.status = 'ativa'
      ORDER BY ev.unidade`
  );
  return linhas.map((linha) => ({ id: Number(linha.id), nome: linha.nome }));
}

export async function listarCargos(): Promise<OpcaoOrganograma[]> {
  const linhas = await consultar<{ id: string; nome: string }>(
    `SELECT cv.cargo_id AS id, cv.nome
       FROM rh.cargo_versao cv
      WHERE cv.status = 'ativa'
      ORDER BY cv.nome`
  );
  return linhas.map((linha) => ({ id: Number(linha.id), nome: linha.nome }));
}
