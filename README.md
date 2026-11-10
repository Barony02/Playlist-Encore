# Playlist Encore

Cole o link de uma playlist (YouTube, Spotify ou Apple Music) e veja a lista de músicas.
Esta primeira versão só **lista** as faixas. A busca no Chorus Encore e o zip vêm depois.

## Como rodar

Requer Node.js 18 ou superior.

```bash
npm install
cp .env.example .env     # no Windows: copy .env.example .env
# preencha o .env com o que for usar (veja abaixo)
npm start
```

Abra http://127.0.0.1:3000

## Configuração por plataforma

### YouTube (o mais simples)
1. Crie um projeto em https://console.cloud.google.com
2. Ative a "YouTube Data API v3"
3. Crie uma chave de API e coloque em `YOUTUBE_API_KEY`

Funciona com playlists públicas e não listadas.

### Apple Music
Exige conta paga do Apple Developer Program.
1. Crie uma chave do tipo Media Services (MusicKit) e baixe o arquivo `.p8`
2. Preencha `APPLE_TEAM_ID`, `APPLE_KEY_ID` e `APPLE_PRIVATE_KEY_PATH`

Funciona com playlists públicas do catálogo (IDs `pl.xxxx`). Playlists da biblioteca pessoal (`pl.u-...`) não funcionam.

### Spotify (com restrições)
Desde fevereiro de 2026, apps em modo de desenvolvimento só conseguem ler os itens de playlists
que o usuário criou ou em que colabora, e o dono do app precisa ter Premium.
1. Crie um app em https://developer.spotify.com/dashboard
2. Adicione o Redirect URI `http://127.0.0.1:3000/callback`
3. Coloque o Client ID em `SPOTIFY_CLIENT_ID`
4. No site, clique em "Entrar com o Spotify" quando pedir

Alternativa: exporte a playlist com o Exportify e use "Importar um CSV" no site.
Confira as regras atuais na documentação do Spotify, pois elas mudam com frequência.

## Estrutura

```
server.js            servidor Express e rotas
errors.js            erro com status HTTP e código
providers/
  youtube.js         YouTube Data API v3
  apple.js           Apple Music API (token JWT assinado localmente)
  spotify.js         login PKCE + endpoint /playlists/{id}/items
  csv.js             importação de CSV (Exportify)
  clean.js           limpeza de títulos e separação artista/música
public/index.html    interface
```

## Próximos passos

- `chorus.js`: buscar cada faixa no Chorus Encore (com limite de requisições e cache)
- Matching por similaridade entre artista/título e os resultados
- Baixar os charts escolhidos e montar o zip

# Playlist-Encore

