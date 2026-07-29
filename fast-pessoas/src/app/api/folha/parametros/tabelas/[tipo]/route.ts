import {
  esquemaNovaTabelaInss,
  esquemaNovaTabelaIrrf,
  esquemaNovosParametrosFolha,
  TIPOS_TABELA_LEGAL,
  TipoTabelaLegal,
} from "@/dominios/folha/esquemas";
import {
  criarVersaoInss,
  criarVersaoIrrf,
  criarVersaoParametros,
} from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

function tipoValido(valor: string): TipoTabelaLegal {
  if ((TIPOS_TABELA_LEGAL as readonly string[]).includes(valor)) {
    return valor as TipoTabelaLegal;
  }
  throw new ErroHttp(404, "Tabela legal desconhecida.");
}

/** Nova versão da tabela legal — entra ativa e NÃO conferida pelo DP. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tipo: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const { tipo } = await params;
    const tabela = tipoValido(tipo);
    const corpo = await request.json().catch(() => null);
    if (tabela === "inss") {
      const analise = esquemaNovaTabelaInss.safeParse(corpo);
      if (!analise.success) {
        return Response.json(
          { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
          { status: 400 }
        );
      }
      await criarVersaoInss(sessao, analise.data);
    } else if (tabela === "irrf") {
      const analise = esquemaNovaTabelaIrrf.safeParse(corpo);
      if (!analise.success) {
        return Response.json(
          { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
          { status: 400 }
        );
      }
      await criarVersaoIrrf(sessao, analise.data);
    } else {
      const analise = esquemaNovosParametrosFolha.safeParse(corpo);
      if (!analise.success) {
        return Response.json(
          { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
          { status: 400 }
        );
      }
      await criarVersaoParametros(sessao, analise.data);
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
