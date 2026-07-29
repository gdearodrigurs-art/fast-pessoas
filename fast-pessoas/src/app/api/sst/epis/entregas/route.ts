import { esquemaEntregaEpi } from "@/dominios/sst/esquemas";
import { listarEntregas, registrarEntregaEpi } from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("sst.ver");
    const entregas = await listarEntregas();
    return Response.json({ entregas });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("sst.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEntregaEpi.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const entrega = await registrarEntregaEpi(sessao, analise.data);
    return Response.json({ entrega }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
