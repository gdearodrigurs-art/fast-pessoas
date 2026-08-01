"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  ROTULOS_TIPO_AFASTAMENTO,
  TIPOS_AFASTAMENTO,
  TipoAfastamento,
} from "@/dominios/afastamentos/esquemas";
import estilos from "./page.module.css";

interface Afastamento {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  // presentes só quando a API devolve a visão com dado de saúde
  tipo?: TipoAfastamento;
  tipo_rotulo: string;
  inicio: string;
  fim: string | null;
  detalhe_saude?: string | null;
  documento_id?: number | null;
  documento_titulo?: string | null;
  registrado_por_nome?: string;
}

interface ColaboradorOpcao {
  id: number;
  matricula: string;
  nome_completo: string;
}

interface DocumentoOpcao {
  id: number;
  titulo: string;
  colaborador_id: number | null;
  sensivel: boolean;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarPeriodo(inicio: string, fim: string | null): string {
  return fim
    ? `${formatarData(inicio)} a ${formatarData(fim)}`
    : `${formatarData(inicio)} (em curso)`;
}

export function PainelAfastamentos({
  podeRegistrar,
  podeVerSaude,
  podeVerDocSensivel,
}: {
  podeRegistrar: boolean;
  podeVerSaude: boolean;
  podeVerDocSensivel: boolean;
}) {
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);
  const [comSaude, setComSaude] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [colaboradores, setColaboradores] = useState<ColaboradorOpcao[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoOpcao[]>([]);
  const [colaboradorId, setColaboradorId] = useState("");
  // Nasce VAZIO: acidente de trabalho abre CAT e estabilidade de 12 meses,
  // maternidade abre estabilidade, INSS é previdenciário. Nada torna
  // "atestado" mais provável — a tela não escolhe a classificação legal.
  const [tipo, setTipo] = useState<TipoAfastamento | "">("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [detalheSaude, setDetalheSaude] = useState("");
  const [documentoId, setDocumentoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/afastamentos");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setAfastamentos(dados.afastamentos ?? []);
          setComSaude(Boolean(dados.com_saude));
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os afastamentos.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [versao]);

  useEffect(() => {
    if (!podeRegistrar) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/colaboradores");
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) {
          setColaboradores(dados.colaboradores ?? []);
        }
      } catch {
        // Sem a lista o formulário fica inutilizável, mas a lista ainda carrega.
      }
      try {
        // Atestados são documentos sensíveis: quem tem a chave lista com elas
        // (a leitura fica na trilha do GED); sem a chave, só os comuns.
        const resposta = await fetch(
          podeVerDocSensivel ? "/api/documentos?sensivel=true" : "/api/documentos"
        );
        const dados = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) {
          setDocumentos(dados.documentos ?? []);
        }
      } catch {
        // Documento é opcional — o registro segue sem anexo.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [podeRegistrar, podeVerDocSensivel]);

  const documentosDoColaborador = documentos.filter(
    (documento) =>
      !colaboradorId ||
      documento.colaborador_id === null ||
      documento.colaborador_id === Number(colaboradorId)
  );

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroEnvio(null);
    setAvisoEnvio(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/afastamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: Number(colaboradorId),
          tipo,
          inicio,
          fim: fim || null,
          detalhe_saude: detalheSaude || undefined,
          documento_id: documentoId ? Number(documentoId) : null,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setColaboradorId("");
        setTipo("");
        setInicio("");
        setFim("");
        setDetalheSaude("");
        setDocumentoId("");
        setAvisoEnvio(
          "Afastamento registrado. O detalhe de saúde foi cifrado e só aparece para quem tem a permissão específica."
        );
        setVersao((atual) => atual + 1);
      } else {
        setErroEnvio(dados.erro ?? "Não foi possível registrar o afastamento.");
      }
    } catch {
      setErroEnvio("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Afastamentos</h1>
        <p className={estilos.subtitulo}>
          Registro de afastamentos e licenças — dado de saúde cifrado, com
          leitura auditada.
        </p>

        {podeRegistrar && (
          <section className={estilos.cartao}>
            <h2>Registrar afastamento</h2>
            <form className={estilos.formulario} onSubmit={registrar}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="colaborador">
                  Colaborador
                </label>
                <select
                  className={estilos.campo}
                  id="colaborador"
                  required
                  value={colaboradorId}
                  onChange={(e) => setColaboradorId(e.target.value)}
                >
                  <option value="">Escolha…</option>
                  {colaboradores.map((colaborador) => (
                    <option key={colaborador.id} value={colaborador.id}>
                      {colaborador.nome_completo} ({colaborador.matricula})
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="tipo">
                  Tipo
                </label>
                <select
                  className={estilos.campo}
                  id="tipo"
                  required
                  value={tipo}
                  onChange={(e) =>
                    setTipo(e.target.value as TipoAfastamento | "")
                  }
                >
                  <option value="">Escolha o tipo</option>
                  {TIPOS_AFASTAMENTO.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {ROTULOS_TIPO_AFASTAMENTO[opcao]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="inicio">
                  Início
                </label>
                <input
                  className={estilos.campo}
                  id="inicio"
                  type="date"
                  required
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="fim">
                  Fim (vazio = em curso)
                </label>
                <input
                  className={estilos.campo}
                  id="fim"
                  type="date"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="documento">
                  Documento no GED (opcional)
                </label>
                <select
                  className={estilos.campo}
                  id="documento"
                  value={documentoId}
                  onChange={(e) => setDocumentoId(e.target.value)}
                >
                  <option value="">Sem documento</option>
                  {documentosDoColaborador.map((documento) => (
                    <option key={documento.id} value={documento.id}>
                      #{documento.id} — {documento.titulo}
                      {documento.sensivel ? " (sensível)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campoGrupoLargo}>
                <label className={estilos.rotulo} htmlFor="detalhe">
                  Detalhe de saúde (opcional — CID, médico/CRM)
                </label>
                <textarea
                  className={estilos.campo}
                  id="detalhe"
                  rows={2}
                  maxLength={2000}
                  value={detalheSaude}
                  onChange={(e) => setDetalheSaude(e.target.value)}
                />
                <span className={estilos.ajuda}>
                  Cifrado na aplicação (AES-256-GCM) antes de ir ao banco.
                  Nunca aparece para gestor/RH — só para quem tem
                  afastamento.saude.ver, com leitura registrada em trilha.
                </span>
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={enviando}
              >
                {enviando ? "Registrando…" : "Registrar"}
              </button>
            </form>
            {erroEnvio && <p className={estilos.erro}>{erroEnvio}</p>}
            {avisoEnvio && <p className={estilos.sucesso}>{avisoEnvio}</p>}
          </section>
        )}

        <section className={estilos.cartao}>
          <h2>Afastamentos registrados</h2>
          {podeVerSaude && (
            <p className={estilos.ajuda}>
              Você tem acesso ao dado de saúde: cada detalhe exibido nesta
              lista gera registro em audit.leitura_sensivel.
            </p>
          )}
          {erro && <p className={estilos.erro}>{erro}</p>}
          {carregando ? (
            <p className={estilos.subtitulo}>Carregando…</p>
          ) : (
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Tipo</th>
                    <th>Período</th>
                    {comSaude && <th>Detalhe de saúde</th>}
                    {comSaude && <th>Documento</th>}
                    {comSaude && <th>Registrado por</th>}
                  </tr>
                </thead>
                <tbody>
                  {afastamentos.map((afastamento) => (
                    <tr key={afastamento.id}>
                      <td>
                        {afastamento.colaborador_nome} (
                        {afastamento.matricula})
                      </td>
                      <td>{afastamento.tipo_rotulo}</td>
                      <td>
                        {formatarPeriodo(afastamento.inicio, afastamento.fim)}
                      </td>
                      {comSaude && (
                        <td>
                          {afastamento.detalhe_saude ? (
                            <>
                              <span className={estilos.etiquetaSensivel}>
                                Sensível
                              </span>
                              <span className={estilos.detalheSaude}>
                                {afastamento.detalhe_saude}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      {comSaude && (
                        <td>
                          {afastamento.documento_id ? (
                            <a
                              className={estilos.ligacao}
                              href={`/api/documentos/${afastamento.documento_id}/download`}
                            >
                              {afastamento.documento_titulo ??
                                `#${afastamento.documento_id}`}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      {comSaude && (
                        <td>{afastamento.registrado_por_nome ?? "—"}</td>
                      )}
                    </tr>
                  ))}
                  {afastamentos.length === 0 && (
                    <tr>
                      <td colSpan={comSaude ? 6 : 3}>
                        Nenhum afastamento registrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className={estilos.notaRodape}>
            Sem a permissão de saúde, a lista mostra apenas o rótulo genérico
            &quot;Afastamento&quot; e o período — o tipo específico e o detalhe
            ficam ausentes do payload. Datas no horário de Brasília.
          </p>
        </section>
      </main>
    </div>
  );
}
