const token = localStorage.getItem("token");

const result = await fetch("https://api.spotify.com/v1/me/top/tracks?limit=50", {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` },
});

const datos = await result.json();

console.log(datos);
var num = Math.floor(Math.random() * (datos.items.length - 0 + 1)) + 0;
console.log("Numero: ", num);
const cancionRonda = datos.items[num]; 
console.log(cancionRonda);

let reproductorSpotify = null; // Nuestro "mando a distancia"

// Esta función es especial: Spotify la busca automáticamente al cargar la página
window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const contenedor = document.getElementById('spotify-player-container');
    
    // Configuramos el reproductor (le ponemos una canción cualquiera para empezar)
    const opciones = {
        uri: cancionRonda, // ID de ejemplo
        width: '100%',
        height: '50%'
    };

    // Cuando el reproductor esté listo, guardamos el control en nuestra variable
    const callback = (ControladorDelReproductor) => {
        reproductorSpotify = ControladorDelReproductor;
        console.log("¡El reproductor de Spotify está listo para usarse!");
    };

    IFrameAPI.createController(contenedor, opciones, callback);

    console.log("QAAAAA");
    mostrarSoloNombre(cancionRonda);
};

function mostrarSoloNombre(cancion) {
    // 1. Ponemos el nombre en nuestro HTML
    const etiquetaNombre = document.getElementById("nombre-cancion-personalizado");
    etiquetaNombre.innerText = cancion.name; // Aquí tienes el nombre limpio

    // 2. Mandamos la URI al reproductor oculto para que suene
    reproducirCancionDelJuego(cancion.uri);
}

function reproducirCancionDelJuego(spotifyUri) {
    if (!reproductorSpotify) {
        console.error("El reproductor aún no ha cargado.");
        return;
    }

    // 1. Le decimos al reproductor qué canción cargar
    reproductorSpotify.loadUri(spotifyUri);

    // 2. Le damos la orden de reproducir (sonarán los 30 segundos de prueba)
    // Nota: El navegador puede requerir que el usuario haya hecho clic en la pantalla antes de permitir que suene.
    reproductorSpotify.play();
}
//location.href = result.url;