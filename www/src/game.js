import { db } from "./firebase.js";
import { doc, onSnapshot, updateDoc, getDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";

const parametrosURL = new URLSearchParams(window.location.search);
const codigo = parametrosURL.get("codigo");

// ✅ FIX: convertimos a número con parseInt para que la comparación === funcione
const rondas = parseInt(parametrosURL.get("rondas")*2, 10);
console.log("CODIGO:", codigo, "RONDAS:", rondas);

const miNombre = localStorage.getItem("nombreUsuario");
var referenciaSala = null;

let ronda = 1;
let rondaLocal = -1;
let reproductorSpotify = null;
let salaActual = null;

let yaHeVotado = false;
let terminaRonda = true;
let seguir = true;
let segundos = 30;
let tiempo_puntuacion = segundos * 100;
let cancionActual;
let intervaloTemporizador = null;

if (codigo) {
    referenciaSala = doc(db, "salas", codigo);

    onSnapshot(referenciaSala, async (snapshot) => {
        if (snapshot.exists()) {
            const nuevosDatos = snapshot.data();
            salaActual = nuevosDatos;

            // 🔄 LÓGICA DE REENGANCHE (Tu "fix fácil")
            // Si la sala existe pero mi nombre no está en la lista (por culpa del beforeunload)
            if (salaActual.jugadores && !salaActual.jugadores.includes(miNombre)) {
                console.log("¡Vaya! No estoy en la lista. Re-conectando...");
                await updateDoc(referenciaSala, {
                    jugadores: arrayUnion(miNombre)
                });
                return; // Salimos de este snapshot para esperar al siguiente con los datos correctos
            }

            if (ronda > rondas) {
                location.href = `lobby.html?codigo=${codigo}`;
                return;
            }

            if (salaActual.rondaActual !== rondaLocal) {
                rondaLocal = salaActual.rondaActual;
                gestionarEstadoJuego();
            }
        } else {
            console.error("❌ La sala ha sido borrada.");
            location.href = "index.html";
        }
    });
} else {
    console.error("❌ No hay código en la URL.");
}

function gestionarEstadoJuego() {
    if (!salaActual) return;
    if (!salaActual.cancionesPartida || salaActual.rondaActual === undefined) return;

    cancionActual = salaActual.cancionesPartida[salaActual.rondaActual];
    if (!cancionActual){ 
        location.href = `lobby.html?codigo=${codigo}`;  
        return;
    }

    // Reseteamos variables para la nueva ronda
    yaHeVotado = false;
    terminaRonda = false;
    seguir = true;
    segundos = 30;
    tiempo_puntuacion = segundos * 100;

    const dialog = document.getElementById("dialog");
    if (dialog && dialog.open) dialog.close();
    if (dialog) dialog.innerHTML = "";

    const tituloRonda = document.getElementById("ronda-titulo");
    if (tituloRonda) tituloRonda.innerText = `Round ${salaActual.rondaActual + 1}`;

    const nombreCancion = document.getElementById("nombre-cancion-personalizado");
    if (nombreCancion) {
        nombreCancion.textContent = "🎵 Listen and guess";
        nombreCancion.style.display = "block";
    }

    dibujarBotonesVoto();

    if (reproductorSpotify) {
        reproducirCancion(cancionActual.uri);
    }

    clearInterval(intervaloTemporizador);
    iniciarReloj();
}

function iniciarReloj() {
    const elementoContador = document.getElementById('contador');

    function actualizarTiempo() {
        const milisegundosPasados = Date.now() - salaActual.tiempoInicioRonda;
        const segundosPasados = Math.floor(milisegundosPasados / 1000);

        segundos = 30 - segundosPasados;

        if (segundos > 0 && seguir) {
            if (elementoContador) elementoContador.textContent = segundos;
        } else {
            segundos = 0;
            if (elementoContador) elementoContador.textContent = "0";
            clearInterval(intervaloTemporizador);
            terminaRonda = true;
            seguir = false;
            procesarFinDeRonda();
        }
    }

    actualizarTiempo();
    intervaloTemporizador = setInterval(actualizarTiempo, 1000);
}

async function procesarFinDeRonda() {
    yaHeVotado = true;
    dibujarBotonesVoto();

    let puntuacionesLocales = JSON.parse(JSON.stringify(salaActual.puntuaciones));
    const votosDeRonda = salaActual.votos || [];

    // Cálculo visual para el diálogo local
    for (const voto of votosDeRonda) {
        if (voto.votado === cancionActual.titulo) { 
            for (const p of puntuacionesLocales) {
                if (p.nombre === voto.votante) p.puntuacion += voto.puntosPosibles;
            }
        }
    }

    mostrarDialogPuntuaciones(puntuacionesLocales);

    // 🏆 LÓGICA DEL HOST CORREGIDA
    if (salaActual.creador === miNombre) {
        const docSnap = await getDoc(referenciaSala);
        const datosActuales = docSnap.data();

        let puntuacionesOficiales = datosActuales.puntuaciones;
        const votosOficiales = datosActuales.votos || [];

        // ✅ FIX: Sumamos puntos a la variable "oficial" que subiremos a Firebase
        for (const voto of votosOficiales) {
            if (voto.votado === cancionActual.titulo) { 
                for (const p of puntuacionesOficiales) {
                    if (p.nombre === voto.votante) p.puntuacion += voto.puntosPosibles;
                }
            }
        }

        puntuacionesOficiales.sort((a, b) => b.puntuacion - a.puntuacion);

        setTimeout(async () => {
            await updateDoc(referenciaSala, {
                rondaActual: salaActual.rondaActual + 1,
                votos: [],
                puntuaciones: puntuacionesOficiales,
                tiempoInicioRonda: Date.now()
            });
        }, 5000);
    }
}
function dibujarBotonesVoto() {
    const contenedor = document.getElementById("voto-container");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    // Leemos el array 'botones' que el Host guardó en la nube
    cancionActual.botones.forEach(nombreCancion => {
        const btn = document.createElement("button");
        btn.innerText = nombreCancion;
        btn.className = "btn-jugador btn btn-success btn-lg mb-2 w-100";
        
        if (yaHeVotado) btn.disabled = true;
        
        btn.onclick = (event) => registrarVoto(nombreCancion, event);
        contenedor.appendChild(btn);
    });
}

async function registrarVoto(candidato, evt) {
    evt.preventDefault();
    if (terminaRonda || yaHeVotado) return;

    yaHeVotado = true;
    dibujarBotonesVoto();

    console.log(`Has votado: ${candidato}`);
    tiempo_puntuacion = segundos * 100;

    const ficha_voto = {
        votante: miNombre,
        votado: candidato,
        puntosPosibles: tiempo_puntuacion
    };

    try {
        await updateDoc(referenciaSala, {
            votos: arrayUnion(ficha_voto)
        });
        console.log("✅ Voto registrado.");
    } catch (error) {
        console.error("❌ ERROR AL VOTAR:", error);
    }
}

function mostrarDialogPuntuaciones(puntuaciones) {
    const dialog = document.getElementById("dialog");
    if (!dialog) return;

    let html = `
        <div class="text-center">
            <h3 class="mb-3">End of Round ${salaActual.rondaActual + 1}</h3>
            
            <img src="${cancionActual.imagen}" alt="Portada" class="img-fluid rounded mb-3" style="max-width: 150px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
            <h4 style="color:#1DB954; margin-bottom: 0;">${cancionActual.titulo}</h4>
            <p style="color:gray; font-size: 1.1rem;">${cancionActual.artista}</p>
            
            <hr>
            <h4>Scores:</h4>
            <div id="lista-puntos" class="mt-3 text-start px-3"></div>
        </div>
    `;

    dialog.innerHTML = html;

    const div_puntuaciones = dialog.querySelector("#lista-puntos");
    for (const p of puntuaciones) {
        const div = document.createElement("div");
        div.className = "d-flex justify-content-between border-bottom py-2";
        div.innerHTML = `<span>${p.nombre}</span> <span class="fw-bold">${p.puntuacion} pts</span>`;
        div_puntuaciones.appendChild(div);
    }
    
    dialog.showModal();
}

// ────────────────────────────────────────────────────
// REPRODUCTOR SPOTIFY IFRAME
// ────────────────────────────────────────────────────
window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const element = document.getElementById('spotify-player-container');
    const options = { width: '100%', height: '80px', uri: 'spotify:track:279k9pXubS6YpBf9iC80T6' };
    const callback = (EmbedController) => {
        reproductorSpotify = EmbedController;
        console.log("Reproductor Spotify listo");
    };
    IFrameAPI.createController(element, options, callback);
};

function reproducirCancion(uri) {
    if (reproductorSpotify) {
        reproductorSpotify.loadUri(uri);
        reproductorSpotify.play();
    }
}

// ────────────────────────────────────────────────────
// DESCONEXIÓN
// ────────────────────────────────────────────────────
window.addEventListener("beforeunload", () => {
    abandonarSala();
});

async function abandonarSala() {
    if (!referenciaSala || !miNombre) return;

    try {
        const docSnap = await getDoc(referenciaSala);

        if (docSnap.exists()) {
            const datosActuales = docSnap.data();
            const jugadoresRestantes = datosActuales.jugadores.filter(j => j !== miNombre);

            if (jugadoresRestantes.length === 0 || miNombre === salaActual.creador) {
                await deleteDoc(referenciaSala);
                console.log("Sala destruida.");
            } else {
                await updateDoc(referenciaSala, {
                    jugadores: arrayRemove(miNombre)
                });
                console.log(`${miNombre} ha abandonado la partida.`);
            }
        }
    } catch (error) {
        console.error("Error al abandonar la sala:", error);
    }
}

