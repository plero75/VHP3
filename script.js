const API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const PRIM_API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";
const VELIB_IDS = {
  vincennes: "1074333296",
  breuil: "508042092"
};

const STOP_IDS = {
  rer_joinville: ["STIF:StopPoint:Q:39406:"],
  bus77_hippo: ["STIF:StopPoint:Q:463640:", "STIF:StopPoint:Q:463647:"],
  bus201_breuil: ["STIF:StopPoint:Q:463646:", "STIF:StopPoint:Q:463643:"],
};

async function fetchWithTimeout(resource, options = {}, timeout = 8000, retries = 2) {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(resource, {...options, signal: controller.signal});
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
        console.warn(`Tentative ${attempt + 1} échouée (AbortError)`);
        if (attempt < retries) {
          attempt++;
          console.info(`Nouvelle tentative (${attempt + 1}/${retries + 1})...`);
          continue;
        } else {
          const abortError = new Error('La requête a échoué après plusieurs tentatives (AbortError)');
          abortError.name = 'AbortError';
          throw abortError;
        }
      }
      throw e;
    }
  }
}

async function fetchRealTime(stopAreaId) {
  const cacheKey = `cache-${stopAreaId}`;
  const cachedData = sessionStorage[cacheKey];
  if (cachedData) {
    const { timestamp, data } = JSON.parse(cachedData);
    if (Date.now() - timestamp < 60000) return data;
  }
  const url = `${API_PROXY_URL}${PRIM_API_BASE}/stop-monitoring?MonitoringRef=${stopAreaId}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Erreur stop-monitoring ${res.status}`);
  const data = await res.json();
  if (!data?.Siri?.ServiceDelivery?.StopMonitoringDelivery) throw new Error("Réponse inattendue : StopMonitoringDelivery manquant");
  sessionStorage[cacheKey] = JSON.stringify({ timestamp: Date.now(), data });
  return data;
}

async function processTrips(stopIds) {
  const results = await Promise.all(stopIds.map(id => fetchRealTime(id)));
  const trips = results.flatMap(rt => rt?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || []);
  if (trips.length === 0) return "❌ Aucun passage ou service terminé.";

  trips.sort((a, b) => {
    const aTime = new Date(a.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime);
    const bTime = new Date(b.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime);
    return aTime - bTime;
  });

  return trips.slice(0, 4).map(t => formatTrip(t)).join("\n\n");
}

function formatTrip(t) {
  const call = t?.MonitoredVehicleJourney?.MonitoredCall;
  const journey = t?.MonitoredVehicleJourney;
  if (!call || !journey) return "⛔ Donnée manquante";

  const aimedRaw = call.AimedDepartureTime;
  const expectedRaw = call.ExpectedDepartureTime;
  const aimed = aimedRaw ? new Date(aimedRaw) : null;
  const expected = expectedRaw ? new Date(expectedRaw) : null;
  if (!expected) return "⛔ Horaire indisponible pour ce passage.";

  const delay = aimed ? (expected - aimed) / 60000 : 0;
  const timeLeft = Math.round((expected - new Date()) / 60000);
  const delayStr = delay > 1 ? ` (+${Math.round(delay)} min)` : "";
  const imminent = timeLeft <= 1.5;
  const expectedStr = expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

  const destination = journey.DestinationName?.[0]?.value || "Destination inconnue";
  const timeInfo = imminent ? "🟢 imminent" : `⏳ ${timeLeft} min`;

  return `🚌 ${expectedStr} (${timeInfo}${delayStr}) → ${destination}`;
}

async function processTraffic(lineId) {
  const traffic = await fetchTraffic(lineId);
  const disruptions = traffic?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
  return disruptions.length > 0
    ? disruptions.map(d => {
        const messages = d.Message || [];
        return messages.map(m => {
          const text = m.MessageText?.value || "Message non disponible";
          return `⚠️ ${text}`;
        }).join("\n\n");
      }).join("\n\n")
    : "✅ Pas de perturbation signalée";
}

async function fetchTraffic(lineId) {
  const url = `${API_PROXY_URL}${PRIM_API_BASE}/general-message?LineRef=${lineId}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Erreur infos trafic ${res.status}`);
  return await res.json();
}

async function updateStop(elementIdPrefix, stopIds, lineId) {
  updateElementTime(`${elementIdPrefix}-update`);
  try {
    const [tripsText, trafficText] = await Promise.all([
      processTrips(stopIds),
      processTraffic(lineId)
    ]);
    const finalText = tripsText + "\n\n🚦 Info trafic :\n" + trafficText;
    updateElementText(elementIdPrefix, finalText);
  } catch (e) {
    console.warn(`Erreur updateStop ${elementIdPrefix}:`, e);
    updateElementText(elementIdPrefix, "⚠️ Données indisponibles");
  }
}

function updateElementTime(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    const now = new Date().toLocaleString();
    el.textContent = `Dernière mise à jour : ${now}`;
  }
}

function updateElementText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = text.replace(/\n/g, "<br>");
  }
}

function updateGlobalDateTime() {
  const el = document.getElementById("current-time");
  if (el) {
    const now = new Date();
    el.textContent = `🕒 ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  }
}

async function fetchVelib(stationId, elementIdPrefix) {
  updateElementTime(`${elementIdPrefix}-update`);
  const url = `${API_PROXY_URL}https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Erreur Vélib ${res.status}`);
    const data = await res.json();
    const station = data.data.stations.find(s => String(s.station_id) === String(stationId));
    if (!station) throw new Error("Station Vélib introuvable");
    updateElementText(elementIdPrefix, `🚲 ${station.num_bikes_available} vélos - 🅿️ ${station.num_docks_available} bornes`);
  } catch (e) {
    console.warn("Erreur Vélib:", e);
    updateElementText(elementIdPrefix, "⚠️ Données Vélib indisponibles");
  }
}

function getWeatherDescription(code) {
  const desc = {
    0: "ciel dégagé", 1: "peu nuageux", 2: "partiellement nuageux", 3: "couvert",
    45: "brouillard", 48: "brouillard givrant", 51: "bruine légère", 53: "bruine modérée",
    55: "bruine dense", 61: "pluie faible", 63: "pluie modérée", 65: "pluie forte",
    80: "averses légères", 81: "averses modérées", 82: "averses fortes", 95: "orage"
  };
  return desc[code] || "conditions inconnues";
}

async function fetchWeather() {
  updateElementTime("weather-update");
  const url = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.430&current=temperature_2m,weathercode&timezone=Europe%2FParis";
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Erreur météo ${res.status}`);
    const data = await res.json();
    const temp = data.current.temperature_2m;
    const code = data.current.weathercode;
    const desc = getWeatherDescription(code);
    const iconSrc = `img/${code}.png`;
    const iconHtml = `<img src="${iconSrc}" alt="${desc}" style="height:24px;vertical-align:middle;" onerror="this.src='img/default.png';">`;
    updateElementText("weather-content", `${iconHtml} 🌡 ${temp}°C, ${desc}`);
  } catch (e) {
    console.warn("Erreur météo:", e);
    updateElementText("weather-content", "⚠️ Météo indisponible");
  }
}

async function fetchTrafficRoad() {
  updateElementTime("traffic-road-update");
  const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=10&facet=route";
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Erreur trafic routier ${res.status}`);
    const data = await res.json();
    const infos = data.records.map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`).join("<br>") || "✅ Trafic normal";
    updateElementText("traffic-road-content", infos);
  } catch (e) {
    console.warn("Erreur trafic routier:", e);
    updateElementText("traffic-road-content", "⚠️ Trafic routier indisponible");
  }
}

async function refreshAll() {
  try {
    updateGlobalDateTime();
    await Promise.all([
      updateStop("rer-joinville", STOP_IDS.rer_joinville, "STIF:Line::C01742:"),
      updateStop("bus77-hippo", STOP_IDS.bus77_hippo, "STIF:Line::C01789:"),
      updateStop("bus201-breuil", STOP_IDS.bus201_breuil, "STIF:Line::C01805:"),
      fetchVelib(VELIB_IDS.vincennes, "velib-vincennes"),
      fetchVelib(VELIB_IDS.breuil, "velib-breuil"),
      fetchWeather(),
      fetchTrafficRoad()
    ]);
  } catch (e) {
    console.error("Erreur refreshAll:", e);
  }
}

refreshAll();
setInterval(refreshAll, 5 * 60 * 1000);

fetchAndDisplayRSS("https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://www.francetvinfo.fr/titres.rss", "#rss-news");
setInterval(() => {
  fetchAndDisplayRSS("https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://www.francetvinfo.fr/titres.rss", "#rss-news");
}, 60 * 60 * 1000);