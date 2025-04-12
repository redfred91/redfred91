export default {
  async fetch(request, env, ctx) {
    // 1. Get or refresh the Access Token
    const accessToken = await getAccessToken(env, ctx);

    // 2. Fetch currently playing track from Spotify
    const response = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}` 
        }
      }
    );

    // 3. Pass the JSON along, enabling CORS
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
  }
};

async function getAccessToken(env, ctx) {
  // Check if we already have a valid token in KV
  const tokenData = await env.TOKEN_CACHE.get("token", { type: "json" });

  if (tokenData && tokenData.expires_at && Date.now() < tokenData.expires_at) {
    // Still valid, use it
    return tokenData.access_token;
  } else {
    // Need to refresh
    return await refreshToken(env, ctx);
  }
}

async function refreshToken(env, ctx) {
  // If you're using the "classic" Auth Code flow with client secret:
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.REFRESH_TOKEN,
      client_id: env.CLIENT_ID,
    })
  });

  // If you're using PKCE and not storing the client_secret,
  // just omit client_secret in the body. The rest stays the same.

  const data = await res.json();

  if (!data.access_token) {
    throw new Error("Failed to refresh token: " + JSON.stringify(data));
  }

  // Example: store the token with ~1 minute safety buffer
  const expiresIn = data.expires_in || 3600; // in seconds
  const expiresAt = Date.now() + (expiresIn - 60) * 1000; // subtract 60s buffer

  // Save in KV so future requests don't have to refresh immediately
  // We'll set the TTL to the full expiresIn so KV auto-cleans
  const payload = {
    access_token: data.access_token,
    expires_at: expiresAt
  };

  ctx.waitUntil(
    env.TOKEN_CACHE.put("token", JSON.stringify(payload), {
      expirationTtl: expiresIn
    })
  );

  return data.access_token;
}
