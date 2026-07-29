import { relatorioDiversidade } from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("relatorio.ver");
    // Só agregado sai daqui, com supressão de recorte pequeno no serviço; a
    // leitura entra em audit.leitura_sensivel (gênero é autodeclarado).
    return Response.json(await relatorioDiversidade(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}
