const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "POST" && url.pathname === "/token") {
      return handleTokenSeed(request, env, ctx);
    }

    // 1. Get or refresh the access token
    const accessToken = await getAccessToken(env, ctx);

    // 2. Fetch currently playing track from Spotify
    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // 3. Return the JSON with CORS enabled
    return new Response(response.body, {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store"
      }
    });
  }
};

async function handleTokenSeed(request, env, ctx) {
  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json"
      }
    });
  }

  const { refresh_token, access_token, expires_in } = payload ?? {};

  if (typeof refresh_token !== "string" || refresh_token.length === 0) {
    return new Response(JSON.stringify({ error: "refresh_token is required" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json"
      }
    });
  }

  if (typeof access_token !== "string" || access_token.length === 0) {
    return new Response(JSON.stringify({ error: "access_token is required" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json"
      }
    });
  }

  const expiresInNumber = Number(expires_in);
  if (!Number.isFinite(expiresInNumber) || expiresInNumber <= 0) {
    return new Response(JSON.stringify({ error: "expires_in must be a positive number" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json"
      }
    });
  }

  const expiresBuffer = Math.max(expiresInNumber - 60, 0);
  const expiresAt = Date.now() + expiresBuffer * 1000;

  ctx.waitUntil(env.TOKEN_CACHE.put("refresh_token", refresh_token));
  ctx.waitUntil(
    env.TOKEN_CACHE.put(
      "token",
      JSON.stringify({
        access_token,
        expires_at: expiresAt
      }),
      { expirationTtl: expiresInNumber }
    )
  );

  return new Response(JSON.stringify({ status: "ok" }), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}

async function getAccessToken(env, ctx) {
  const tokenData = await env.TOKEN_CACHE.get("token", { type: "json" });

  if (tokenData && tokenData.expires_at && Date.now() < tokenData.expires_at) {
    return tokenData.access_token; // Still valid
  }

  // Else, refresh it
  return await refreshToken(env, ctx);
}

async function refreshToken(env, ctx) {
  // ✅ Only use refresh_token from KV
  const refreshTokenValue = await env.TOKEN_CACHE.get("refresh_token");

  if (!refreshTokenValue) {
    throw new Error("No refresh token available in KV — please re-authenticate.");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
      client_id: env.CLIENT_ID
    })
  });

  const data = await res.json();

  // 🔍 Log for debugging only (disable in production)
  console.log("REFRESH-RESPONSE", data);

  if (!data.access_token) {
    throw new Error("Failed to refresh token: " + JSON.stringify(data));
  }

  // ✅ Store new refresh_token if provided
  if (data.refresh_token) {
    ctx.waitUntil(
      env.TOKEN_CACHE.put("refresh_token", data.refresh_token)
    );
  }

  // ✅ Store access token with expiry buffer
  const expiresIn = data.expires_in || 3600;
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;

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
