import {
  TIPOS_TABELA_LEGAL,
  TipoTabelaLegal,
} from "@/dominios/folha/esquemas";
import { conferirTabelaLegal } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../../../../identificador";

function tipoValido(valor: string): TipoTabelaLegal {
  if ((TIPOS_TABELA_LEGAL as readonly string[]).includes(valor)) {
    return valor as TipoTabelaLegal;
  }
  throw new ErroHttp(404, "Tabela legal desconhecida.");
}

/** Marca a versão como conferida pelo DP — gate da aprovação de competência. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tipo: string; id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.parametros");
    const { tipo, id } = await params;
    await conferirTabelaLegal(sessao, tipoValido(tipo), idFolha(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
