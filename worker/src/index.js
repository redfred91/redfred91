// worker/src/index.js
export default {
  async fetch(request, env, ctx) {
    // 1. get cached token
    let tokenData = await env.TOKEN_CACHE.get("token", { type: "json" });

    // 2. refresh if missing or expired
    if (!tokenData || Date.now() > tokenData.expires_at) {
      tokenData = await refresh(env);
      // store with TTL = expires_in
      ctx.waitUntil(
        env.TOKEN_CACHE.put(
          "token",
          JSON.stringify(tokenData),
          { expirationTtl: tokenData.expires_in }
        )
      );
    }

    // 3. proxy Spotify “currently‑playing”
    const r = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    // 4. pass straight through, enable CORS for overlay
    return new Response(r.body, {
      status: r.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
  }
};

async function refresh(env) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.REFRESH_TOKEN,
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET
    })
  });
  const json = await res.json();
  return {
    access_token: json.access_token,
    expires_in: json.expires_in,
    expires_at: Date.now() + json.expires_in * 1000
  };
}
