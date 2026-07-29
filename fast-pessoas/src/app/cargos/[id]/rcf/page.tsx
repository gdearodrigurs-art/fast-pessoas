import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ROTULOS_VINCULO,
  type TipoVinculo,
} from "@/dominios/colaboradores/esquemas";
import { obterRcfCargo } from "@/dominios/colaboradores/servico";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { BotaoImprimir } from "./botao-imprimir";
import estilos from "./rcf.module.css";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * RCF imprimível — o gestor usa como documento (é o que ele assina/entrega).
 * Não é dado sensível, e o gate reflete isso: administra cargo, LÊ cargo
 * (`rh.cargo.ver`, de recrutador e líder de T&D — migration 0019: quem escreve
 * a vaga precisa do descritivo) ou vê ficha de colaborador (gestor/RH/DP/
 * diretoria). Nenhuma faixa salarial aparece aqui, então não há o que segregar.
 * Funcionário sem essas chaves vê o RCF do próprio cargo na sua ficha.
 */
export default async function PaginaRcf({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const { id } = await params;
  const cargoId = Number(id);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    redirect("/cargos");
  }
  const linhas = await consultar<{ pode_ver: boolean; pode_admin: boolean }>(
    `SELECT (sistema.tem_permissao($1, 'rh.cargo.administrar')
             OR sistema.tem_permissao($1, 'rh.cargo.ver')
             OR sistema.tem_permissao($1, 'rh.colaborador.ver')) AS pode_ver,
            sistema.tem_permissao($1, 'rh.cargo.administrar')    AS pode_admin`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.pode_ver) {
    redirect("/");
  }
  const rcf = await obterRcfCargo(cargoId);
  const contrato: TipoVinculo | null = rcf.tipo_contrato_previsto;

  return (
    <div className={estilos.pagina}>
      <div className={estilos.barra}>
        <Link className={estilos.voltar} href="/cargos">
          ← Cargos
        </Link>
        <BotaoImprimir />
      </div>

      <article className={estilos.documento}>
        <header className={estilos.topo}>
          <div className={estilos.marca}>Fast</div>
          <div>
            <h1>Descritivo de Cargos</h1>
            <p className={estilos.subtitulo}>
              RCF — Responsabilidade Chave da Função
            </p>
          </div>
        </header>

        <table className={estilos.identificacao}>
          <tbody>
            <tr>
              <th>Cargo</th>
              <td>{rcf.nome}</td>
            </tr>
            <tr>
              <th>Setor</th>
              <td>{rcf.setor ?? "—"}</td>
            </tr>
            <tr>
              <th>Líder Direto</th>
              <td>{rcf.cargo_lider_nome ?? "—"}</td>
            </tr>
            <tr>
              <th>Tipo de contrato</th>
              <td>{contrato ? ROTULOS_VINCULO[contrato] : "—"}</td>
            </tr>
          </tbody>
        </table>

        <section className={estilos.bloco}>
          <h2>Responsabilidade Chave da Função (Missão do Cargo)</h2>
          {rcf.missao ? (
            <p className={estilos.texto}>{rcf.missao}</p>
          ) : (
            <p className={estilos.pendente}>
              Não preenchido — o gestor completa em Cargos → Nova versão.
            </p>
          )}
        </section>

        <section className={estilos.bloco}>
          <h2>Atividades a desempenhar</h2>
          {rcf.atividades.length > 0 ? (
            <ol className={estilos.lista}>
              {rcf.atividades.map((atividade, indice) => (
                <li key={`${indice}-${atividade}`}>{atividade}</li>
              ))}
            </ol>
          ) : (
            <p className={estilos.pendente}>Não preenchido.</p>
          )}
        </section>

        <section className={estilos.bloco}>
          <h2>CHA</h2>
          <table className={estilos.cha}>
            <thead>
              <tr>
                <th>
                  CONHECIMENTOS
                  <span>perfil técnico</span>
                </th>
                <th>
                  HABILIDADES
                  <span>experiências necessárias</span>
                </th>
                <th>
                  ATITUDES
                  <span>comportamentos</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {(
                  [
                    rcf.cha.conhecimentos ?? [],
                    rcf.cha.habilidades ?? [],
                    rcf.cha.atitudes ?? [],
                  ] as string[][]
                ).map((coluna, indiceColuna) => (
                  <td key={indiceColuna}>
                    {coluna.length > 0 ? (
                      <ul className={estilos.lista}>
                        {coluna.map((item, indice) => (
                          <li key={`${indice}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className={estilos.pendente}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        <section className={estilos.bloco}>
          <h2>Observações importantes</h2>
          {rcf.observacoes ? (
            <p className={estilos.texto}>{rcf.observacoes}</p>
          ) : (
            <p className={estilos.pendente}>—</p>
          )}
        </section>

        <footer className={estilos.rodape}>
          Versão vigente desde {formatarData(rcf.inicio_vigencia)} · versão{" "}
          {rcf.versao_id} do cargo {rcf.cargo_id} · Fast Pessoas
          {linhas[0]?.pode_admin
            ? " · alterações geram versão nova, nunca reescrevem esta."
            : ""}
        </footer>
      </article>
    </div>
  );
}
