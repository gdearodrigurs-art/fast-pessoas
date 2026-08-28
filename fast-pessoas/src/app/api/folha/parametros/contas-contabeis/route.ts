import { esquemaNovaContaContabil } from "@/dominios/folha/esquemas";
import { criarContaContabil } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Cria uma vigência do de-para rubrica → conta contábil da OLAC (E3:a —
 * catálogo administrável com vigência, eixo 9). Se a rubrica já tem vigência
 * ativa, ela é encerrada no dia anterior ao início da nova, na mesma
 * transação. A listagem sai em GET /api/folha/parametros (contas_contabeis).
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaContaContabil.safeParse(corpo);
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
    const criada = await criarContaContabil(sessao, analise.data);
    return Response.json(criada, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
