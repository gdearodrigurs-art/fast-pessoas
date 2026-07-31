import { esquemaRegistroPsicossocial } from "@/dominios/sst/esquemas";
import {
  apurarVencimentosPsicossocial,
  listarPsicossociaisParaSessao,
  permissoesSst,
  registrarPsicossocial,
} from "@/dominios/sst/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    // Mesmas chaves do ASO — a NR-1 anda ao lado dele, não em um controle à parte.
    const sessao = await exigirPermissao("sst.ver");
    // O serviço decide o formato do payload: com sst.saude.ver vêm
    // classificação de risco e observações decifradas (leitura na trilha);
    // sem a chave, o conteúdo clínico fica AUSENTE — só datas, empresa
    // executora e o vínculo com o ASO.
    const [pode, lista, painel] = await Promise.all([
      permissoesSst(sessao),
      listarPsicossociaisParaSessao(sessao),
      apurarVencimentosPsicossocial(),
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
    const analise = esquemaRegistroPsicossocial.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const avaliacao = await registrarPsicossocial(sessao, analise.data);
    return Response.json({ avaliacao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
