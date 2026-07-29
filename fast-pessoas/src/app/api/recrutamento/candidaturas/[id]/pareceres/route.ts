import { esquemaParecer } from "@/dominios/recrutamento/esquemas";
import {
  exigirSessaoRs,
  listarPareceresCandidatura,
  registrarParecer,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idRecrutamento } from "../../../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Restrito: rs.parecer.ver enxerga todos (leitura na trilha sensível);
    // quem só registra enxerga apenas os próprios pareceres.
    const { sessao, pode } = await exigirSessaoRs();
    const { id } = await params;
    const resultado = await listarPareceresCandidatura(
      sessao,
      pode,
      idRecrutamento(id)
    );
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rs.parecer.registrar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaParecer.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await registrarParecer(sessao, idRecrutamento(id), analise.data);
    return Response.json({ ok: true }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
