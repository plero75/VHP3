const API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const PRIM_API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";

function updateGlobalDateTime() {
  const now = new Date();
  document.getElementById("current-time").textContent =
    `🕒 ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

async function fetchRealTime(stopAreaId) {
  const url = `${API_PROXY_URL}${PRIM_API_BASE}/stop-monitoring?MonitoringRef=${stopAreaId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur stop-monitoring ${res.status}`);
  return await res.json();
}

async function fetchTraffic(lineId) {
  const url = `${API_PROXY_URL}${PRIM_API_BASE}/general-message?LineRef=${lineId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur infos trafic ${res.status}`);
  return await res.json();
}

async function fetchVelib(stationId, elementId) {
  const now = new Date().toLocaleString();
  document.getElementById("velib-update").textContent = `Dernière mise à jour : ${now}`;
  const url = `https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur Vélib ${res.status}`);
  const data = await res.json();
  const station = data.data.stations.find(s => s.station_id === stationId);
  if (!station) throw new Error("Station Vélib introuvable");
  document.getElementById(elementId).textContent = `🚲 ${station.num_bikes_available} vélos - 🅿️ ${station.num_docks_available} bornes`;
}

async function fetchWeather() {
  const now = new Date().toLocaleString();
  document.getElementById("weather-update").textContent = `Dernière mise à jour : ${now}`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.430&current=temperature_2m,weathercode&timezone=Europe%2FParis`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur météo ${res.status}`);
  const data = await res.json();
  const temp = data.current.temperature_2m;
  const desc = getWeatherDescription(data.current.weathercode);
  document.getElementById("weather").textContent = `🌡 ${temp}°C, ${desc}`;
}

function getWeatherDescription(code) {
  const codes = {
    0: "ciel clair ☀️", 1: "partiellement nuageux 🌤", 2: "nuageux ☁️", 3: "très nuageux ☁️",
    45: "brouillard 🌫", 48: "brouillard givrant ❄️", 51: "bruine légère 🌦",
    53: "bruine 🌦", 55: "forte bruine 🌧", 61: "pluie légère 🌧", 63: "pluie 🌧",
    65: "forte pluie 🌧", 80: "averses légères 🌧", 81: "averses 🌧", 82: "fortes averses ⛈",
  };
  return codes[code] || "conditions inconnues";
}

async function fetchTrafficRoad() {
  const now = new Date().toLocaleString();
  document.getElementById("traffic-road-update").textContent = `Dernière mise à jour : ${now}`;
  const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=10&facet=route";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur trafic routier ${res.status}`);
  const data = await res.json();
  const infos = data.records
    .map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`)
    .join("\n");
  document.getElementById("traffic-road").textContent = infos || "✅ Trafic normal";
}

async function updateStop(elementId, stopId, lineId) {
  const now = new Date().toLocaleString();
  document.getElementById(`${elementId}-update`).textContent = `Dernière mise à jour : ${now}`;
  const realTime = await fetchRealTime(stopId);
  const trips = realTime.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit || [];
  const nextTrips = trips.slice(0, 4).map(t => {
    const aimed = new Date(t.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime);
    const expected = new Date(t.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime);
    const delay = (expected - aimed) / 60000;
    const timeLeft = Math.round((expected - new Date()) / 60000);
    const delayStr = delay > 0 ? ` (retard +${Math.round(delay)} min)` : "";
    const imminent = timeLeft <= 1.5 ? "🟢 imminent" : "";
    return `🕐 ${aimed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → ${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} ⏳ dans ${timeLeft} min${delayStr} ${imminent}`;
  }).join("\n");
  document.getElementById(elementId).textContent = nextTrips || "❌ Aucun passage";

  const traffic = await fetchTraffic(lineId);
  const disruptions = traffic.Siri.ServiceDelivery.GeneralMessageDelivery[0].InfoMessage || [];
  const trafficInfo = disruptions.map(d => d.InfoMessageText?.[0]?.value).join("\n\n");
  document.getElementById(`${elementId}-traffic`).textContent = trafficInfo || "✅ Pas de perturbation signalée";
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
setInterval(refreshAll, 60000); // refresh every minute
