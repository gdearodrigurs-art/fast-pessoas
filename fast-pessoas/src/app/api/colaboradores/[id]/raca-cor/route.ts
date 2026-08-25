import { obterRacaCorColaborador } from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * A raça-cor INDIVIDUAL de um colaborador — decisão A5:b (docs/20): o dado é
 * autodeclarado pela pessoa (portal), e o DP o VÊ na ficha, por escolha
 * consciente do dono. A chave é a de dado sensível da ficha
 * (`rh.colaborador.sensivel.ver`, que já exige 2FA) e a leitura grava trilha
 * SEMPRE no serviço (molde salário/ASO). Não há POST aqui: ninguém declara
 * pela pessoa — a escrita é só do titular, no portal.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.colaborador.sensivel.ver");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    return Response.json(await obterRacaCorColaborador(sessao, idNumero));
  } catch (erro) {
    return responderErro(erro);
  }
}
