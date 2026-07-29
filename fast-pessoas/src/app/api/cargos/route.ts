import { esquemaCriacaoCargo } from "@/dominios/colaboradores/esquemas";
import {
  criarCargo,
  listarCargosAdministraveis,
} from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao, exigirPermissao } from "@/lib/sessao";

/**
 * Leitura em dois níveis (migration 0019 — segregação de perfis):
 *  - `rh.cargo.administrar` → cargo + descritivo/CHA + FAIXA SALARIAL;
 *  - `rh.cargo.ver`         → cargo + descritivo/CHA, faixa AUSENTE.
 * A faixa é dado de remuneração: recrutador e líder de T&D precisam do
 * descritivo (RCF) para escrever a vaga e desenhar trilha, não da faixa. Os
 * campos são removidos do payload — ausência, não máscara.
 */
export async function GET() {
  try {
    const { concedidas } = await exigirAlgumaPermissao([
      "rh.cargo.administrar",
      "rh.cargo.ver",
    ]);
    const cargos = await listarCargosAdministraveis();
    if (concedidas.has("rh.cargo.administrar")) {
      return Response.json({ cargos });
    }
    // Remoção por delete (não por lista de campos permitidos) de propósito: se
    // o cargo ganhar campo novo, ele passa a aparecer para quem só lê — e o
    // que é remuneração continua fora, sem depender de atualizar uma lista.
    const semFaixa = cargos.map((cargo) => {
      const copia: Record<string, unknown> = { ...cargo };
      delete copia.faixa_min;
      delete copia.faixa_max;
      delete copia.faixa_inicio_vigencia;
      return copia;
    });
    return Response.json({ cargos: semFaixa });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rh.cargo.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoCargo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarCargo(sessao, analise.data);
    const cargos = await listarCargosAdministraveis();
    return Response.json({ cargos }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
