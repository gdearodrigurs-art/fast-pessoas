import { lerSessao } from "@/lib/sessao";

export async function GET() {
  const sessao = await lerSessao();
  if (!sessao) {
    return Response.json({ erro: "Não autenticado" }, { status: 401 });
  }
  return Response.json({ usuario: sessao });
}
