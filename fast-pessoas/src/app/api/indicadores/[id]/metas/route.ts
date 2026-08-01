import { esquemaCriacaoMeta } from "@/dominios/indicadores/esquemas";
import {
  definirMeta,
  encerrarMetaVigente,
  historicoDeMetas,
} from "@/dominios/indicadores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function analisarId(id: string): number | null {
  const numero = Number(id);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** `?estabelecimento_id=N` recorta o escopo; ausente = meta global. */
function analisarEscopo(
  url: string
): { ok: true; estabelecimento_id: number | null } | { ok: false } {
  const bruto = new URL(url).searchParams.get("estabelecimento_id");
  if (bruto === null || bruto === "") return { ok: true, estabelecimento_id: null };
  const numero = analisarId(bruto);
  return numero === null ? { ok: false } : { ok: true, estabelecimento_id: numero };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await exigirPermissao("indicador.ver");
    const { id } = await params;
    const idNumero = analisarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const historico = await historicoDeMetas(idNumero);
    return Response.json(historico);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("indicador.administrar");
    const { id } = await params;
    const idNumero = analisarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoMeta.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const meta = await definirMeta(sessao, idNumero, analise.data);
    return Response.json({ meta }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Encerra a meta vigente do escopo, sem substituta. Não apaga linha nenhuma —
 * a versão vira histórico (status 'encerrada'), como manda a migration 0005.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("indicador.administrar");
    const { id } = await params;
    const idNumero = analisarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const escopo = analisarEscopo(request.url);
    if (!escopo.ok) {
      return Response.json({ erro: "Unidade inválida" }, { status: 400 });
    }
    await encerrarMetaVigente(sessao, idNumero, escopo.estabelecimento_id);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
