import { esquemaNovaEscala } from "@/dominios/ponto/esquemas";
import { definirEscala } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Define (ou troca) a jornada de uma pessoa. A escala PINA A VERSÃO da
 * jornada, como a posição pina a versão do cargo: encerrar a versão não
 * reescreve a apuração já feita. Vira evento na linha do tempo da pessoa.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.parametros");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaEscala.safeParse(corpo);
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
    const id = await definirEscala(sessao, analise.data);
    return Response.json({ escala_id: id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
