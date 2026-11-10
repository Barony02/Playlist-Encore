import crypto from "node:crypto";
import fs from "node:fs";
import { AppError } from "../errors.js";

const API = "https://api.music.apple.com";

export function isConfigured() {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      (process.env.APPLE_PRIVATE_KEY_PATH || process.env.APPLE_PRIVATE_KEY)
  );
}

function privateKey() {
  if (process.env.APPLE_PRIVATE_KEY_PATH) {
    return fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8");
  }
  return process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");
}

let cached = null;

// Gera o "developer token" (JWT ES256) exigido pela API do Apple Music.
function developerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - now > 300) return cached.token;

  const exp = now + 60 * 60 * 12;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "ES256", kid: process.env.APPLE_KEY_ID, typ: "JWT" });
  const payload = b64({ iss: process.env.APPLE_TEAM_ID, iat: now, exp });
  const data = `${header}.${payload}`;
  const signature = crypto
    .sign("sha256", Buffer.from(data), { key: privateKey(), dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  cached = { token: `${data}.${signature}`, exp };
  return cached.token;
}

function parseLink(url) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const storefront = /^[a-z]{2}$/i.test(segments[0]) ? segments[0].toLowerCase() : "us";
  const id = segments.find((s) => /^pl\./.test(s));
  return { storefront, id };
}

async function call(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${developerToken()}` } });
  if (res.status === 401) {
    throw new AppError(500, "O Apple Music recusou o token. Confira APPLE_TEAM_ID, APPLE_KEY_ID e a chave .p8.");
  }
  if (res.status === 404) {
    throw new AppError(404, "Playlist não encontrada nesse país da loja. Confira se o link é público.");
  }
  if (!res.ok) throw new AppError(502, `Erro na API do Apple Music: ${res.status}`);
  return res.json();
}

export async function listItems(url) {
  if (!isConfigured()) {
    throw new AppError(500, "Faltam as credenciais do Apple Music no arquivo .env.", "NOT_CONFIGURED");
  }
  const { storefront, id } = parseLink(url);
  if (!id) {
    if (/\/playlist\/.*\/pl\.u-/.test(url)) {
      throw new AppError(400, "Playlists da biblioteca pessoal não podem ser lidas sem login. Use uma playlist pública.");
    }
    throw new AppError(400, "Não encontrei o ID da playlist nesse link do Apple Music.");
  }
  if (id.startsWith("pl.u-")) {
    throw new AppError(
      400,
      "Essa é uma playlist da biblioteca pessoal de alguém. Só dá para ler playlists públicas do catálogo."
    );
  }

  let name = null;
  try {
    const meta = await call(`/v1/catalog/${storefront}/playlists/${id}`);
    name = meta.data?.[0]?.attributes?.name ?? null;
  } catch {
    // o nome é opcional
  }

  const items = [];
  let next = `/v1/catalog/${storefront}/playlists/${id}/tracks?limit=100`;
  while (next) {
    const data = await call(next);
    for (const t of data.data ?? []) {
      const a = t.attributes;
      if (!a) continue;
      items.push({ title: a.name, artist: a.artistName, id: t.id, url: a.url });
    }
    next = data.next || null;
  }

  return { name, items };
}
