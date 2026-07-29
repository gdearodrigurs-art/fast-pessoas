import { esquemaRealizarEntrevista } from "@/dominios/desligamento/esquemas";
import { realizarEntrevistaProcesso } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // As respostas entram aqui mas NUNCA voltam por esta rota — leitura só
    // em /respostas, com chave própria e trilha de leitura sensível.
    const sessao = await exigirPermissao("entrevista.conduzir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRealizarEntrevista.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const entrevista = await realizarEntrevistaProcesso(
      sessao,
      idProcesso(id),
      analise.data
    );
    return Response.json({ entrevista });
  } catch (erro) {
    return responderErro(erro);
  }
}
