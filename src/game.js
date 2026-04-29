import { setLogLevel } from "firebase/app";
import { db } from "./firebase.js";
import { doc, onSnapshot, updateDoc, getDoc, arrayUnion } from "firebase/firestore";

const parametrosURL = new URLSearchParams(window.location.search);
const codigo = parametrosURL.get("codigo");
const rondas = parametrosURL.get("rondas");
console.log("CODIGO: ", codigo);

const miNombre = localStorage.getItem("nombreUsuario"); 
var referenciaSala = null;

let ronda = 1;
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
    console.log("🔍 Intentando conectar a la sala:", codigo);
    referenciaSala = doc(db, "salas", codigo);
    
    onSnapshot(referenciaSala, (snapshot) => {
        if (snapshot.exists()) {
            const nuevosDatos = snapshot.data();
            console.log("📦 Datos recibidos de Firebase:", nuevosDatos);
            
            salaActual = nuevosDatos;
            console.log("Sala actual: ", salaActual);
            
            if(terminaRonda){
                gestionarEstadoJuego(); 
            }
            
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
        console.warn("⚠️ Falta el campo 'cancionesPartida'");
        return;
    }
    if (salaActual.rondaActual === undefined) {
        console.warn("⚠️ Falta el campo 'rondaActual'");
        return;
    }

    console.log("Arrancando ronda:", salaActual.rondaActual);
    
    cancionActual = salaActual.cancionesPartida[salaActual.rondaActual];
    if (!cancionActual) {
        console.error("No hay canción para esta ronda");
        return;
    }

    //RESETEAMOS VARIABLES PARA LA NUEVA RONDA
    yaHeVotado = false;
    terminaRonda = false;
    seguir = true;
    segundos = 30;
    tiempo_puntuacion = segundos * 100;
    document.getElementById("dialog").innerHTML = ""; 

    const dialog = document.getElementById("dialog");
    if (dialog && dialog.open) {
        dialog.close();
    }
    dialog.innerHTML = ""; // Limpiamos el texto por si acaso

    const tituloRonda = document.getElementById("ronda-titulo");
    if (tituloRonda) {
        tituloRonda.innerText = `Ronda ${salaActual.rondaActual + 1}`;
    }
    
    dibujarBotonesVoto(); 
    
    if (reproductorSpotify && salaActual.creador === miNombre) {
        console.log("Eres el Host. Reproduciendo:", cancionActual.titulo);
        reproducirCancion(cancionActual.uri);
    }

    clearInterval(intervaloTemporizador);
    iniciarReloj();
}

function iniciarReloj() {
    const elementoContador = document.getElementById('contador');
    if (elementoContador) elementoContador.textContent = segundos;

    intervaloTemporizador = setInterval(() => {
        if (segundos > 0 && seguir) {
            segundos--;
            tiempo_puntuacion = segundos * 100;
            if (elementoContador) elementoContador.textContent = segundos;
        } else {
            clearInterval(intervaloTemporizador);
            terminaRonda = true;
            seguir = false;

            if (salaActual.creador === miNombre) {
                calcularResultadosYPasarRonda();
            }
        }
    }, 1000);
}

function dibujarBotonesVoto() {
    const contenedor = document.getElementById("voto-container");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    salaActual.jugadores.forEach(nombre => {
        const btn = document.createElement("button");
        btn.innerText = nombre;
        btn.className = "btn-jugador";
        
        if (yaHeVotado) btn.disabled = true;

        btn.onclick = () => registrarVoto(nombre, event);
        contenedor.appendChild(btn);
    });
}

async function registrarVoto(candidato, evt) {
    evt.preventDefault();
    if (terminaRonda || yaHeVotado) return;
    
    yaHeVotado = true;
    console.log("Va a dibujar");
    dibujarBotonesVoto();

    console.log(`Has votado que la canción es de: ${candidato}`);
    

    const ficha_voto = {
        "votante": miNombre, 
        "votado": candidato,
        "puntosPosibles": tiempo_puntuacion 
    };
    
    try {
        console.log("Guardando voto en la nube...");
        await updateDoc(referenciaSala, {
            votos: arrayUnion(ficha_voto)
        });
        console.log("✅ Voto registrado con éxito.");
    } catch (error) {
        console.error("❌ ERROR AL ESCRIBIR EN FIREBASE:", error);
    }
}

async function calcularResultadosYPasarRonda() {
    console.log("Soy el Host, calculando recuento final...");
    
    const docSnap = await getDoc(referenciaSala);
    const datosActuales = docSnap.data();
    
    let puntuaciones = datosActuales.puntuaciones;
    const votosDeRonda = datosActuales.votos || [];

    for (let i = 0; i < votosDeRonda.length; i++) {
        const voto = votosDeRonda[i];
        if (voto.votado === cancionActual.dueno) {
            for (let j = 0; j < puntuaciones.length; j++) {
                if (puntuaciones[j].nombre === voto.votante) {
                    puntuaciones[j].puntuacion += voto.puntosPosibles;
                }
            }
        }
    }

    puntuaciones.sort(function(a, b){
        return b.puntuacion - a.puntuacion;
    });


    mostrarDialogPuntuaciones(puntuaciones);

    setTimeout(async () => {
        ronda++;
        await updateDoc(referenciaSala, {
            rondaActual: salaActual.rondaActual + 1,
            votos: [],
            puntuaciones: puntuaciones
        });

    }, 5000); 
}


function mostrarDialogPuntuaciones(puntuaciones) {
    const dialog = document.getElementById("dialog");
    if (!dialog) return;

    let div_puntuaciones = document.createElement("div");
    
    for (let i = 0; i < puntuaciones.length; i++) {
        let div = document.createElement("div");
        let p_nombre = document.createElement("p");
        let p_punt = document.createElement("p");

        p_nombre.textContent = puntuaciones[i].nombre;
        p_punt.textContent = puntuaciones[i].puntuacion;
        div.appendChild(p_nombre);
        div.appendChild(p_punt);
        div_puntuaciones.appendChild(div);
    }

    let html = `<h3>Fin de la ronda ${ronda}</h3>`;
    html += `<p style="color:red;">¡La canción era de: ${cancionActual.dueno}!</p>`;
    
    dialog.innerHTML = html;
    dialog.appendChild(div_puntuaciones);

    dialog.showModal();
}


window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const element = document.getElementById('spotify-player-container');
    const options = { width: '100%', height: '80px', uri: 'spotify:track:279k9pXubS6YpBf9iC80T6' };
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