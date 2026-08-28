import { esquemaDeclaracaoRacaCor } from "@/dominios/colaboradores/esquemas";
import {
  declararMinhaRacaCor,
  minhaRacaCor,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirSessao } from "@/lib/sessao";

/**
 * AUTODECLARAÇÃO de raça-cor (decisão A5:b) — a forma do portal inteiro:
 * nenhuma operação aceita `colaborador_id`; o titular sai da SESSÃO, dentro do
 * serviço. Keyless por titularidade (molde da ciência de posse): declarar a
 * própria raça-cor é ato do titular, não concessão de chave. O DP lê o dado
 * individual por outra porta (/api/colaboradores/[id]/raca-cor, com chave
 * sensível e trilha); o agregado do painel continua respeitando o piso k.
 */
export async function GET() {
  try {
    const sessao = await exigirSessao();
    return Response.json(await minhaRacaCor(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirSessao();
    const corpo = await request.json().catch(() => null);
    const analise = esquemaDeclaracaoRacaCor.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    return Response.json(await declararMinhaRacaCor(sessao, analise.data), {
      status: 201,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
