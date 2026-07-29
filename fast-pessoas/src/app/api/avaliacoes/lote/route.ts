import { esquemaLoteDesempenho } from "@/dominios/avaliacao/esquemas";
import { abrirLote } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** Abertura em lote do ciclo de desempenho (RH/DP). */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("avaliacao.configurar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaLoteDesempenho.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await abrirLote(sessao, analise.data.prazo);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
