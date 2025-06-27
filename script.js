const API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const PRIM_API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";

async function fetchRealTime(stopAreaId) {
  const cacheKey = `cache-${stopAreaId}`;
  if (sessionStorage[cacheKey]) {
    return JSON.parse(sessionStorage[cacheKey]);
  }
  const url = `${API_PROXY_URL}${PRIM_API_BASE}/stop-monitoring?MonitoringRef=${stopAreaId}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Erreur stop-monitoring ${res.status}`);
  const data = await res.json();
  sessionStorage[cacheKey] = JSON.stringify(data);
  return data;
}


async function fetchTraffic(lineId) {
  const url = `${API_PROXY_URL}${PRIM_API_BASE}/general-message?LineRef=${lineId}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Erreur infos trafic ${res.status}`);
  return await res.json();
}

function updateGlobalDateTime() {
  const now = new Date();
  document.getElementById("current-time").textContent = `🕒 ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

async function fetchVelib(stationId, elementId) {
  updateElementTime("velib-update");
  const url = `https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Erreur Vélib ${res.status}`);
    const data = await res.json();
    if (!data || !data.data || !Array.isArray(data.data.stations)) throw new Error("Réponse Vélib invalide ou vide");
    const station = data.data.stations.find(s => s.station_id === stationId);
    if (!station) throw new Error("Station Vélib introuvable");
    updateElementText(elementId, `🚲 ${station.num_bikes_available} vélos - 🅿️ ${station.num_docks_available} bornes`);
  } catch (e) {
    console.warn("Erreur lors de la récupération Vélib:", e);
    updateElementText(elementId, "⚠️ Données Vélib indisponibles");
  }
}

async function fetchWeather() {
  updateElementTime("weather-update");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.430&current=temperature_2m,weathercode&timezone=Europe%2FParis`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Erreur météo ${res.status}`);
  const data = await res.json();
  const temp = data.current.temperature_2m;
  const desc = getWeatherDescription(data.current.weathercode);
  updateElementText("weather", `🌡 ${temp}°C, ${desc}`);
}

async function fetchTrafficRoad() {
  updateElementTime("traffic-road-update");
  const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=10&facet=route";
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Erreur trafic routier ${res.status}`);
    const data = await res.json();
    const infos = data.records.map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`).join("\n");
    updateElementText("traffic-road", infos || "✅ Trafic normal");
  } catch (e) {
    console.warn("Erreur lors de la récupération trafic routier:", e);
    updateElementText("traffic-road", "⚠️ Données trafic indisponibles");
  }
}
async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('La requête a expiré (timeout)');
    }
    throw e;
  }
}

async function updateStop(elementId, stopId, lineId) {
  updateElementTime(`${elementId}-update`);
  const tripsText = await processTrips(stopId);
  updateElementText(elementId, tripsText);
  const trafficText = await processTraffic(lineId);
  updateElementText(`${elementId}-traffic`, trafficText);
}
async function processTrips(stopId) {
  const realTime = await fetchRealTime(stopId);
  const trips = realTime.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit || [];
  return trips.slice(0, 4).map(t => formatTrip(t)).join("\n") || "❌ Aucun passage";
}

function formatTrip(t) {
  const aimedRaw = t.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
  const expectedRaw = t.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime;
  const aimed = aimedRaw ? new Date(aimedRaw) : null;
  const expected = new Date(expectedRaw);
  const delay = aimed ? (expected - aimed) / 60000 : 0;
  const timeLeft = Math.round((expected - new Date()) / 60000);
  const delayStr = delay > 1 ? ` (retard +${Math.round(delay)} min)` : "";
  const imminent = timeLeft <= 1.5 ? "🟢 imminent" : "";
  const aimedStr = aimed ? aimed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : "—";
  const expectedStr = expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  return `🕐 ${aimedStr} → ${expectedStr} ⏳ dans ${timeLeft} min${delayStr} ${imminent}`;
}

async function processTraffic(lineId) {
  const traffic = await fetchTraffic(lineId);
  const disruptions = traffic.Siri.ServiceDelivery.GeneralMessageDelivery[0].InfoMessage || [];
  return disruptions.map(d => d.InfoMessageText?.[0]?.value).join("\n\n") || "✅ Pas de perturbation signalée";
}


function updateElementTime(elementId) {
  const now = new Date().toLocaleString();
  document.getElementById(elementId).textContent = `Dernière mise à jour : ${now}`;
}

function updateElementText(elementId, text) {
  document.getElementById(elementId).textContent = text;
}

function getWeatherDescription(code) {
  const codes = {
    0: "ciel clair ☀️", 1: "partiellement nuageux 🌤", 2: "nuageux ☁️", 3: "très nuageux ☁️",
    45: "brouillard 🌫", 48: "brouillard givrant ❄️", 51: "bruine légère 🌦", 53: "bruine 🌦",
    55: "forte bruine 🌧", 61: "pluie légère 🌧", 63: "pluie 🌧", 65: "forte pluie 🌧",
    80: "averses légères 🌧", 81: "averses 🌧", 82: "fortes averses ⛈",
  };
  return codes[code] || "conditions inconnues";
}

async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

async function refreshAll() {
  try {
    updateGlobalDateTime();
    await Promise.all([
      updateStop("rer-joinville", "STIF:StopArea:SP:43135:", "STIF:Line::C01742:"),
      updateStop("bus77-hippo", "STIF:StopArea:SP:463641:", "STIF:Line::C01789:"),
      updateStop("bus201-breuil", "STIF:StopArea:SP:463644:", "STIF:Line::C01805:"),
      fetchVelib("12128", "velib-vincennes"),
      fetchVelib("12163", "velib-breuil"),
      fetchWeather(),
      fetchTrafficRoad()
    ]);
  } catch (e) {
    console.error("Erreur refreshAll:", e);
  }
}

refreshAll();
setInterval(refreshAll, 60000);
