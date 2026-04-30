
import { db } from "./firebase.js";
import { doc, onSnapshot, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";


const parametrosURL = new URLSearchParams(window.location.search);
const codigo = parametrosURL.get("codigo");

const cod_text = document.getElementById("code");
const players_grid = document.getElementById("players_grid");
var listaJugadores = null;
const miNombre = localStorage.getItem("nombreUsuario");

if (codigo) {
    cod_text.textContent = "ROOM ID: " + codigo;

    const referenciaSala = doc(db, "salas", codigo);
    
    onSnapshot(referenciaSala, { includeMetadataChanges: true },(documento) => {
    if (documento.metadata.hasPendingWrites) {
        console.log("⏳ Firebase está subiendo los datos... esperando confirmación.");
        return;
    }
    if (documento.exists()) {
        const datosSala = documento.data();
        
        // 1. Si estamos esperando, dibujamos la lista
        if (datosSala.estado === "esperandoJugadores") {
            listaJugadores = datosSala.jugadores || [];
            players_grid.innerHTML = "";
            listaJugadores.forEach((nombre) => {
                const tarjetaJugador = document.createElement("div");
                tarjetaJugador.className = "tarjeta-jugador"; 
                tarjetaJugador.innerText = "🎮 " + nombre;
                players_grid.appendChild(tarjetaJugador);
            });
        } 
        
        // 2. Si el estado cambia a jugando, todos saltan a game.html
        else if (datosSala.estado === "jugando") {
            console.log("A jugallll");
            location.href = `game.html?codigo=${codigo}&&rondas=${listaJugadores.length*2}`;
        }

    } else {
        console.warn("La sala ha dejado de existir.");
        location.href = "index.html";
    }
});
const btnEmpezar = document.querySelector("footer button");
btnEmpezar.addEventListener("click", async (e) => {
    e.preventDefault();
    const referenciaSala = doc(db, "salas", codigo);
    const docSnap = await getDoc(referenciaSala);
    const datos = docSnap.data();

    /*if (datos.jugadores.length < 2) {
        alert("¡Necesitas al menos 2 jugadores!");
        return;
    }*/

    const cancionesMezcladas = barajarArray(datos.canciones);
    try {
        console.log("Intentando actualizar Firebase...");

        let puntuaciones = [];

        listaJugadores.forEach(jugador => {
            puntuaciones.push({"nombre": jugador, "puntuacion": 0});
        });

        await updateDoc(referenciaSala, {
            estado: "jugando",
            cancionesPartida: cancionesMezcladas,
            rondaActual: 0,
            votos: [],
            puntuaciones: puntuaciones,
            tiempoInicioRonda: Date.now()
        });

        console.log("✅ ¡ESCRITURA EXITOSA! Ahora el onSnapshot debería activarse.");
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

window.addEventListener("beforeunload", () => {
    abandonarLobby();
});

async function abandonarSala() {
    if (!referenciaSala || !miNombre) return;

    try {
        const docSnap = await getDoc(referenciaSala);
        
        if (docSnap.exists()) {
            const datosActuales = docSnap.data();
            // Calculamos cuántos jugadores quedarían si nos vamos nosotros
            const jugadoresRestantes = datosActuales.jugadores.filter(jugador => jugador !== miNombre);

            if (jugadoresRestantes.length === 0 || miNombre === salaActual.creador) {
                await deleteDoc(referenciaSala);
                console.log("Sala destruida (no quedaba nadie).");
            } else {

                await updateDoc(referenciaSala, {
                    jugadores: arrayRemove(miNombre)
                });
                console.log(`El jugador ${miNombre} ha abandonado la partida.`);
            }
        }
    } catch (error) {
        console.error("Error al intentar abandonar la sala:", error);
    }
}