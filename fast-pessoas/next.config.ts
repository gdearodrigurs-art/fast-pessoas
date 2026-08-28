import type { NextConfig } from "next";

// O CSP NÃO mora mais aqui (decisão C3:a — Onda 2): headers() é estático, e um
// nonce precisa nascer por request. Ele é montado no src/proxy.ts, com
// script-src 'self' 'nonce-…' 'strict-dynamic' e SEM 'unsafe-inline' em
// script-src. Uma exceção sobrevive lá, e o porquê fica registrado AQUI:
//
//   style-src 'self' 'unsafe-inline'
//
// porque (a) atributo style={{…}} do React — usado em dezenas de componentes
// (barras de progresso, larguras calculadas) — é regido por style-src e nonce
// NÃO se aplica a atributo, só a <style>/<link>; e (b) em dev o Next injeta
// <style> inline sem nonce no hot-reload. Trocar isso exigiria migrar todo
// style={{…}} para CSS custom properties — fora do escopo da C3.
//
// Os quatro cabeçalhos abaixo seguem aqui: são estáticos e valem em toda rota.
const CABECALHOS_SEGURANCA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // O SDK da Anthropic usa o cliente HTTP nativo do Node (undici + bundle de CAs
  // do Node). Empacotado pelo Turbopack, a cópia bundlada não herda esse bundle
  // de CAs e a chamada HTTPS falha na verificação do certificado
  // (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Marcá-lo como externo faz o Next carregá-lo
  // como módulo Node em runtime, com o fetch/TLS corretos.
  serverExternalPackages: ["@anthropic-ai/sdk"],

  // Cabeçalhos de segurança aplicados a TODAS as rotas ('/(.*)').
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: CABECALHOS_SEGURANCA,
      },
    ];
  },
};

export default nextConfig;
