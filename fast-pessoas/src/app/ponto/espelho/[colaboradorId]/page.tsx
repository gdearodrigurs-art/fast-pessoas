import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { EspelhoPontoTela } from "./espelho-ponto";

/**
 * Espelho de ponto de uma pessoa numa competência. A página NÃO decide quem
 * pode ver quem: ela só exige sessão e passa adiante — o alcance (próprio,
 * liderado, empresa toda) é conferido no serviço, a cada chamada da API.
 */
export default async function PaginaEspelhoPonto({
  params,
  searchParams,
}: {
  params: Promise<{ colaboradorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirSessaoDePagina();
  const { colaboradorId } = await params;
  const id = Number(colaboradorId);
  if (!Number.isInteger(id) || id <= 0) {
    redirect("/");
  }
  const busca = await searchParams;
  const texto = (chave: string): string | null => {
    const valor = busca[chave];
    return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
  };

  // Flag só de RENDERIZAÇÃO do formulário de correção; a API reconfere.
  const linhas = await consultar<{ ajustar: boolean }>(
    "SELECT sistema.tem_permissao($1, 'ponto.ajustar') AS ajustar",
    [sessao.usuario_id]
  );

  const ano = Number(texto("ano"));
  const mes = Number(texto("mes"));
  return (
    <EspelhoPontoTela
      colaboradorId={id}
      anoInicial={Number.isInteger(ano) && ano >= 2020 ? ano : null}
      mesInicial={Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : null}
      podeAjustar={Boolean(linhas[0]?.ajustar)}
    />
  );
}
