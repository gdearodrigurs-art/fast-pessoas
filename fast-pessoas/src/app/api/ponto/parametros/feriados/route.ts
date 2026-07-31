import { esquemaNovoFeriado } from "@/dominios/ponto/esquemas";
import { criarFeriado } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Cadastra feriado ou ponto facultativo. Só FERIADO é dia de repouso (trabalho
 * vira HE 100%); ponto facultativo é dia útil comum. Abrangência resolve a
 * hierarquia: nacional vale para todos, estadual exige UF, municipal exige UF
 * e município.
 */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.parametros");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNovoFeriado.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path.join(".") || undefined,
        },
        { status: 400 }
      );
    }
    const id = await criarFeriado(sessao, analise.data);
    return Response.json({ feriado_id: id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
