import {
  esquemaAbrirAto,
  esquemaAcaoAto,
} from "@/dominios/documentos/esquemas";
import {
  abrirAtoTestemunhas,
  CHAVE_CONDUTA_GERIR,
  confirmarTestemunho,
  exigirCienciaRegularParaGerirCiclo,
  registrarDesfechoAto,
} from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import {
  exigirPermissao,
  exigirSessaoParaRegularizacao,
  lerSessao,
} from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * ABRIR o ato formal com 2 testemunhas (B2): ato do DP — chave
 * rh.conduta.gerir. Nasce de recusa (registrada ou verbal) ou de prazo
 * vencido (o servidor reconfere o vencimento).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE_CONDUTA_GERIR);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAbrirAto.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const ato = await abrirAtoTestemunhas(sessao, idNumero, analise.data);
    return Response.json({ ato }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Ações sobre um ato aberto:
 *   * `confirmar` — a TESTEMUNHA confirma com a própria sessão (hash + data).
 *     Keyless de propósito: a autorização é SER a testemunha indicada; quem
 *     não é recebe 404 (ausência, não máscara).
 *   * `desfecho` — o DP narra o desfecho (chave rh.conduta.gerir).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAcaoAto.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    if (analise.data.acao === "confirmar") {
      // Regularização (A8): a testemunha pode estar ela mesma bloqueada pelo
      // gate — confirmar o testemunho é dever dela e não pode fechar.
      const sessao = await exigirSessaoParaRegularizacao();
      const confirmacao = await confirmarTestemunho(
        sessao,
        idNumero,
        analise.data.ato_id
      );
      return Response.json({ testemunho: confirmacao });
    }
    // A1: o proxy libera PATCH neste caminho SEM olhar o corpo (a confirmação
    // precisa passar) — então é AQUI que o ramo de gestão barra o bloqueado:
    // quem deve ciência não registra desfecho de ato (B4 — gere depois de
    // regularizar). A tranca geral de exigirPermissao (A8) fica logo atrás.
    exigirCienciaRegularParaGerirCiclo(await lerSessao());
    const sessao = await exigirPermissao(CHAVE_CONDUTA_GERIR);
    const desfecho = await registrarDesfechoAto(
      sessao,
      idNumero,
      analise.data.ato_id,
      analise.data.desfecho
    );
    return Response.json({ ato: desfecho });
  } catch (erro) {
    return responderErro(erro);
  }
}
