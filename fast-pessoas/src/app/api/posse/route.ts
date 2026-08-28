import { esquemaRegistroPosse } from "@/dominios/posse/esquemas";
import {
  listarPosseColaborador,
  registrarPosse,
} from "@/dominios/posse/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** `?colaborador_id=` na querystring — o alvo de quem se lê/registra. */
function idColaborador(request: Request): number | null {
  const bruto = new URL(request.url).searchParams.get("colaborador_id");
  if (bruto === null) return null;
  const id = Number(bruto);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Posse de patrimônio de um colaborador (dp+rh — menos sensível que o
 * disciplinar). 403 aqui faz o cartão da ficha simplesmente NÃO aparecer —
 * ausência, não máscara; 5xx/rede o cartão trata como instabilidade.
 */
export async function GET(request: Request) {
  try {
    await exigirPermissao("rh.posse.ver");
    const colaboradorId = idColaborador(request);
    if (colaboradorId === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    return Response.json(await listarPosseColaborador(colaboradorId));
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.posse.registrar");
    const colaboradorId = idColaborador(request);
    if (colaboradorId === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRegistroPosse.safeParse(corpo);
    if (!analise.success) {
      const issue = analise.error.issues[0];
      return Response.json(
        {
          erro: issue?.message ?? "Dados inválidos",
          ...(typeof issue?.path[0] === "string"
            ? { campo: issue.path[0] }
            : {}),
        },
        { status: 400 }
      );
    }
    const posse = await registrarPosse(sessao, colaboradorId, analise.data);
    return Response.json(posse, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
