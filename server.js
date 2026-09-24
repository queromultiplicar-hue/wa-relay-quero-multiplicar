/**
 * Servidor de retransmissao do WhatsApp - Instituto Quero Multiplicar
 * Versao com log detalhado de erro de conexao para diagnostico.
 */

const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const pino = require("pino");
if (!global.crypto) { global.crypto = require("crypto").webcrypto; }

const path = require("path");
const {
  default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 3000;
const RELAY_SECRET = process.env.RELAY_SECRET || "";
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, "auth_data");

if (!RELAY_SECRET) {
    console.warn("[AVISO] RELAY_SECRET nao definido!");
}

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let ultimoQr = null;
let conectado = false;
let numeroConectado = null;
let iniciandoConexao = false;
let tentativas = 0;

function normalizarTelefoneParaJid(telefone) {
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
    tentativas++;

  try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log("[WhatsApp] Tentativa", tentativas, "- versao Baileys:", version, "isLatest:", isLatest);

      sock = makeWASocket({
              version,
              auth: state,
              logger: pino({ level: "silent" }),
              printQRInTerminal: false,
              browser: ["Ubuntu", "Chrome", "20.0.04"],
              connectTimeoutMs: 60000,
              syncFullHistory: false
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update) => {
              const { connection, lastDisconnect, qr } = update;

                       if (qr) {
                                 ultimoQr = qr;
                                 conectado = false;
                                 console.log("[WhatsApp] QR Code gerado, aguardando leitura.");
                       }

                       if (connection === "open") {
                                 conectado = true;
                                 ultimoQr = null;
                                 tentativas = 0;
                                 numeroConectado = (sock.user && sock.user.id) ? sock.user.id.split(":")[0] : null;
                                 console.log("[WhatsApp] Conectado! Numero:", numeroConectado);
                       }

                       if (connection === "close") {
                                 conectado = false;
                                 const err = lastDisconnect && lastDisconnect.error;
                                 const motivo = err && err.output ? err.output.statusCode : null;
                                 const deslogado = motivo === DisconnectReason.loggedOut;
                                 console.log("[WhatsApp] Conexao encerrada. statusCode:", motivo, "| mensagem:", err && err.message, "| deslogado:", deslogado);
                                 iniciandoConexao = false;
                                 if (!deslogado) {
                                             const espera = Math.min(3000 + tentativas * 1000, 15000);
                                             setTimeout(() => {
                                                           iniciarConexaoWhatsapp().catch((e) => console.error("[WhatsApp] Erro ao reconectar:", e));
                                             }, espera);
                                 } else {
                                             console.log("[WhatsApp] Sessao deslogada. Acesse /qr para reconectar do zero.");
                                 }
                       }
      });

      sock.ev.on("messages.upsert", ({ messages, type }) => {
              if (type !== "notify") return;
              messages.forEach((m) => {
                        if (m.key.fromMe) return;
                        const texto = m.message && (m.message.conversation || (m.message.extendedTextMessage && m.message.extendedTextMessage.text));
                        if (texto) console.log("[WhatsApp] Mensagem recebida de", m.key.remoteJid, ":", texto);
              });
      });

      iniciandoConexao = false;
  } catch (err) {
        console.error("[WhatsApp] Erro fatal ao iniciar conexao:", err && err.message, err && err.stack);
        iniciandoConexao = false;
        setTimeout(() => {
                iniciarConexaoWhatsapp().catch((e) => console.error("[WhatsApp] Erro ao reconectar:", e));
        }, 5000);
  }
}

iniciarConexaoWhatsapp().catch((err) => {
    console.error("Erro ao iniciar conexao com o WhatsApp:", err);
    iniciandoConexao = false;
});

app.get("/", (req, res) => {
    res.send("Servidor de retransmissao WhatsApp - Quero Multiplicar. Veja /qr para conectar ou /status para ver o estado atual.");
});

app.get("/status", (req, res) => {
    res.json({ connected: conectado, number: numeroConectado, tentativas });
});

app.get("/qr", async (req, res) => {
    if (conectado) {
          res.send(`<html><body style="font-family:sans-serif; text-align:center; padding:60px">
                <h2>WhatsApp ja esta conectado</h2>
                      <p>Numero conectado: <b>${numeroConectado || "-"}</b></p>
                          </body></html>`);
          return;
    }
    if (!ultimoQr) {
          res.send(`<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif; text-align:center; padding:60px">
                <h2>Gerando QR Code... (tentativa ${tentativas})</h2><p>Atualize a pagina em alguns segundos.</p>
                    </body></html>`);
          return;
    }
    const qrImg = await QRCode.toDataURL(ultimoQr);
    res.send(`<html><head><meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif; text-align:center; padding:40px">
        <h2>Escaneie este QR Code com o WhatsApp do celular</h2>
            <p style="color:#666">No celular: WhatsApp &gt; Configuracoes &gt; Aparelhos conectados &gt; Conectar um aparelho</p>
                <img src="${qrImg}" style="width:280px; height:280px; border:1px solid #ddd; border-radius:12px; padding:10px" />
                    <p style="color:#999; font-size:12px">Esta pagina atualiza sozinha a cada 20 segundos.</p>
                      </body></html>`);
});

function checarSegredo(req, res, next) {
    const chave = req.header("x-relay-secret") || "";
    if (!RELAY_SECRET || chave !== RELAY_SECRET) {
          res.status(401).json({ error: "Chave invalida (x-relay-secret)." });
          return;
    }
    next();
}

app.post("/send", checarSegredo, async (req, res) => {
    try {
          if (!conectado || !sock) {
                  res.status(503).json({ error: "WhatsApp ainda nao esta conectado. Acesse /qr para conectar." });
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
    console.log(`Servidor de retransmissao WhatsApp rodando na porta ${PORT}`);
});
