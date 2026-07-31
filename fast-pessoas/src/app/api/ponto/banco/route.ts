import { esquemaMovimentoBanco } from "@/dominios/ponto/esquemas";
import { lancarMovimentoBanco } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Movimento manual no banco de horas: compensação (folga), expiração, ajuste
 * ou rescisão. Append-only — para desfazer, lança-se o contrário. O limite da
 * regra VIGENTE daquela pessoa (resolvida nos três níveis) é conferido antes
 * de gravar e o erro traz o número, não um "não pode" seco.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.ajustar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMovimentoBanco.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path.join(".") || undefined,
        },
        { status: 400 }
      );
    }
    const id = await lancarMovimentoBanco(sessao, analise.data);
    return Response.json({ movimento_id: id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
