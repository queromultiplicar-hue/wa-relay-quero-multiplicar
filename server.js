/**
 * Servidor de retransmissão do WhatsApp — Instituto Quero Multiplicar
 * =====================================================================
 * O que isso faz:
 *   Conecta ao WhatsApp Web (como se fosse o app WhatsApp Web normal, você
 *   escaneia um QR Code com o celular) usando a biblioteca Baileys (não é
 *   a API oficial do Facebook/Meta — é uma alternativa gratuita enquanto
 *   você resolve a liberação da conta comercial).
 *
 *   Expõe 3 endereços (rotas) que o sistema (index.html) já sabe usar:
 *     GET  /qr      -> página com o QR Code pra você escanear
 *     GET  /status  -> {"connected": true/false, "number": "55..."}
 *     POST /send    -> manda uma mensagem de WhatsApp de verdade
 *                      (é chamado automaticamente pelo sistema quando
 *                      você clica em "Enviar" na aba Comunicação > WhatsApp)
 *
 * IMPORTANTE — Termos de uso do WhatsApp:
 *   Isso NÃO é a API oficial. É uma automação não-oficial (o WhatsApp Web
 *   "hackeado" para ser controlado por código). O WhatsApp pode banir o
 *   número se detectar uso muito automatizado/fora do padrão humano. Use
 *   com moderação (evite disparos em massa) e migre pra API oficial assim
 *   que a Meta liberar a alteração na sua conta.
 *
 * Como rodar:
 *   1. npm install
 *   2. Defina a variável de ambiente RELAY_SECRET (uma senha forte, você
 *      escolhe) — é a mesma chave que você vai colar no sistema, no campo
 *      "Chave do servidor (RELAY_SECRET)".
 *   3. npm start
 *   4. Abra http://SEU-SERVIDOR/qr no navegador e escaneie com o WhatsApp
 *      do celular (WhatsApp > Aparelhos conectados > Conectar um aparelho).
 */

const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 3000;
const RELAY_SECRET = process.env.RELAY_SECRET || "";
// Pasta onde a sessão do WhatsApp fica salva. No Railway, monte um Volume
// persistente nesse caminho (ex.: /data/auth) para não precisar escanear
// o QR Code de novo toda vez que o servidor reiniciar.
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, "auth_data");

if (!RELAY_SECRET) {
  console.warn("[AVISO] RELAY_SECRET não definido — qualquer um poderia usar o /send. Configure essa variável de ambiente!");
}

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let ultimoQr = null;        // último QR Code gerado (texto cru do Baileys)
let conectado = false;
let numeroConectado = null;
let iniciandoConexao = false;

function normalizarTelefoneParaJid(telefone) {
  // Aceita "(21) 98765-4321", "+55 21 98765-4321", "5521987654321" etc.
  // Só dígitos, e garante o código do país (Brasil = 55) na frente.
  let digitos = String(telefone || "").replace(/\D/g, "");
  if (!digitos) return null;
  if (!digitos.startsWith("55") && digitos.length <= 11) {
    digitos = "55" + digitos;
  }
  return digitos + "@s.whatsapp.net";
}

async function iniciarConexaoWhatsapp() {
  if (iniciandoConexao) return;
  iniciandoConexao = true;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Quero Multiplicar", "Chrome", "1.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      ultimoQr = qr;
      conectado = false;
    }

    if (connection === "open") {
      conectado = true;
      ultimoQr = null;
      numeroConectado = (sock.user && sock.user.id) ? sock.user.id.split(":")[0] : null;
      console.log("[WhatsApp] Conectado! Número:", numeroConectado);
    }

    if (connection === "close") {
      conectado = false;
      const motivo = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      const deslogado = motivo === DisconnectReason.loggedOut;
      console.log("[WhatsApp] Conexão encerrada. Deslogado?", deslogado);
      iniciandoConexao = false;
      if (!deslogado) {
        // Reconecta automaticamente (ex.: caiu a internet) — mas se foi um
        // logout de verdade (você removeu o aparelho no celular), não tenta
        // de novo sozinho; é preciso escanear o QR Code de novo em /qr.
        setTimeout(iniciarConexaoWhatsapp, 3000);
      }
    }
  });

  // Loga mensagens recebidas no console por enquanto (próximo passo, se
  // quiser: gravar essas mensagens direto no sistema/Supabase).
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    messages.forEach((m) => {
      if (m.key.fromMe) return;
      const texto = m.message && (m.message.conversation || (m.message.extendedTextMessage && m.message.extendedTextMessage.text));
      if (texto) console.log("[WhatsApp] Mensagem recebida de", m.key.remoteJid, ":", texto);
    });
  });

  iniciandoConexao = false;
}

iniciarConexaoWhatsapp().catch((err) => {
  console.error("Erro ao iniciar conexão com o WhatsApp:", err);
  iniciandoConexao = false;
});

// ---------------------------------------------------------------------
// Rotas HTTP
// ---------------------------------------------------------------------

app.get("/", (req, res) => {
  res.send("Servidor de retransmissão WhatsApp — Quero Multiplicar. Veja /qr para conectar ou /status para ver o estado atual.");
});

app.get("/status", (req, res) => {
  res.json({ connected: conectado, number: numeroConectado });
});

app.get("/qr", async (req, res) => {
  if (conectado) {
    res.send(`<html><body style="font-family:sans-serif; text-align:center; padding:60px">
      <h2>✅ WhatsApp já está conectado</h2>
      <p>Número conectado: <b>${numeroConectado || "—"}</b></p>
      <p style="color:#666">Se precisar trocar de número, desconecte pelo próprio celular em WhatsApp &gt; Aparelhos conectados.</p>
    </body></html>`);
    return;
  }
  if (!ultimoQr) {
    res.send(`<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif; text-align:center; padding:60px">
      <h2>Gerando QR Code…</h2><p>Atualize a página em alguns segundos.</p>
    </body></html>`);
    return;
  }
  const qrImg = await QRCode.toDataURL(ultimoQr);
  res.send(`<html><head><meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif; text-align:center; padding:40px">
    <h2>Escaneie este QR Code com o WhatsApp do celular</h2>
    <p style="color:#666">No celular: WhatsApp &gt; Configurações &gt; Aparelhos conectados &gt; Conectar um aparelho</p>
    <img src="${qrImg}" style="width:280px; height:280px; border:1px solid #ddd; border-radius:12px; padding:10px" />
    <p style="color:#999; font-size:12px">Esta página atualiza sozinha a cada 20 segundos.</p>
  </body></html>`);
});

function checarSegredo(req, res, next) {
  const chave = req.header("x-relay-secret") || "";
  if (!RELAY_SECRET || chave !== RELAY_SECRET) {
    res.status(401).json({ error: "Chave inválida (x-relay-secret)." });
    return;
  }
  next();
}

app.post("/send", checarSegredo, async (req, res) => {
  try {
    if (!conectado || !sock) {
      res.status(503).json({ error: "WhatsApp ainda não está conectado. Acesse /qr para conectar." });
      return;
    }
    const { to, text } = req.body || {};
    const jid = normalizarTelefoneParaJid(to);
    if (!jid || !text) {
      res.status(400).json({ error: "Informe \"to\" (telefone) e \"text\" (mensagem)." });
      return;
    }
    await sock.sendMessage(jid, { text });
    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res.status(500).json({ error: "Falha ao enviar a mensagem." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de retransmissão WhatsApp rodando na porta ${PORT}`);
});
