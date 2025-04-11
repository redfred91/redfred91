const clientId = '540b1cf18a9a4e5383fd2d5a6a287d80'; // From https://developer.spotify.com/dashboard
const redirectUri = 'https://redfred91.github.io/redfred91/'; // GitHub Pages URL
const scopes = ['user-read-currently-playing', 'user-read-playback-state'];

function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

function base64urlencode(str) {
  return btoa(String.fromCharCode(...new Uint8Array(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlencode(digest);
}

async function loginWithSpotify() {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem('verifier', codeVerifier);

  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', codeChallenge);

  window.location.href = url;
}

async function fetchAccessToken(code) {
  const verifier = localStorage.getItem('verifier');

  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', redirectUri);
  params.append('code_verifier', verifier);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();
  return data.access_token;
}

async function fetchNowPlaying(token) {
  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return;

  const data = await res.json();
  if (data && data.item) {
    document.getElementById('album-art').src = data.item.album.images[0].url;
    document.getElementById('track-name').textContent = data.item.name;
    document.getElementById('artist-name').textContent = data.item.artists.map(a => a.name).join(', ');
    document.getElementById('now-playing').classList.remove('hidden');
    document.getElementById('auth-container').classList.add('hidden');
  }
}

// Main logic
document.getElementById('login-btn').onclick = loginWithSpotify;

const params = new URLSearchParams(window.location.search);
const code = params.get('code');
if (code) {
  fetchAccessToken(code)
    .then(fetchNowPlaying)
    .catch(console.error);
}
