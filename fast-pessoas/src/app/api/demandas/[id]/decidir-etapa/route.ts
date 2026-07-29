import { esquemaDecisaoEtapa } from "@/dominios/demandas/esquemas";
import { decidirEtapaMovimentacao } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao } from "@/lib/sessao";
import { idDemanda } from "../../identificador";

// Decisão de UMA etapa da cadeia (líder → diretoria). Duas chaves autorizam com
// alcance diferente: `demanda.aprovar` é do líder (e o serviço ainda exige que
// ele seja o gestor VIGENTE do colaborador alvo) e
// `movimentacao.aprovar.diretoria` é do segundo nível. Qual etapa está pendente
// — e se este usuário pode decidi-la — quem diz é o serviço.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sessao } = await exigirAlgumaPermissao([
      "demanda.aprovar",
      "movimentacao.aprovar.diretoria",
    ]);
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaDecisaoEtapa.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path?.[0] ? String(problema.path[0]) : undefined,
        },
        { status: 400 }
      );
    }
    const pedido = await decidirEtapaMovimentacao(
      sessao,
      idDemanda(id),
      analise.data
    );
    return Response.json({ pedido });
  } catch (erro) {
    return responderErro(erro);
  }
}
