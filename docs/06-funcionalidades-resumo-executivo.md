# Fast Pessoas — Funcionalidades previstas (resumo para a Diretoria de Pessoas)

> Sistema próprio de DP/RH da Fast, construído em etapas. O time de DP/RH recebe as primeiras
> partes para usar e opinar já nos primeiros meses — o desenho evolui com o feedback de vocês.
> Documento de 2026-07-24; detalhe completo em `docs/03-modulos/`.

## Funcionalidades

**1. Ficha e histórico do funcionário** — cadastro completo e linha do tempo de tudo que acontece com cada colaborador: admissão, cargos e salários, ocorrências, feedbacks, férias, afastamentos, treinamentos, até o desligamento. É a base de todos os outros módulos.

**2. Solicitações e aprovações** — canal único entre funcionário e DP: pedido de documentos e declarações, aprovação de férias e de ajuste de ponto, pendências com prazo e status, avisos automáticos por e-mail. Acaba o vai-e-vem por WhatsApp/papel.

**3. Check-in diário de clima** — pergunta rápida por dia ("como você está se sentindo hoje?", "como você tem se sentido sobre suas entregas?") respondida com emojis + comentário opcional. Painéis de tendência por unidade e equipe para RH e gestores.

**4. Documentos e assinatura digital** — contratos, termos, avisos e holerites guardados digitalmente, com registro de ciência/assinatura eletrônica do funcionário. Nada mais se perde em pasta física.

**5. Controle de ponto** — marcação por aplicativo homologado (fornecedor de mercado, conforme a legislação de ponto). No nosso sistema: espelho de ponto, tratamento de marcações com aprovação do gestor, escalas e jornadas, banco de horas — alimentando a folha automaticamente.

**6. Férias e afastamentos** — períodos aquisitivos com alerta de vencimento (evita férias em dobro), programação e aprovação de férias com os prazos legais, licenças e atestados com sigilo médico (gestor vê o período, nunca o motivo), reflexo automático no ponto e na folha.

**7. Recrutamento e seleção** — requisição de vaga com aprovação e controle de quadro, vaga criada a partir do cargo com faixa salarial, pipeline de candidatos por etapas (triagem → entrevistas → teste → oferta) com pareceres registrados, banco de talentos e comunicação com candidatos. O aprovado vira admissão automaticamente — o fluxo fecha de ponta a ponta.

**8. Admissão digital** — checklist de admissão, coleta digital dos documentos do novo colaborador, contrato de experiência já amarrado às avaliações de 45/90 dias, e envio dos eventos ao eSocial no prazo.

**9. Folha de pagamento própria** — cálculo completo dentro do sistema: proventos, descontos, INSS/IRRF/FGTS, 13º, férias, rescisões e provisões, com fechamento mensal conferido e travado. **Transição segura:** o Nasajon continua sendo a folha oficial enquanto a nossa roda em paralelo; só desligamos quando os resultados baterem por competências seguidas.

**10. Obrigações digitais** — transmissão própria de eSocial, FGTS Digital e DCTFWeb, com painel de prazos e status por competência — nenhuma obrigação vence sem alerta.

**11. Benefícios** — catálogo (VT, VR/VA, plano de saúde, convênios), regras de elegibilidade por cargo/unidade, adesões e cancelamentos pelo próprio sistema, descontos automáticos na folha.

**12. Avaliação e desenvolvimento (360)** — ciclos de avaliação de experiência (45/90 dias) e de desempenho, notas por pilares incluindo os 9 Valores Fast, plano de desenvolvimento (PDI) e feedbacks registrados. As regras (pesos, faixas, periodicidade) são configuráveis pelo RH, sem depender de TI.

**13. Desligamento** — processo guiado por checklist: verificação de estabilidades antes de iniciar, aviso prévio, exame demissional, devolução de equipamentos/EPIs, rescisão calculada e prazo legal de pagamento controlado com alerta. **Entrevista de desligamento com indicador oficial**: nenhum desligamento se encerra sem o desfecho da entrevista registrado (realizada, recusada ou não realizada com motivo), e o painel acompanha o **% de entrevistas realizadas contra a meta do setor**, por unidade e por mês.

**14. Saúde e segurança (SST)** — ASOs com alerta de vencimento, entrega de EPIs com termo assinado, registro de CAT e eventos de SST do eSocial.

**15. Relatórios e indicadores** — turnover, absenteísmo, horas extras, custo de pessoal por unidade e centro de custo, headcount, **% de entrevistas de desligamento realizadas** e painel de vencimentos (férias, ASOs, contratos de experiência). **As metas de todos os indicadores são definidas pelo próprio RH numa página de Metas de Indicadores** — global ou por unidade, com histórico — nada fica travado no sistema.

## Garantias transversais (valem para tudo)

- **Acesso por papel:** cada pessoa vê só o que deve — funcionário vê o seu, gestor vê a equipe, DP/RH vê o todo.
- **Auditoria completa:** toda alteração e todo acesso a dado sensível (salário, atestado, avaliação) ficam registrados.
- **LGPD:** dados de saúde criptografados, clima desenhado para proteger quem responde, prazos de guarda por tipo de dado.
- **Backup diário** com restauração testada.

## Ordem de entrega (visão simplificada)

| Etapa | O que entra |
|---|---|
| **Primeiras entregas (~2-3 meses)** | Ficha e histórico, solicitações/aprovações, check-in de clima, documentos digitais |
| **Na sequência** | Admissão digital, afastamentos, ponto, férias, desligamento, assinatura eletrônica, avaliação (1ª versão), benefícios, recrutamento e seleção |
| **Trilha mais longa (em paralelo)** | Folha própria + obrigações digitais — com o período de paralelo seguro com o Nasajon antes de assumir |
| **Depois** | SST completo, indicadores avançados, integração com o portal corporativo |
