import { esquemaAtualizarInstrucao } from "@/dominios/pdi/esquemas";
import { atualizarInstrucao, verInstrucao } from "@/dominios/pdi/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

// A instrução ("playbook") da IA que escreve o PDI é editável pela tela do RH
// (Fase C, eixo 9). Quem homologa o PDI é quem curou o playbook — o gate é
// pdi.homologar. GET devolve o texto em vigor + histórico; PUT grava uma versão
// nova (desativa a anterior).

export async function GET() {
  try {
    await exigirPermissao("pdi.homologar");
    const instrucao = await verInstrucao();
    return Response.json({ instrucao });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function PUT(request: Request) {
  try {
    const sessao = await exigirPermissao("pdi.homologar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAtualizarInstrucao.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        { erro: problema?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const { id } = await atualizarInstrucao(sessao, analise.data);
    return Response.json({ ok: true, id });
  } catch (erro) {
    return responderErro(erro);
  }
}
