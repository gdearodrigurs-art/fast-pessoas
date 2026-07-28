import QRCode from "qrcode";
import { iniciarConfiguracao2fa } from "@/dominios/identidade/servico";
import { assinarSecretPendente } from "@/dominios/identidade/token-2fa";
import { responderErro } from "@/lib/http";
import { ErroHttp, lerSessao } from "@/lib/sessao";
import { gravarCookiePendente } from "../cookie-pendente";

export async function POST() {
  try {
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }

    const inicio = await iniciarConfiguracao2fa(sessao);

    // O secret NÃO é gravado no banco: viaja num token assinado de curta
    // duração (cookie httpOnly) até a confirmação do código.
    const token = await assinarSecretPendente(
      sessao.usuario_id,
      inicio.secret_base32
    );
    await gravarCookiePendente(token);

    const qrDataUrl = await QRCode.toDataURL(inicio.otpauth_uri, {
      margin: 1,
      width: 240,
    });

    return Response.json({
      otpauth_uri: inicio.otpauth_uri,
      secret: inicio.secret_base32,
      qr_data_url: qrDataUrl,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
