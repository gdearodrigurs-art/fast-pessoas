import { esquemaCriacaoDependente } from "@/dominios/beneficios/esquemas";
import {
  criarDependente,
  exigirAcessoBeneficios,
  listarDependentesDoColaborador,
} from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

/** Dependentes de um colaborador: titular vê os seus; DP/RH com trilha. */
export async function GET(request: Request) {
  try {
    const { sessao, pode } = await exigirAcessoBeneficios();
    const { searchParams } = new URL(request.url);
    const colaboradorId = Number(searchParams.get("colaborador_id"));
    if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) {
      throw new ErroHttp(400, "Informe colaborador_id válido");
    }
    const dependentes = await listarDependentesDoColaborador(
      sessao,
      pode,
      colaboradorId
    );
    return Response.json({ dependentes });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoDependente.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const dependente = await criarDependente(sessao, analise.data);
    return Response.json({ dependente }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
