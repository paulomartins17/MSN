# 🦋 MSN Messenger Chatroom v7.0 (Y2K Glassmorphism)

Este é um aplicativo de chat móvel desenvolvido em React Native (Expo SDK 54) com uma estética Y2K baseada no clássico **MSN Messenger**, fundido com toques modernos de **Glassmorphism** (painéis translúcidos, sombras suaves, desfoques e bordas reflexivas).

O projeto é resiliente a falhas de conexão de rede/servidor e possui um servidor API próprio em Node.js nativo que audita a conversa e registra logs de segurança (como o endereço IP do remetente).

---

## 🚀 Como Iniciar o Projeto

### 1. Rodar o Servidor de API (Backend)
O servidor de API gerencia o banco de dados temporário de mensagens e grava os logs de segurança dos clientes.
No terminal, na raiz do projeto, execute:
```bash
npm run server
```
O servidor iniciará na porta `3000`. Os logs de conversa e IPs das mensagens serão gravados no arquivo [chat.log](file:///c:/Users/pm853/Downloads/msn/server/logs/chat.log) dentro de `server/logs/`.

### 2. Rodar o Aplicativo Mobile (Frontend)
Em outro terminal na raiz do projeto, instale as dependências e inicie o Metro Bundler do Expo:
```bash
npm install
npx expo start
```
Após o carregamento, você poderá abrir o aplicativo no seu celular físico escaneando o QR Code com o aplicativo **Expo Go** (disponível na App Store / Google Play).

> [!TIP]
> **Conectividade Inteligente com Expo Go:** O aplicativo autodetecta o endereço IP local do seu computador executando o Expo Metro Bundler. Celulares na mesma rede Wi-Fi se conectarão ao servidor de API automaticamente, sem qualquer configuração manual!

---

## 🎨 Principais Recursos e Estética

### 1. Tela de Login Y2K Glassmorphic
- **Design Clássico do MSN:** Imita o painel de login do Live Messenger, com barra de controle de janelas e mini-ícones do Windows.
- **Seletor de Avatares MSN:** Clique na foto do perfil ou use as setas para alternar entre avatares clássicos (🦋 Borboleta, 🦆 Patinho, ⚽ Futebol, 🌻 Girassol, 🎮 Controle, 💖 Coração, 🐱 Gatinho).
- **Seletor de Status:** Escolha entrar como *Online*, *Ocupado*, *Ausente* ou *Invisível*.

### 2. Tela de Chat & Gestos de Celular
- **Estética da Interface:** Layout idêntico ao mockup, com balões rosa/magenta, avatares em frames de vidro e cabeçalho azul claro "Bem-vinde FULANO".
- **Toque Curto:** Clique rápido em qualquer balão para alternar a exibição da hora de envio e o IP do remetente.
- **Toque Duplo (Double Tap):** Envia uma chamada de **Chamar Atenção (Nudge)** clássica, fazendo com que a tela de todos trema (animação Reanimated) e o celular vibre.
- **Toque Longo (Long Press):** Abre um menu de contexto estilo Glassmorphism na tela permitindo copiar o texto, responder (Reply Quote) ou deletar a mensagem localmente.

### 3. Resiliência
Se o servidor cair ou estiver offline, a aplicação exibirá um banner vermelho flutuante explicando o erro com um botão para **"Tentar Novamente"**, permitindo continuar navegando na interface sem travar ou fechar o app.
