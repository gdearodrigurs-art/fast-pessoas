import { esquemaApurarCompetencia } from "@/dominios/ponto/esquemas";
import { apurarCompetencia } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Apura a competência inteira (ou uma pessoa, quando `colaborador_id` vem).
 * Reapurar é permitido e honesto: o banco de horas recebe estorno + novo
 * lançamento, e a intercorrência já tratada não reabre.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaApurarCompetencia.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    return Response.json(await apurarCompetencia(sessao, analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
