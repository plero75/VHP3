const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

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
    updateTimestamp(line.elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(line.elementId).textContent = `Erreur : ${e.message}`;
  }
}

async function fetchPrimInfo(line) {
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line.lineRef}`;
  try {
    const data = await fetchWithRetry(url);
    const infos = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    const messages = infos.map(m => m?.Content?.Message?.[0]?.value).filter(Boolean).map(msg => `⚠️ ${msg}`).join("<br>");
    document.querySelector(line.infoId).innerHTML = messages || "✅ Aucun problème signalé.";
  } catch (e) {
    console.error(e);
    document.querySelector(line.infoId).textContent = `Erreur : ${e.message}`;
  }
}

async function fetchVelib(stationId, elementId) {
  setLoading(elementId);
  const url = `${CORS_PROXY}https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json`;
  try {
    const data = await fetchWithRetry(url);
    const station = data?.data?.stations?.find(s => String(s.station_id) === String(stationId));
    if (station) {
      const types = station.num_bikes_available_types || [];
      let mec = 0, elec = 0;
      types.forEach(typeObj => {
        if ("mechanical" in typeObj) mec = typeObj.mechanical;
        if ("ebike" in typeObj) elec = typeObj.ebike;
      });
      const html = `🚲 ${station.num_bikes_available} vélos : 🚴 ${mec} méc. ⚡ ${elec} élec. 🅿️ ${station.num_docks_available} bornes libres`;
      document.querySelector(elementId).innerHTML = html;
    } else {
      document.querySelector(elementId).innerHTML = "⚠️ Station Vélib introuvable";
    }
    updateTimestamp(elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

async function fetchWeather() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis";
  try {
    const res = await fetch(url);
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
    document.querySelector("#meteo").textContent = `Erreur : ${e.message}`;
  }
}

async function fetchAndDisplayRSS(url, elementId) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);
    const titles = items.map(item => item.querySelector("title")?.textContent.trim()).filter(Boolean);
    document.querySelector(elementId).textContent = "📰 " + titles.join(" | ");
  } catch (e) {
    console.error(e);
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
    document.querySelector("#first-last").textContent = `🚆 Premier départ : ${data.first} — Dernier départ : ${data.last}`;
    document.querySelector("#stops-list").textContent = `🛤️ Arrêts : ${data.stops.join(" ➔ ")}`;
  })
  .catch(e => {
    console.error("Erreur chargement GTFS info", e);
    document.querySelector("#first-last").textContent = "🚆 Premier/dernier départ : données indisponibles";
    document.querySelector("#stops-list").textContent = "🛤️ Arrêts : données indisponibles";
  });

// Appels initiaux
updateLines();
updatePerturbations();
updateVelib();
fetchWeather();
fetchAndDisplayRSS(`${CORS_PROXY}https://www.francetvinfo.fr/titres.rss`, "#rss-news");

// Rafraîchissements périodiques
setInterval(updateLines, 2 * 60 * 1000);
setInterval(updateVelib, 15 * 60 * 1000);
setInterval(updatePerturbations, 30 * 60 * 1000);
setInterval(fetchWeather, 15 * 60 * 1000);
setInterval(() => fetchAndDisplayRSS(`${CORS_PROXY}https://www.francetvinfo.fr/titres.rss`, "#rss-news"), 60 * 60 * 1000);