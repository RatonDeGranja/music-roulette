import { db } from "./firebase.js";
import { doc, setDoc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

// ────────────────────────────────────────────────────
// AUTENTICACIÓN: Client Credentials vía Cloud Function
// ────────────────────────────────────────────────────
const functions = getFunctions();
const pedirToken = httpsCallable(functions, 'obtenerTokenAnonimo');
var token = null;

async function conectarConSpotify() {
    try {
        console.log("Pidiendo token al servidor...");
        const resultado = await pedirToken();
        token = resultado.data.token;
        console.log("¡Token de app recibido!: ", token);
    } catch (error) {
        console.error("Error al obtener token de Spotify:", error.message);
        throw error; // Propagamos el error para que crearSala lo gestione
    }
}

// ────────────────────────────────────────────────────
// UTILIDADES
// ────────────────────────────────────────────────────
console.log("¡lobby.js está vivo y funcionando!");

function generarCodigo() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUWVXYZ123456789';
    let codigo = '';
    for (let i = 0; i < 4; i++) {
        const indice = Math.floor(Math.random() * chars.length);
        codigo += chars.charAt(indice);
    }
    return codigo;
}

/**
 * ✅ FIX: Obtiene canciones de una playlist pública de Spotify usando el token de app
 * (Client Credentials). NO necesita que el usuario se loguee.
 * Las canciones se asignan aleatoriamente a los jugadores como "dueños".
 *
 * @param {string} playlistId - ID de la playlist de Spotify (ej: Top 50 Global)
 * @param {string[]} jugadores - Lista de nombres de jugadores en la sala
 * @param {number} cancionesPorJugador - Cuántas canciones asignar a cada jugador
 */
async function getSongsFromPlaylist(playlistId, jugadores, cancionesPorJugador = 2) {
    if (!token) {
        console.error("No hay token disponible.");
        return [];
    }

    try {
        const response = await fetch(
            `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50`,
            {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` },
            }
        );

        if (!response.ok) {
            const err = await response.json();
            console.error("Error de Spotify al pedir playlist:", err);
            return [];
        }
        
        const datos = await response.json();
        console.log("RESPUESTA: ",datos);
        const items = datos.items || datos.tracks?.items || [];

        // 1. Extraemos las canciones de forma segura (se llame 'track', 'item' o venga directo)
        const cancionesLimpias = [];
        for (const elemento of items) {
            const cancion = elemento.track || elemento.item || elemento;
            
            if (cancion && cancion.uri && cancion.name && cancion.artists && cancion.artists.length > 0) {
                cancionesLimpias.push(cancion);
            }
        }

        // 2. Barajamos las canciones válidas
        for (let i = cancionesLimpias.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cancionesLimpias[i], cancionesLimpias[j]] = [cancionesLimpias[j], cancionesLimpias[i]];
        }

        // 3. Asignamos los dueños
        const cancionesFormateadas = [];
        let trackIndex = 0;

        for (const jugador of jugadores) {
            for (let i = 0; i < cancionesPorJugador; i++) {
                if (trackIndex >= cancionesLimpias.length) break;
                
                const cancion = cancionesLimpias[trackIndex];

                // 🎲 GENERAMOS LAS 4 OPCIONES PARA FIREBASE
                let opciones = [cancion.name];
                while (opciones.length < 4) {
                    let aleatoria = cancionesLimpias[Math.floor(Math.random() * cancionesLimpias.length)];
                    if (!opciones.includes(aleatoria.name)) {
                        opciones.push(aleatoria.name);
                    }
                }
                // Barajamos las 4 opciones para que la correcta no sea siempre la primera
                opciones.sort(() => Math.random() - 0.5);

                cancionesFormateadas.push({
                    titulo: cancion.name,
                    artista: cancion.artists[0].name,
                    uri: cancion.uri,
                    dueno: jugador,
                    imagen: cancion.album.images[0].url,
                    botones: opciones // <--- ¡AQUÍ SUBIMOS LOS BOTONES A FIREBASE!
                });
                trackIndex++;
            }
        }

        console.log(`✅ ${cancionesFormateadas.length} canciones preparadas.`);
        return cancionesFormateadas;

    } catch (error) {
        console.error("Error en getSongsFromPlaylist:", error);
        return [];
    }
}

// ────────────────────────────────────────────────────
// CREAR SALA
// ────────────────────────────────────────────────────
async function crearSala(evt) {
    evt.preventDefault();
    const nombre = document.getElementById("nombre").value.trim();
    if (!nombre) return mostrarAlerta("Enter your name.");

    localStorage.setItem("nombreUsuario", nombre);

    try {
        // 1. En lugar de ir a Spotify, leemos nuestra CACHÉ en Firestore
        const docCache = await getDoc(doc(db, "config", "playlist_cache"));
        const todasLasCanciones = docCache.data().canciones;

        // 2. Seleccionamos canciones al azar de la caché y generamos botones
        const cancionesPartida = [];
        const pool = [...todasLasCanciones].sort(() => Math.random() - 0.5);

        for (let i = 0; i < 5; i++) { // Ejemplo: 5 canciones
            const correcta = pool[i];
            
            // Generar 4 opciones (1 correcta + 3 aleatorias de la caché)
            let opciones = [correcta.titulo];
            while (opciones.length < 4) {
                let random = todasLasCanciones[Math.floor(Math.random() * todasLasCanciones.length)].titulo;
                if (!opciones.includes(random)) opciones.push(random);
            }
            opciones.sort(() => Math.random() - 0.5);

            cancionesPartida.push({
                ...correcta,
                dueno: nombre,
                botones: opciones
            });
        }

        // 3. Crear sala en Firebase
        const codigoSecreto = generarCodigo();
        await setDoc(doc(db, "salas", codigoSecreto), {
            estado: "esperandoJugadores",
            creador: nombre,
            jugadores: [nombre],
            canciones: cancionesPartida
        });

        location.href = `lobby.html?codigo=${codigoSecreto}`;

    } catch (error) {
        console.error("Error:", error);
    }
}

const botonCrear = document.getElementById("btn-crear-sala");
console.log("¿He encontrado el botón?", botonCrear);
if (botonCrear) {
    botonCrear.addEventListener("click", (event) => {
        crearSala(event);
    });
    console.log("¡Evento de clic conectado al botón!");
} else {
    console.error("¡ERROR! No encuentro el botón 'btn-crear-sala'.");
}

// ────────────────────────────────────────────────────
// UNIRSE A SALA
// ────────────────────────────────────────────────────
async function unirseSala(evt) {
    evt.preventDefault();

    const inputCodigo = document.getElementById("id_room");
    const inputNombre = document.getElementById("nombre");

    if (!inputCodigo || !inputNombre) {
        console.error("❌ No se encuentran los inputs id_room o nombre en el HTML");
        return;
    }

    const codigo = inputCodigo.value.toUpperCase().trim();
    const nombre = inputNombre.value.trim();

    if (!codigo || !nombre) {
        mostrarAlerta("Please enter your name and the room code.");
        return;
    }

    localStorage.setItem("nombreUsuario", nombre);
    console.log(`Buscando sala: ${codigo} para el usuario: ${nombre}`);

    const referenciasSala = doc(db, "salas", codigo);

    try {
        const documentoSala = await getDoc(referenciasSala);

        if (documentoSala.exists()) {
            console.log("🏠 Sala encontrada. Uniéndose...");

            // Añadimos al jugador a la lista
            await updateDoc(referenciasSala, {
                jugadores: arrayUnion(nombre)
            });

            location.href = `lobby.html?codigo=${codigo}`;
        } else {
            mostrarAlerta("This room does not exist.");
        }
    } catch (error) {
        console.error("❌ Error crítico al unirse:", error);
    }
}

const btnUnirse = document.getElementById("unirse");
if (btnUnirse) {
    btnUnirse.addEventListener("click", (event) => {
        unirseSala(event);
    });
}

function mostrarAlerta(mensaje) {
    // Si ya hay un toast en pantalla, lo borramos para que no se amontonen
    const toastViejo = document.querySelector(".toast-personalizado");
    if (toastViejo) toastViejo.remove();

    // Creamos el nuevo toast
    const toast = document.createElement("div");
    toast.className = "toast-personalizado";
    toast.innerText = mensaje;
    document.body.appendChild(toast);

    // Un pequeño retraso para que CSS aplique la animación de entrada
    setTimeout(() => {
        toast.classList.add("mostrar");
    }, 10);

    // A los 3 segundos, lo ocultamos y lo borramos del HTML
    setTimeout(() => {
        toast.classList.remove("mostrar");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}