import { esquemaCriacaoModelo } from "@/dominios/recrutamento/esquemas";
import {
  exigirSessaoRs,
  reformularModelo,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { idRecrutamento } from "../../../identificador";

/**
 * Reformular: encerra a versão ativa e publica a nova ligada a ela
 * (continua_de) na mesma transação. O GERAL herda padrao=true no mesmo ato
 * (decisão G2); vaga aberta NÃO migra (decisão G1 — troca manual na vaga).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sessao, pode } = await exigirSessaoRs();
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoModelo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const novoId = await reformularModelo(
      sessao,
      pode,
      idRecrutamento(id),
      analise.data
    );
    return Response.json({ id: novoId }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
