import { setLogLevel } from "firebase/app";
import { db } from "./firebase.js";
import { doc, onSnapshot, updateDoc, getDoc, arrayUnion } from "firebase/firestore";

const parametrosURL = new URLSearchParams(window.location.search);
const codigo = parametrosURL.get("codigo");
const rondas = parametrosURL.get("rondas");
console.log("CODIGO: ", codigo);
const miNombre = localStorage.getItem("nombreUsuario"); // Lo guardamos al unirnos/crear

let reproductorSpotify = null;
let salaActual = null;
let yaHeVotado = false;

if (codigo) {
    console.log("🔍 Intentando conectar a la sala:", codigo);
    const referenciaSala = doc(db, "salas", codigo);
    
    onSnapshot(referenciaSala, (snapshot) => {
        if (snapshot.exists()) {
            const nuevosDatos = snapshot.data();
            console.log("📦 Datos recibidos de Firebase:", nuevosDatos); // ESTO ES CLAVE
            
            salaActual = nuevosDatos;
            console.log("Sala actual: ", salaActual);
            gestionarEstadoJuego();
        } else {
            console.error("❌ La sala no existe en Firebase.");
        }
    });
} else {
    console.error("❌ No hay código en la URL. ¿Has llegado aquí desde el lobby?");
}
function gestionarEstadoJuego() {
    if (!salaActual) return;

    if (!salaActual.cancionesPartida) {
        console.warn("⚠️ Falta el campo 'canciones'");
        return;
    }
    if (salaActual.rondaActual === undefined) {
        console.log("Sala: ",salaActual.rondaActual);
        console.warn("⚠️ Falta el campo 'rondaActual'");
        return;
    }

    console.log("Arrancando ronda:", salaActual.rondaActual);
    
    const cancionActual = salaActual.cancionesPartida[salaActual.rondaActual];
    
    // Si por algún motivo la canción actual es undefined, también paramos
    if (!cancionActual) {
        console.error("No hay canción para esta ronda");
        return;
    }

    // Actualizamos la interfaz
    const tituloRonda = document.getElementById("ronda-titulo");
    if (tituloRonda) {
        tituloRonda.innerText = `Ronda ${salaActual.rondaActual + 1}`;
    }
    
    dibujarBotonesVoto(); 
    const miNombre = localStorage.getItem("nombreUsuario");
    console.log(miNombre);
    if (reproductorSpotify) {
        console.log("Reproduciendo:", cancionActual.titulo);
        reproducirCancion(cancionActual.uri);
    }
}

function dibujarBotonesVoto() {
    const contenedor = document.getElementById("voto-container");
    contenedor.innerHTML = "";

    salaActual.jugadores.forEach(nombre => {
        const btn = document.createElement("button");
        btn.innerText = nombre;
        btn.className = "btn-jugador";
        
        // Si ya hemos votado en esta ronda, desactivamos los botones
        if (yaHeVotado) btn.disabled = true;

        btn.onclick = () => registrarVoto(nombre);
        contenedor.appendChild(btn);
    });
}

async function registrarVoto(candidato) {
    const referenciaSala = doc(db, "salas", codigo);
    yaHeVotado = true;
    console.log(`Has votado que la canción es de: ${candidato}`);
    const ficha_voto = {"votante": miNombre, "votado":candidato};
    console.log(ficha_voto);
    // Aquí podrías guardar el voto en Firebase para el recuento final
    try {
        console.log("Guardando voto");

        await updateDoc(referenciaSala, {
            votos: arrayUnion(candidato)
        });

        console.log("✅ ¡ESCRITURA EXITOSA! Ahora el onSnapshot debería activarse.");
    } catch (error) {
        console.error("❌ ERROR AL ESCRIBIR EN FIREBASE:", error);
    }
    // Por ahora, solo lo marcamos localmente
    dibujarBotonesVoto();
}

window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const element = document.getElementById('spotify-player-container');
    const options = { width: '100%', height: '80px' };
    const callback = (EmbedController) => {
        console.log("Se crea cancion");
        reproductorSpotify = EmbedController;
        console.log("Reproductor listo");
    };
    IFrameAPI.createController(element, options, callback);
};

function reproducirCancion(uri) {
    if (reproductorSpotify) {
        reproductorSpotify.loadUri(uri);
        reproductorSpotify.play();
    }
}