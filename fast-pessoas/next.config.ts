import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O SDK da Anthropic usa o cliente HTTP nativo do Node (undici + bundle de CAs
  // do Node). Empacotado pelo Turbopack, a cópia bundlada não herda esse bundle
  // de CAs e a chamada HTTPS falha na verificação do certificado
  // (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Marcá-lo como externo faz o Next carregá-lo
  // como módulo Node em runtime, com o fetch/TLS corretos.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
