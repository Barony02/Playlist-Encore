import crypto from "node:crypto";
import { AppError } from "../errors.js";

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = "playlist-read-private playlist-read-collaborative";

// Sessão em memória: serve para uso local por uma pessoa.
let session = null; // { access, refresh, expiresAt }
const pending = new Map(); // state -> code_verifier

const redirectUri = () => process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/callback";

export function isConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID);
}

export function isLoggedIn() {
  return Boolean(session);
}

export function loginUrl() {
  if (!isConfigured()) {
    throw new AppError(500, "Falta SPOTIFY_CLIENT_ID no arquivo .env.", "NOT_CONFIGURED");
  }
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  pending.set(state, verifier);

  const qs = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return `${ACCOUNTS}/authorize?${qs}`;
}

async function tokenRequest(body) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.SPOTIFY_CLIENT_ID, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(502, `Falha no login do Spotify: ${data.error_description || res.status}`);
  return data;
}

function saveSession(data, previousRefresh) {
  session = {
    access: data.access_token,
    refresh: data.refresh_token || previousRefresh,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

export async function handleCallback(code, state) {
  const verifier = pending.get(state);
  if (!verifier) throw new AppError(400, "Login expirado. Tente entrar de novo.");
  pending.delete(state);
  const data = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  saveSession(data);
}

async function accessToken() {
  if (!session) {
    throw new AppError(401, "Entre com sua conta do Spotify para ler playlists.", "NEEDS_LOGIN");
  }
  if (Date.now() >= session.expiresAt) {
    try {
      const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: session.refresh });
      saveSession(data, session.refresh);
    } catch {
      session = null;
      throw new AppError(401, "Sua sessão do Spotify expirou. Entre novamente.", "NEEDS_LOGIN");
    }
  }
  return session.access;
}

async function call(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });

  if (res.status === 401) {
    session = null;
    throw new AppError(401, "Sua sessão do Spotify expirou. Entre novamente.", "NEEDS_LOGIN");
  }
  if (res.status === 403) {
    throw new AppError(
      403,
      "O Spotify só libera as músicas de playlists que você criou ou em que colabora (e, em modo de desenvolvimento, só para contas autorizadas no painel do app). Copie a playlist para a sua conta ou importe um CSV.",
      "SPOTIFY_FORBIDDEN"
    );
  }
  if (res.status === 404) throw new AppError(404, "Playlist não encontrada.");
  if (res.status === 429) throw new AppError(429, "O Spotify pediu para esperar um pouco. Tente em instantes.");
  if (!res.ok) throw new AppError(502, `Erro na API do Spotify: ${res.status}`);
  return res.json();
}

function getPlaylistId(url) {
  const m = url.match(/playlist[/:]([A-Za-z0-9]+)/);
  return m?.[1] ?? null;
}

export async function listItems(url) {
  if (!isConfigured()) {
    throw new AppError(500, "Falta SPOTIFY_CLIENT_ID no arquivo .env.", "NOT_CONFIGURED");
  }
  const id = getPlaylistId(url);
  if (!id) throw new AppError(400, "Não encontrei o ID da playlist nesse link do Spotify.");

  let name = null;
  try {
    name = (await call(`/playlists/${id}?fields=name`)).name ?? null;
  } catch (e) {
    if (e.code === "NEEDS_LOGIN") throw e;
  }

  const items = [];
  let next = `/playlists/${id}/items?limit=50`;
  while (next) {
    const data = await call(next);
    for (const entry of data.items ?? []) {
      // Desde fev/2026 o campo se chama "item"; "track" é o nome antigo.
      const t = entry.item ?? entry.track;
      if (!t || t.type === "episode") continue;
      items.push({
        title: t.name,
        artist: (t.artists ?? []).map((a) => a.name).join(", "),
        id: t.id,
        url: t.external_urls?.spotify,
      });
    }
    next = data.next || null;
  }

  return { name, items };
}
