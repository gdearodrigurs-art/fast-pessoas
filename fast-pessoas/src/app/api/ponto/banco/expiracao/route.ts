import {
  expirarSaldosBanco,
  previaExpiracaoBanco,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Expiração do saldo pelo prazo de compensação da regra vigente.
 *
 * GET  = PRÉVIA, não grava nada: quem tem hora vencida, quanto, de qual crédito
 *        e qual é o próximo vencimento. É o que a tela mostra antes do botão.
 * POST = executa, gravando um movimento de origem 'expiracao' por pessoa.
 *
 * Chave `ponto.administrar` (a mesma da apuração): expirar mexe no passivo da
 * empresa inteira, não é ajuste pontual de uma pessoa.
 */
export async function GET() {
  try {
    await exigirPermissao("ponto.administrar");
    return Response.json(await previaExpiracaoBanco());
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.administrar");
    const corpo = await request.json().catch(() => null);
    // Data de referência só para conferência/retroação consciente do DP; sem
    // ela vale hoje. Formato AAAA-MM-DD, o mesmo do resto do módulo.
    const referencia =
      corpo && typeof corpo.data_referencia === "string"
        ? corpo.data_referencia
        : undefined;
    if (referencia && !/^\d{4}-\d{2}-\d{2}$/.test(referencia)) {
      return Response.json(
        { erro: "Data no formato AAAA-MM-DD", campo: "data_referencia" },
        { status: 400 }
      );
    }
    return Response.json(await expirarSaldosBanco(sessao, referencia));
  } catch (erro) {
    return responderErro(erro);
  }
}
