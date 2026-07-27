import { registrarSaida } from "@/dominios/identidade/servico";
import { destruirSessao, lerSessao } from "@/lib/sessao";

export async function POST() {
  const sessao = await lerSessao();
  if (sessao) {
    await registrarSaida(sessao);
  }
  await destruirSessao();
  return Response.json({ ok: true });
}
