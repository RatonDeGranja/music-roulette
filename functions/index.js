const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const CLIENT_ID = "7c6d4b819bba4e32ac742448b0ec95e1"; 
const PLAYLIST_ID = "1IIwQFOQ1vv51e3MCIbDuG"; // Pon el ID de tu lista

// ─────────────────────────────────────────────────────────
// 🤖 EL ROBOT (Se ejecuta los lunes a las 3 AM)
// ─────────────────────────────────────────────────────────
exports.sincronizarPlaylists = onSchedule({
    schedule: "0 3 * * 1",
    timeZone: "Europe/Madrid"
}, async (event) => {
    await actualizarCachePlaylist();
});

// ─────────────────────────────────────────────────────────
// 🚨 BOTÓN DE PÁNICO MANUAL (Para probar AHORA MISMO)
// ─────────────────────────────────────────────────────────
exports.forzarSubidaManual = functions.https.onRequest(async (req, res) => {
    try {
        const cantidad = await actualizarCachePlaylist();
        res.send(`✅ ¡Éxito Total! El Robot inició sesión en tu cuenta y guardó ${cantidad} canciones en Firebase.`);
    } catch (error) {
        const detalle = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).send(`❌ Error al usar tu cuenta: ${detalle}`);
    }
});

// ─────────────────────────────────────────────────────────
// LÓGICA DE DESCARGA (Usando tu cuenta personal)
// ─────────────────────────────────────────────────────────
async function actualizarCachePlaylist() {
    // 1. Leemos tu Refresh Token de la base de datos
    const configDoc = await admin.firestore().doc("config/spotify").get();
    if (!configDoc.exists) {
        throw new Error("No encuentro el documento config/spotify en la base de datos.");
    }
    const refreshToken = configDoc.data().refreshToken;

    // 2. Pedimos un Token de Acceso nuevo en tu nombre
    const authParams = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID
    });

    const authRes = await axios.post("https://accounts.spotify.com/api/token", authParams.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    
    const token = authRes.data.access_token;

    if (authRes.data.refresh_token) {
        await admin.firestore().doc("config/spotify").update({
            refreshToken: authRes.data.refresh_token
        });
        console.log("✅ Token rotado y guardado con seguridad.");
    }

    // 3. Descargamos tu Playlist (¡ahora sí tenemos permiso!)
    const urlCompleta = `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/items?limit=50`;
    const playlistRes = await axios.get(urlCompleta, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    // 4. Limpiamos y formateamos los datos
    const cancionesLimpias = [];
    for (const elemento of playlistRes.data.items) {

        const cancion = elemento.track || elemento.item || elemento;

        if (cancion && cancion.uri && cancion.name) {
            cancionesLimpias.push({
                titulo: cancion.name,
                artista: cancion.artists[0]?.name || "Artista desconocido",
                uri: cancion.uri,
                imagen: cancion.album?.images[0]?.url || ""
            });
        }
    }

    // 5. Guardamos en caché
    await admin.firestore().doc("config/playlist_cache").set({
        ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        canciones: cancionesLimpias
    });

    return cancionesLimpias.length;
}