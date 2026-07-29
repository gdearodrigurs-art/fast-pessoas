import {
  esquemaComposicaoPerfil,
  esquemaPapel,
} from "@/dominios/usuarios/esquemas";
import { atualizarPerfil } from "@/dominios/usuarios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Substitui a composição do perfil pelo ESTADO FINAL enviado pela tela. O
 * serviço calcula o diff contra o gravado (com FOR UPDATE), aplica as travas
 * anti-tranca e audita chave a chave.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ papel: string }> }
) {
  try {
    const sessao = await exigirPermissao("perfil.administrar");
    const { papel } = await params;
    const analisePapel = esquemaPapel.safeParse(papel);
    if (!analisePapel.success) {
      return Response.json(
        { erro: "Papel desconhecido — não é um perfil editável." },
        { status: 400 }
      );
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaComposicaoPerfil.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await atualizarPerfil(
      sessao,
      analisePapel.data,
      analise.data
    );
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
