import { fetchProfile } from "./profile.js";
import { db } from "./firebase.js";
import {doc, setDoc, getDoc, updateDoc, arrayUnion} from "firebase/firestore";

const tokenGuardado = localStorage.getItem("token");
//Inventar codigo de 4 letras al azar
console.log("¡lobby.js está vivo y funcionando!");
function generarCodigo(){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUWVXYZ123456789';
    let codigo = '';
    for(let i=0; i<4; i++){
        const indice = Math.floor(Math.random()*chars.length);
        codigo+= chars.charAt(indice);
    }

    return codigo;
}
async function getSongs(cantidad, nombreUsuario){
    const token = localStorage.getItem("token");
    if (!token) return [];

    // Definimos los tres rangos de tiempo que ofrece Spotify
    const rangos = ['medium_term', 'short_term', 'long_term'];
    let items = [];

    try {
        // Intentamos en cada rango hasta que encontremos algo
        for (const rango of rangos) {
            console.log(`Buscando canciones para ${nombreUsuario} en el rango: ${rango}...`);
            
            const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?time_range=${rango}&limit=20`, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` },
            });

            const datos = await response.json();
            if (datos.items && datos.items.length > 0) {
                items = datos.items;
                console.log(`✅ ¡Encontradas ${items.length} canciones en ${rango}!`);
                break; // Si encontramos canciones, salimos del bucle
            }
        }

        // 🚨 PLAN DE EMERGENCIA: Si después de los 3 intentos sigue vacío...
        if (items.length === 0) {
            console.warn("⚠️ Usuario sin historial. Añadiendo canciones de emergencia.");
            return [
                { titulo: "La Player", artista: "Zion & Lennox", uri: "spotify:track:279k9pXubS6YpBf9iC80T6", dueno: nombreUsuario },
                { titulo: "Despacito", artista: "Luis Fonsi", uri: "spotify:track:6habFIhfrctm9gT7U7XCOJ", dueno: nombreUsuario },
                { titulo: "Never Gonna Give You Up", artista: "Rick Astley", uri: "spotify:track:4cOdK2wGqyNGmB93ZThqid", dueno: nombreUsuario }
            ];
        }

        // Barajamos y preparamos el envío
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }

        return items.slice(0, cantidad).map(track => ({
            titulo: track.name,
            artista: track.artists[0].name,
            uri: track.uri,
            dueno: nombreUsuario
        }));

    } catch (error) {
        console.error("Error en getSongs:", error);
        return [];
    }
}
//Funcion que se conecta a la nube
async function crearSala(evt){
    evt.preventDefault();
    console.log("Crear sala");
    const codigoSecreto = generarCodigo();
    const nombre = document.getElementById("nombre").value;
    localStorage.setItem("nombreUsuario", nombre);
    try {
        // Obtenemos las 5 canciones del Host
        const misCanciones = await getSongs(5, nombre);

        const referenciasSala = doc(db, "salas", codigoSecreto);

        await setDoc(referenciasSala, {
            estado: "esperandoJugadores",
            creador: nombre,
            jugadores: [nombre],
            canciones: misCanciones // <-- El Host ya aporta sus temas
        });

        location.href = `lobby.html?codigo=${codigoSecreto}`;
    } catch (error) {
        console.error("Error al crear:", error);
    }
}
const botonCrear = document.getElementById("btn-crear-sala");
console.log("¿He encontrado el botón?", botonCrear);
if (botonCrear) {
    botonCrear.addEventListener("click", () => {
        crearSala(event); 
    });
    console.log("¡Evento de clic conectado al botón!");
} else {
    console.error("¡ERROR! No encuentro el botón con el id 'btn-crear-sala'. Revisa el HTML.");
}

async function unirseSala(evt){
    evt.preventDefault();
    
    const inputCodigo = document.getElementById("id_room");
    const inputNombre = document.getElementById("nombre");


    if (!inputCodigo || !inputNombre) {
        console.error("❌ No se encuentran los inputs id_room o nombre en el HTML");
        return;
    }

    const codigo = inputCodigo.value.toUpperCase().trim();
    const nombre = inputNombre.value.trim();
    localStorage.setItem("nombreUsuario", nombre);
    console.log(`Buscando sala: ${codigo} para el usuario: ${nombre}`);

    const referenciasSala = doc(db, "salas", codigo);

    try {
        const documentoSala = await getDoc(referenciasSala);

        if (documentoSala.exists()) {
            console.log("🏠 Sala encontrada. Obteniendo canciones...");
            
            // 1. Obtenemos las canciones
            const susCanciones = await getSongs(5, nombre);

            // 2. Solo intentamos actualizar si tenemos canciones
            if (susCanciones.length > 0) {
                await updateDoc(referenciasSala, {
                    jugadores: arrayUnion(nombre),
                    canciones: arrayUnion(...susCanciones)
                });
                console.log("🚀 Firebase actualizado con éxito");
            } else {
                // Si el usuario no tiene canciones, al menos lo unimos a la lista de jugadores
                await updateDoc(referenciasSala, {
                    jugadores: arrayUnion(nombre)
                });
                console.log("No canciones");

            }

            location.href = `lobby.html?codigo=${codigo}`;
        } else {
            alert("La sala no existe.");
        }
    } catch (error) {
        console.error("❌ Error crítico al unirse:", error);
    }
}



const btnUnirse = document.getElementById("unirse");
    btnUnirse.addEventListener("click", () => {
        unirseSala(event); 
    });