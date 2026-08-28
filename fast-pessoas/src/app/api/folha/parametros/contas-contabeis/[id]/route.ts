import { esquemaEncerrarContaContabil } from "@/dominios/folha/esquemas";
import { encerrarContaContabil } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../../identificador";

/**
 * ENCERRA a vigência ativa do de-para rubrica → conta contábil — a rubrica
 * volta a sair no arquivo OLAC com a conta vazia. Não existe DELETE: vigência
 * encerrada é imutável (trigger rh.bloquear_versao_encerrada) e a exportação
 * antiga resolve a conta na data da competência dela.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEncerrarContaContabil.safeParse(corpo);
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
    await encerrarContaContabil(sessao, idFolha(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
