import { db } from "./firebase.js";
import { doc, onSnapshot, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";

const parametrosURL = new URLSearchParams(window.location.search);
const codigo = parametrosURL.get("codigo");

const cod_text = document.getElementById("code");
const players_grid = document.getElementById("players_grid");
var listaJugadores = null;
const miNombre = localStorage.getItem("nombreUsuario");

// ✅ FIX: referenciaSala declarada en scope de módulo para que abandonarSala() la pueda usar
let referenciaSala = null;
let yendoAlJuego = false;

if (codigo) {
    cod_text.textContent = "ROOM ID: " + codigo;
    referenciaSala = doc(db, "salas", codigo);

    onSnapshot(referenciaSala, { includeMetadataChanges: true }, (documento) => {
        if (documento.metadata.hasPendingWrites) {
            console.log("⏳ Firebase está subiendo los datos... esperando confirmación.");
            return;
        }
        if (documento.exists()) {
            const datosSala = documento.data();

            if (datosSala.estado === "esperandoJugadores") {
                listaJugadores = datosSala.jugadores || [];
                players_grid.innerHTML = "";
                listaJugadores.forEach((nombre) => {
                    const tarjetaJugador = document.createElement("div");
                    tarjetaJugador.className = "tarjeta-jugador";
                    tarjetaJugador.innerText = "🎮 " + nombre;
                    players_grid.appendChild(tarjetaJugador);
                });
            } else if (datosSala.estado === "jugando") {
                console.log("¡A jugar!");
                yendoAlJuego = true;
                location.href = `game.html?codigo=${codigo}&rondas=${listaJugadores.length * 2}`;
            }

        } else {
            console.warn("La sala ha dejado de existir.");
            location.href = "index.html";
        }
    });

    const btnEmpezar = document.querySelector("#btn-empezar");
    btnEmpezar.addEventListener("click", async (e) => {
        e.preventDefault();
        const docSnap = await getDoc(referenciaSala);
        const datos = docSnap.data();

        const cancionesMezcladas = barajarArray(datos.canciones);

        try {
            console.log("Intentando actualizar Firebase...");
            let puntuaciones = listaJugadores.map(jugador => ({
                nombre: jugador,
                puntuacion: 0
            }));

            await updateDoc(referenciaSala, {
                estado: "jugando",
                cancionesPartida: cancionesMezcladas,
                rondaActual: 0,
                votos: [],
                puntuaciones: puntuaciones,
                tiempoInicioRonda: Date.now()
            });

            console.log("✅ ¡Firebase actualizado! Todos deberían saltar a game.html.");
        } catch (error) {
            console.error("❌ ERROR AL ESCRIBIR EN FIREBASE:", error);
        }
    });

} else {
    cod_text.textContent = "Error: No se encontró el código de la sala";
}

function barajarArray(array) {
    let copia = [...array];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

// ✅ FIX: era "abandonarLobby()" pero la función se llama "abandonarSala()"
window.addEventListener("beforeunload", () => {
    if (!yendoAlJuego) { // <--- AÑADE ESTE IF
        abandonarSala();
    }
});

async function abandonarSala() {
    if (!referenciaSala || !miNombre) return;

    try {
        const docSnap = await getDoc(referenciaSala);

        if (docSnap.exists()) {
            const datosActuales = docSnap.data();
            const jugadoresRestantes = datosActuales.jugadores.filter(j => j !== miNombre);

            if (jugadoresRestantes.length === 0 || miNombre === datosActuales.creador) {
                await deleteDoc(referenciaSala);
                console.log("Sala destruida.");
            } else {
                await updateDoc(referenciaSala, {
                    jugadores: arrayRemove(miNombre)
                });
                console.log(`${miNombre} ha abandonado el lobby.`);
            }
        }
    } catch (error) {
        console.error("Error al abandonar la sala:", error);
    }
}