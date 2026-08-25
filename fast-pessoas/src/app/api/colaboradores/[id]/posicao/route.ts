import { esquemaCriacaoPosicao } from "@/dominios/colaboradores/esquemas";
import {
  obterPosicoes,
  registrarPosicao,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao, exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Salário é dado sensível, e DUAS chaves o autorizam com alcances
    // diferentes (A1:a): a global (empresa inteira) e a de equipe (sub-árvore
    // de quem pergunta — o serviço confere o alvo). A leitura grava trilha com
    // a chave que DE FATO autorizou.
    const { sessao, concedidas } = await exigirAlgumaPermissao([
      "rh.posicao.ver",
      "rh.posicao.ver.equipe",
    ]);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const resultado = await obterPosicoes(sessao, idNumero, concedidas);
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
    const sessao = await exigirPermissao("rh.posicao.editar");
    // A resposta do POST ecoa o histórico salarial — dado sensível. A releitura
    // passa pelas MESMAS chaves de leitura do GET, com o conjunto REAL da
    // sessão, e a trilha grava a que de fato autorizou (chamar obterPosicoes
    // sem as chaves fazia a trilha carimbar rh.posicao.ver por default).
    // Editar sem nenhuma chave de ver não recebe o payload: 403 ANTES de
    // gravar — hoje quem tem editar (dp) tem as duas; isto protege o dia em
    // que /perfis separar as chaves.
    const { concedidas } = await exigirAlgumaPermissao([
      "rh.posicao.ver",
      "rh.posicao.ver.equipe",
    ]);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoPosicao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await registrarPosicao(sessao, idNumero, analise.data);
    const resultado = await obterPosicoes(sessao, idNumero, concedidas);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
