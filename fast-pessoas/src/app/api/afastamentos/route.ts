import { esquemaRegistroAfastamento } from "@/dominios/afastamentos/esquemas";
import {
  listarAfastamentos,
  permissoesAfastamentos,
  registrarAfastamento,
} from "@/dominios/afastamentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("afastamento.ver");
    // O serviço decide o formato do payload: com afastamento.saude.ver vem o
    // detalhe decifrado (leitura na trilha); sem a chave, o dado de saúde e o
    // tipo específico ficam AUSENTES — só rótulo genérico e período.
    const [pode, lista] = await Promise.all([
      permissoesAfastamentos(sessao),
      listarAfastamentos(sessao),
    ]);
    return Response.json({ pode, ...lista });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("afastamento.registrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRegistroAfastamento.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const afastamento = await registrarAfastamento(sessao, analise.data);
    return Response.json({ afastamento }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
