import { esquemaRegistroAso } from "@/dominios/sst/esquemas";
import {
  apurarVencimentosAso,
  listarAsosParaSessao,
  permissoesSst,
  registrarAso,
} from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("sst.ver");
    // O serviço decide o formato do payload: com sst.saude.ver vêm resultado
    // e restrições decifradas (leitura na trilha); sem a chave, o conteúdo
    // clínico fica AUSENTE — só tipo do exame e datas.
    const [pode, lista, painel] = await Promise.all([
      permissoesSst(sessao),
      listarAsosParaSessao(sessao),
      apurarVencimentosAso(),
    ]);
    return Response.json({ pode, painel, ...lista });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("sst.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRegistroAso.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const aso = await registrarAso(sessao, analise.data);
    return Response.json({ aso }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
