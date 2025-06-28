const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";More actions

const LINES = [
  { name: "RER A", monitoringRef: "STIF:StopPoint:Q:43135:", lineRef: "STIF:Line::C01742:", elementId: "#rer-a", infoId: "#info-rer-a" },
  { name: "Bus 77", monitoringRef: "STIF:StopPoint:Q:463641:", lineRef: "STIF:Line::C01789:", elementId: "#bus-77", infoId: "#info-bus-77" },
  { name: "Bus 201", monitoringRef: "STIF:StopPoint:Q:463644:", lineRef: "STIF:Line::C01805:", elementId: "#bus-201", infoId: "#info-bus-201" }
];

function setLoading(elementId) {
  document.querySelector(elementId).innerHTML = "🔄 Chargement...";
}

function updateTimestamp(elementId) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.querySelector(elementId).insertAdjacentHTML('beforeend', `<div style="font-size:0.8em;">🕒 Mise à jour : ${time}</div>`);
}

async function fetchWithRetry(url, options = {}, retries = 1) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (retries > 0) return fetchWithRetry(url, options, retries - 1);
    else throw e;
  }
}

async function fetchPrimStop(line) {
  setLoading(line.elementId);
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${line.monitoringRef}&LineRef=${line.lineRef}`;
  try {
    const data = await fetchWithRetry(url);
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    if (!visits.length) {
      document.querySelector(line.elementId).innerHTML = "🚫 Aucun passage disponible.";
      return;
    }
    let html = "<ul>";
    visits.slice(0, 4).forEach((v) => {
      const mvj = v.MonitoredVehicleJourney, mc = mvj?.MonitoredCall;
      const expectedRaw = mc?.ExpectedDepartureTime;
      const expectedDate = expectedRaw ? new Date(expectedRaw) : null;
      const timeLeft = expectedDate ? Math.round((expectedDate - new Date()) / 60000) : null;

      const timeStr = expectedDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || "--:--";
      const minuteStr = timeLeft !== null ? `(dans ${timeLeft} min)` : "";
      const dest = mvj.DestinationName?.[0]?.value || "Destination inconnue";
      const imminentClass = timeLeft !== null && timeLeft <= 2 ? "imminent" : "";
      html += `<li class="passage ${imminentClass}"><div>${timeStr} ${minuteStr} ➔ ${dest}</div></li>`;

    });
    html += "</ul>";
    document.querySelector(line.elementId).innerHTML = html;
@@ -105,16 +103,11 @@
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();
    const temp = data.current.temperature_2m;

    const desc = {
      0:"Ciel clair",1:"Principalement clair",2:"Partiellement nuageux",3:"Couvert",45:"Brouillard",
      51:"Bruine",61:"Pluie légère",80:"Averses",95:"Orages"
    }[data.current.weathercode] || "Inconnu";
    document.querySelector("#meteo").innerHTML = `🌡 ${temp}°C, ${desc}`;




    updateTimestamp("#meteo");
  } catch (e) {
    console.error(e);
@@ -137,6 +130,15 @@
    document.querySelector(elementId).textContent = `Erreur RSS : ${e.message}`;
  }
}

function updateLines() { for (const line of LINES) fetchPrimStop(line); }
function updatePerturbations() { for (const line of LINES) fetchPrimInfo(line); }
function updateVelib() {
  fetchVelib("1074333296", "#velib-vincennes");
  fetchVelib("508042092", "#velib-breuil");
}

// GTFS info
fetch("public/gtfs-info.json")
  .then(res => res.json())
  .then(data => {
@@ -149,7 +151,7 @@
    document.querySelector("#stops-list").textContent = "🛤️ Arrêts : données indisponibles";
  });

// Appels initiaux
updateLines();
updatePerturbations();
updateVelib();
