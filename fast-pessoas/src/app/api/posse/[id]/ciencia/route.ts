import { esquemaCiencia } from "@/dominios/posse/esquemas";
import { darCienciaPosse } from "@/dominios/posse/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Ciência do TITULAR sobre a entrega do patrimônio — o aceite eletrônico:
 * o serviço confere que o usuário é o colaborador do item e reusa a ciência
 * do GED sobre o termo (rh.ciencia, hash no momento). Molde EPI: a porta é
 * documento.ver (a ciência é sobre um documento do próprio), não rh.posse.*.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("documento.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    // Corpo vazio ou objeto — a ciência não carrega dados do cliente.
    const corpo = await request.json().catch(() => ({}));
    const analise = esquemaCiencia.safeParse(corpo ?? {});
    if (!analise.success) {
      return Response.json({ erro: "Dados inválidos" }, { status: 400 });
    }
    const ciencia = await darCienciaPosse(sessao, idNumero);
    return Response.json({ ciencia }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
