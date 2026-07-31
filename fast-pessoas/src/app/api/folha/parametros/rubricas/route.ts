import { esquemaNovaRubrica } from "@/dominios/folha/esquemas";
import { criarRubrica } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Cria uma rubrica nova (identidade + primeira versão vigente, na mesma
 * transação). Código duplicado responde 409 com o campo `codigo`.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovaRubrica.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const criada = await criarRubrica(sessao, analise.data);
    return Response.json(criada, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
