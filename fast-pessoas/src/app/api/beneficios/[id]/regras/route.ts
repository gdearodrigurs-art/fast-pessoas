import { esquemaNovaRegra } from "@/dominios/beneficios/esquemas";
import {
  criarVersaoRegra,
  exigirAcessoBeneficios,
  listarVersoesRegra,
} from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { pode } = await exigirAcessoBeneficios();
    if (!pode.administrar && !pode.ver) {
      throw new ErroHttp(403, "Sem permissão para esta operação");
    }
    const { id } = await params;
    const resultado = await listarVersoesRegra(idNumerico(id));
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("beneficio.administrar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaRegra.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const beneficio = await criarVersaoRegra(
      sessao,
      idNumerico(id),
      analise.data
    );
    return Response.json({ beneficio }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
