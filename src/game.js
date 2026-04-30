import { setLogLevel } from "firebase/app";
import { db } from "./firebase.js";
import { doc, onSnapshot, updateDoc, getDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";

const parametrosURL = new URLSearchParams(window.location.search);
const codigo = parametrosURL.get("codigo");
const rondas = parametrosURL.get("rondas");
console.log("CODIGO: ", codigo);

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
    console.log("🔍 Intentando conectar a la sala:", codigo);
    referenciaSala = doc(db, "salas", codigo);
    
    onSnapshot(referenciaSala, (snapshot) => {
        if (snapshot.exists()) {
            const nuevosDatos = snapshot.data();
            console.log("📦 Datos recibidos de Firebase:", nuevosDatos);
            
            salaActual = nuevosDatos;
            if(ronda === rondas){
                location.href = `lobby.html?codigo=${codigo}`;
            }
            if (salaActual.rondaActual !== rondaLocal) {
                rondaLocal = salaActual.rondaActual; // Actualizamos nuestra memoria
                gestionarEstadoJuego(); 
            }
            
        } else {
            console.error("❌ La sala no existe en Firebase.");
            location.href = "index.html";
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
    
    if (reproductorSpotify) {
        console.log("Reproduciendo:", cancionActual.titulo);
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
            // EL TIEMPO SE ACABÓ
            segundos = 0; 
            if (elementoContador) elementoContador.textContent = "0";
            
            clearInterval(intervaloTemporizador);
            terminaRonda = true;
            seguir = false;

            // 🔥 TODOS los jugadores van a esta función ahora, no solo el Host
            procesarFinDeRonda();
        }
    }

    actualizarTiempo(); // Lo ejecutamos de golpe para que no falle al recargar
    intervaloTemporizador = setInterval(actualizarTiempo, 1000);
}

async function procesarFinDeRonda() {
    console.log("Tiempo agotado. Procesando fin de ronda...");
    
    // Bloqueamos los botones para que nadie vote en el último microsegundo
    yaHeVotado = true;
    dibujarBotonesVoto();

    // 1. 👁️ MOSTRAR RESULTADOS A TODOS LOS JUGADORES
    // Hacemos una copia local para que el cartel se abra al instante
    let puntuacionesLocales = JSON.parse(JSON.stringify(salaActual.puntuaciones));
    const votosDeRonda = salaActual.votos || [];

    for (let i = 0; i < votosDeRonda.length; i++) {
        const voto = votosDeRonda[i];
        if (voto.votado === cancionActual.dueno) {
            for (let j = 0; j < puntuacionesLocales.length; j++) {
                if (puntuacionesLocales[j].nombre === voto.votante) {
                    puntuacionesLocales[j].puntuacion += voto.puntosPosibles;
                }
            }
        }
    }

    // Ordenamos y lanzamos el Dialog para todos
    puntuacionesLocales.sort((a, b) => b.puntuacion - a.puntuacion);
    mostrarDialogPuntuaciones(puntuacionesLocales);

    // 2. 👑 SOLO EL HOST HACE EL TRÁMITE OFICIAL EN FIREBASE
    if (salaActual.creador === miNombre) {
        console.log("Soy el Host. Asegurando votos finales en la nube...");
        
        // El Host vuelve a pedir a Firebase los votos por si entró alguno tarde
        const docSnap = await getDoc(referenciaSala);
        const datosActuales = docSnap.data();
        
        let puntuacionesOficiales = datosActuales.puntuaciones;
        const votosOficiales = datosActuales.votos || [];

        for (let i = 0; i < votosOficiales.length; i++) {
            const voto = votosOficiales[i];
            if (voto.votado === cancionActual.dueno) {
                for (let j = 0; j < puntuacionesOficiales.length; j++) {
                    if (puntuacionesOficiales[j].nombre === voto.votante) {
                        puntuacionesOficiales[j].puntuacion += voto.puntosPosibles;
                    }
                }
            }
        }

        puntuacionesOficiales.sort((a, b) => b.puntuacion - a.puntuacion);

        // Esperamos 5 segundos viendo el Dialog y pasamos de ronda
        setTimeout(async () => {
            ronda++;
            await updateDoc(referenciaSala, {
                rondaActual: salaActual.rondaActual + 1,
                votos: [],
                puntuaciones: puntuacionesOficiales,
                tiempoInicioRonda: Date.now() // Sellamos la nueva hora
            });
        }, 5000); 
    }
}

function dibujarBotonesVoto() {
    const contenedor = document.getElementById("voto-container");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    salaActual.jugadores.forEach(nombre => {
        const btn = document.createElement("button");
        btn.innerText = nombre;
        btn.className = "btn-jugador btn btn-success btn-lg";
        
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
    
    tiempo_puntuacion = segundos * 100;
    console.log("Tiempo puntuacion: ", tiempo_puntuacion);
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
    console.log("Calculando recuento final...");
    
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
            puntuaciones: puntuaciones,
            tiempoInicioRonda: Date.now()
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
}// -----------------------------------------------------------
// 🚪 SISTEMA DE DESCONEXIÓN Y LIMPIEZA
// -----------------------------------------------------------

window.addEventListener("beforeunload", (evento) => {
    abandonarSala();
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