import { z } from "zod";
import { aprovarCompetencia } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

const esquemaAprovacao = z.object({
  codigo_totp: z.string().regex(/^\d{6}$/, "Código do autenticador com 6 dígitos"),
});

/**
 * Aprova a competência (conferencia → aprovada). Exige: tabelas legais
 * conferidas pelo DP, TOTP revalidado no ato e aprovador ≠ quem calculou.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.aprovar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAprovacao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const competencia = await aprovarCompetencia(
      sessao,
      idFolha(id),
      analise.data.codigo_totp
    );
    return Response.json({ competencia });
  } catch (erro) {
    return responderErro(erro);
  }
}
