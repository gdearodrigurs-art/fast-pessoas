import { esquemaNovaJornada } from "@/dominios/ponto/esquemas";
import { criarVersaoJornada } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Nova VERSÃO de jornada. Mudar carga ou tolerância nunca é UPDATE: a versão
 * ativa do mesmo código é encerrada na véspera e outra abre — a apuração do
 * mês passado continua enxergando a jornada do mês passado.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.parametros");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaJornada.safeParse(corpo);
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
    const id = await criarVersaoJornada(sessao, analise.data);
    return Response.json({ jornada_versao_id: id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
