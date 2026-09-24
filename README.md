# Servidor de retransmissão WhatsApp — Quero Multiplicar

Recurso paliativo enquanto a Meta/Facebook não libera a alteração na conta
comercial. Conecta via QR Code (WhatsApp Web não-oficial) em vez da API
oficial. Veja o aviso de risco no topo do `server.js` antes de usar.

## Passo a passo — Deploy no Railway (gratuito para começar)

1. Acesse **https://railway.app** e crie uma conta (dá pra usar o login do
   Google/GitHub).
2. Clique em **"New Project"** → **"Empty Project"**.
3. Dentro do projeto, clique em **"New"** → **"Empty Service"** (ou **"GitHub Repo"**
   se você subir esta pasta para um repositório seu no GitHub — mais fácil
   de manter atualizado depois).
   - Se não quiser usar GitHub: clique no serviço criado → aba **"Settings"**
     → **"Source"** → **"Deploy from CLI"**, e siga as instruções para instalar
     o Railway CLI e rodar `railway up` dentro desta pasta pelo terminal do
     seu computador.
4. Na aba **"Variables"** do serviço, adicione:
   - `RELAY_SECRET` = uma senha forte que você escolher (ex.: uma sequência
     aleatória de letras/números). **Guarde essa senha** — é a mesma que
     você vai colar no sistema, no campo "Chave do servidor (RELAY_SECRET)".
   - `AUTH_DIR` = `/data/auth` (só depois de criar o Volume no passo 5).
5. Na aba **"Settings"** → **"Volumes"**, clique em **"New Volume"**, monte
   em `/data`. Isso guarda a sessão do WhatsApp — sem isso, toda vez que o
   Railway reiniciar o servidor você precisaria escanear o QR Code de novo.
6. Espere o deploy terminar. Railway vai gerar uma URL pública, algo como
   `https://seu-projeto.up.railway.app` — copie essa URL.
7. Abra `https://seu-projeto.up.railway.app/qr` no navegador. Vai aparecer
   um QR Code.
8. No celular: abra o WhatsApp → **Configurações** → **Aparelhos conectados**
   → **Conectar um aparelho** → aponte a câmera pro QR Code da tela.
9. Quando conectar, a página `/qr` vai mostrar "WhatsApp já está conectado".
10. No sistema (index.html), vá em **Comunicação → WhatsApp → Conexão** e
    preencha:
    - **URL do servidor de retransmissão**: a URL do passo 6 (sem barra no
      final), ex.: `https://seu-projeto.up.railway.app`
    - **Chave do servidor (RELAY_SECRET)**: a senha que você definiu no
      passo 4.
    - Clique em **"Salvar dados de conexão"**.
11. Pronto — agora o botão "Enviar" nas conversas do CRM manda a mensagem
    de verdade pelo WhatsApp conectado.

## Rodando localmente para testar antes (opcional)

```bash
npm install
RELAY_SECRET=minhasenha123 npm start
```

Depois abra `http://localhost:3000/qr` no navegador.

## Limitações deste recurso paliativo

- **Não é a API oficial** — é uma automação não-oficial. Use com moderação
  (evite mandar muitas mensagens automáticas seguidas) para reduzir o risco
  de o número ser temporariamente restringido pelo WhatsApp.
- Se o celular usado para conectar ficar muito tempo sem internet, a sessão
  pode cair — nesse caso, é só entrar em `/qr` de novo e reconectar.
- Por enquanto, o servidor só **envia** mensagens (o que o botão "Enviar"
  do sistema já usa). Mensagens **recebidas** aparecem só no log do
  servidor (Railway → aba "Deployments" → "View Logs") — ainda não
  aparecem automaticamente na tela "Conversas" do sistema. Se você quiser,
  dá pra evoluir isso depois para gravar as mensagens recebidas direto no
  sistema.
