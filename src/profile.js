const clientId = "7c6d4b819bba4e32ac742448b0ec95e1"; 
const tokenGuardado = localStorage.getItem("token");
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

// 1. SI YA TIENES TOKEN (Entras directo)
if (tokenGuardado) {
    const profile = await fetchProfile(tokenGuardado);
    if (profile.error && profile.error.status === 401) {
        console.warn("El token caducó. Redirigiendo para renovarlo...");
        localStorage.removeItem("token"); 
        redirectToAuthCodeFlow(clientId); 
    } else {
        console.log("Perfil cargado con éxito:", profile);
    }
} 
// 2. SI VUELVES DE SPOTIFY CON PERMISO
else if (code) {
    const accesToken = await getAccessToken(clientId, code);
    localStorage.setItem("token", accesToken);
    
    // Limpiamos la URL para que quede bonita (opcional pero recomendado)
    window.history.pushState({}, null, "/");
    
    const profile = await fetchProfile(accesToken);
    console.log("Nuevo inicio de sesión exitoso:", profile); 
} 
// 3. SI ERES NUEVO (Te mandamos a loguearte)
else {
    console.log("No hay sesión. Redirigiendo a Spotify...");
    redirectToAuthCodeFlow(clientId);
}

async function redirectToAuthCodeFlow(clientId) {
    // TODO: Redirect to Spotify authorization page

    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "https://music-roulette-roberto.web.app/callback");
    params.append("scope", "user-read-private user-read-email user-top-read");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}


function generateCodeVerifier(length){
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function getAccessToken(clientId, code) {
  // TODO: Get access token for code

    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "https://music-roulette-roberto.web.app/callback");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    const { access_token } = await result.json();
    return access_token;
}

export async function fetchProfile(token) {
    // TODO: Call Web API

    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    if (!result.ok) {
        const errorText = await result.text();
        return { error: { status: result.status, message: errorText } };
    }

    return await result.json();
}

function populateUI(profile) {
    const etiquetaNombre = document.getElementById("displayName");
    // Solo intenta poner el nombre si la etiqueta realmente existe en esta pantalla
    if (etiquetaNombre) {
        etiquetaNombre.innerText = profile.display_name;
    }
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar").appendChild(profileImage);
        document.getElementById("imgUrl").innerText = profile.images[0].url;
    }
    document.getElementById("id").innerText = profile.id;
    document.getElementById("email").innerText = profile.email;
    document.getElementById("uri").innerText = profile.uri;
    document.getElementById("uri").setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url").innerText = profile.href;
    document.getElementById("url").setAttribute("href", profile.href);
}
