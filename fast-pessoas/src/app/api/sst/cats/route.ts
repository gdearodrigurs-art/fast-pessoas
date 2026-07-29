import { esquemaRegistroCat } from "@/dominios/sst/esquemas";
import {
  listarCatsVisao,
  permissoesSst,
  registrarCat,
} from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("sst.ver");
    const [pode, cats] = await Promise.all([
      permissoesSst(sessao),
      listarCatsVisao(),
    ]);
    return Response.json({ pode, cats });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("sst.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRegistroCat.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const cat = await registrarCat(sessao, analise.data);
    return Response.json({ cat }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
