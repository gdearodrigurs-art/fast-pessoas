import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { TipoAfastamento } from "./esquemas";

// ------------------------------------------------------------------ apoio

export async function temPermissao(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return Boolean(linhas[0]?.autorizado);
}

export async function buscarColaborador(
  id: number
): Promise<{ id: number; nome_completo: string; matricula: string } | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    "SELECT id, nome_completo, matricula FROM rh.colaborador WHERE id = $1",
    [id]
  );
  if (linhas.length === 0) return null;
  return { ...linhas[0], id: Number(linhas[0].id) };
}

export async function buscarDocumento(
  id: number
): Promise<{ id: number; titulo: string } | null> {
  const linhas = await consultar<{ id: string; titulo: string }>(
    "SELECT id, titulo FROM rh.documento WHERE id = $1",
    [id]
  );
  if (linhas.length === 0) return null;
  return { id: Number(linhas[0].id), titulo: linhas[0].titulo };
}

export async function registrarLeituraSensivel(
  cliente: PoolClient,
  entrada: {
    usuarioId: number;
    chavePermissao: string;
    recurso: string;
    registroId: string;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.leitura_sensivel (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [
      entrada.usuarioId,
      entrada.chavePermissao,
      entrada.recurso,
      entrada.registroId,
    ]
  );
}

// ------------------------------------------------------------------ afastamentos

/** Linha crua — dados_saude_cifrados NUNCA sai daqui sem passar pelo serviço. */
export interface AfastamentoLinha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoAfastamento;
  inicio: string;
  fim: string | null;
  dados_saude_cifrados: string | null;
  documento_id: number | null;
  documento_titulo: string | null;
  registrado_por_nome: string;
  criado_em: string;
}

export async function listar(): Promise<AfastamentoLinha[]> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    tipo: TipoAfastamento;
    inicio: string;
    fim: string | null;
    dados_saude_cifrados: string | null;
    documento_id: string | null;
    documento_titulo: string | null;
    registrado_por_nome: string;
    criado_em: string;
  }>(
    `SELECT a.id, a.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, a.tipo, a.inicio::text AS inicio, a.fim::text AS fim,
            a.dados_saude_cifrados, a.documento_id,
            d.titulo AS documento_titulo,
            u.nome AS registrado_por_nome,
            a.criado_em::text AS criado_em
       FROM rh.afastamento a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
       JOIN sistema.usuario u ON u.id = a.registrado_por
       LEFT JOIN rh.documento d ON d.id = a.documento_id
      ORDER BY a.inicio DESC, a.id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    documento_id:
      linha.documento_id === null ? null : Number(linha.documento_id),
  }));
}

export async function inserir(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo: TipoAfastamento;
    inicio: string;
    fim: string | null;
    dados_saude_cifrados: string | null;
    documento_id: number | null;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.afastamento
       (colaborador_id, tipo, inicio, fim, dados_saude_cifrados,
        documento_id, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.tipo,
      dados.inicio,
      dados.fim,
      dados.dados_saude_cifrados,
      dados.documento_id,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}
