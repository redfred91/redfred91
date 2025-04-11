export default {
  async fetch(request, env, ctx) {
    const now = Date.now();

    if (!env.ACCESS_TOKEN || now > env.EXPIRES_AT) {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: env.REFRESH_TOKEN,
          client_id: env.CLIENT_ID,
          client_secret: env.CLIENT_SECRET,
        }),
      });

      const tokenData = await tokenResponse.json();

      env.ACCESS_TOKEN = tokenData.access_token;
      env.EXPIRES_AT = now + tokenData.expires_in * 1000;
    }

    const nowPlayingRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${env.ACCESS_TOKEN}` },
    });

    const nowPlaying = await nowPlayingRes.json();

    return new Response(JSON.stringify(nowPlaying), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
}
