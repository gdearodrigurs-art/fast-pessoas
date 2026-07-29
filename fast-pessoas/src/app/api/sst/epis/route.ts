import { esquemaItemEpi } from "@/dominios/sst/esquemas";
import { criarItemEpi, listarCatalogoEpi } from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("sst.ver");
    const itens = await listarCatalogoEpi();
    return Response.json({ itens });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("sst.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaItemEpi.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const item = await criarItemEpi(sessao, analise.data);
    return Response.json({ item }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
