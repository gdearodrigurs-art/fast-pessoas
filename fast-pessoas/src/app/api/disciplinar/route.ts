import { esquemaRegistroMedida } from "@/dominios/disciplinar/esquemas";
import {
  listarMedidasColaborador,
  registrarMedida,
} from "@/dominios/disciplinar/servico";
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
 * Medidas disciplinares de um colaborador. Conteúdo SEMPRE restrito
 * (dp/diretoria); o gestor não alcança. A leitura grava trilha (eixo 8) no
 * serviço. 403 aqui faz o cartão da ficha simplesmente NÃO aparecer — ausência,
 * não máscara.
 */
export async function GET(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.disciplinar.ver");
    const colaboradorId = idColaborador(request);
    if (colaboradorId === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    return Response.json(
      await listarMedidasColaborador(sessao, colaboradorId)
    );
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.disciplinar.registrar");
    const colaboradorId = idColaborador(request);
    if (colaboradorId === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRegistroMedida.safeParse(corpo);
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
    const medida = await registrarMedida(sessao, colaboradorId, analise.data);
    return Response.json(medida, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
