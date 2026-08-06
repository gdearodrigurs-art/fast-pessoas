import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { lerSessao } from "@/lib/sessao";
import { ProvedorSessao } from "./sessao-contexto";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fast Pessoas",
  description: "Sistema de DP/RH da Fast",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sessão pendente de 2FA ainda não é sessão: quem parou no TOTP não tem nome
  // no cabeçalho, porque ainda não entrou.
  const sessao = await lerSessao();
  const identidade =
    sessao && !sessao.pendente_2fa
      ? { nome: sessao.nome, papel: sessao.papel }
      : null;

  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ProvedorSessao identidade={identidade}>{children}</ProvedorSessao>
      </body>
    </html>
  );
}
