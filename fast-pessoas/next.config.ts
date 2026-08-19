import type { NextConfig } from "next";

// Fora de produção o React usa `eval` para reconstruir stacks de erro no browser,
// então 'unsafe-eval' entra SÓ em dev. Em produção o Next não usa eval por padrão.
const emDev = process.env.NODE_ENV !== "production";

// CSP sem nonce. O app não tem infraestrutura de nonce (o proxy.ts não gera um), e
// o Next injeta scripts e estilos inline no shell — sem nonce eles exigem
// 'unsafe-inline'. Ainda assim o CSP fecha o resto: default-src 'self',
// object-src 'none', frame-ancestors 'none', base-uri 'self', form-action 'self' —
// defesa em profundidade junto do X-Frame-Options. As fontes são self-hospedadas
// pelo next/font (servidas na própria origem), então font-src 'self' basta.
// `upgrade-insecure-requests` só em produção: em dev o servidor é http://localhost
// e o upgrade para https quebraria o carregamento dos assets.
const cspDiretivas = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${emDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(emDev ? [] : ["upgrade-insecure-requests"]),
];
const CSP = cspDiretivas.join("; ");

// Os quatro primeiros são seguros e obrigatórios em toda rota; o CSP é a camada
// best-effort verificada no dev server (login + tela interna, console sem bloqueio).
const CABECALHOS_SEGURANCA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: CSP },
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
