// src/index.js  – full file
export default {
  async fetch(request, env, ctx) {
    // 1. Get (or refresh) the access token
    const accessToken = await getAccessToken(env, ctx);

    // 2. Fetch “now playing” from Spotify
    const response = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // 3. Return JSON with CORS
    return new Response(response.body, {
      status:  response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control":              "no-store"
      }
    });
  }
};

// ─────────────────────────────────────────────────────────────

async function getAccessToken(env, ctx) {
  // read KV: {"access_token":"…","expires_at":123456789}
  const tokenData = await env.TOKEN_CACHE.get("token", { type: "json" });

  if (tokenData && tokenData.expires_at && Date.now() < tokenData.expires_at) {
    return tokenData.access_token;                 // still fresh
  }
  // otherwise refresh
  return await refreshToken(env, ctx);
}

// ─────────────────────────────────────────────────────────────

async function refreshToken(env, ctx) {
  // 1. refresh_token comes from KV; fallback to secret once
  let refreshTokenValue = await env.TOKEN_CACHE.get("refresh_token");
  if (!refreshTokenValue) refreshTokenValue = env.REFRESH_TOKEN;

  // 2. ask Spotify for a new access token  (PKCE flow → NO client_secret)
  const res  = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshTokenValue,
      client_id:     env.CLIENT_ID            // PKCE: no client_secret here
    })
  });

  const data = await res.json();

  // **** LOG EXACTLY WHAT SPOTIFY RETURNS ****
  console.log("REFRESH‑RESPONSE", data);

  if (!data.access_token) {
    throw new Error("Failed to refresh token: " + JSON.stringify(data));
  }

  // 3. save new refresh_token if Spotify rotated it
  if (data.refresh_token) {
    ctx.waitUntil(env.TOKEN_CACHE.put("refresh_token", data.refresh_token));
  }

  // 4. save new access_token (+expiry) in KV
  const expiresIn = data.expires_in || 3600;                // seconds
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;   // minus 60‑s buffer

  const payload = { access_token: data.access_token, expires_at: expiresAt };

  ctx.waitUntil(
    env.TOKEN_CACHE.put("token", JSON.stringify(payload), {
      expirationTtl: expiresIn
    })
  );

  return data.access_token;
}
