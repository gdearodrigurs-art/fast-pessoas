import { esquemaGerarPdi } from "@/dominios/pdi/esquemas";
import { gerarPdi } from "@/dominios/pdi/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

// Gera o rascunho por IA. O alcance (avaliador do ciclo, ou amplo) é conferido
// no serviço — a chave aqui é o portão. O resultado consolidado é lido no
// servidor e nunca volta ao cliente: só o PDI (focos/ações/resumo).
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("pdi.gerar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaGerarPdi.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        { erro: problema?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const pdi = await gerarPdi(sessao, analise.data);
    return Response.json({ pdi }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
