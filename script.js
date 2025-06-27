const API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const PRIM_API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";
const VELIB_IDS = { vincennes: "1074333296", breuil: "508042092" };

const STOP_IDS = {
  rer_joinville: ["STIF:StopArea:SP:43135:"],
  bus77_hippo: ["STIF:StopArea:SP:463641:"],
  bus201_breuil: ["STIF:StopArea:SP:463644:"],
};

async function fetchWithTimeout(resource, options = {}, timeout = 8000, retries = 2) {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(resource, { ...options, signal: controller.signal });
      clearTimeout(id);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      clearTimeout(id);
      if (attempt >= retries) throw error;
      attempt++;
    }
  }
}

async function fetchStop(stopId, elementId) {
  try {
    const url = `${API_PROXY_URL}${PRIM_API_BASE}/stop-monitoring?MonitoringRef=${encodeURIComponent(stopId)}`;
    const data = await fetchWithTimeout(url, { headers: { "apikey": "pKjUX6JVy3uLQJXsT0cfkFbsPJZUsKob" } });
    updateStop(data, elementId);
  } catch (error) {
    document.getElementById(elementId).textContent = "Erreur de chargement";
  }
}

function updateStop(data, elementId) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";
  const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

  if (visits.length === 0) {
    container.innerHTML = "<div>🛑 Trafic terminé ou service non commencé</div>";
    return;
  }

  visits.slice(0, 4).forEach(visit => {
    const mvj = visit.MonitoredVehicleJourney;
    const aimed = new Date(mvj.MonitoredCall.AimedDepartureTime);
    const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
    const now = new Date();

    const aimedStr = aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const expectedStr = expected.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const diff = Math.floor((expected - now) / 60000);
    let info = "";

    if (mvj.MonitoredCall.DepartureStatus === "cancelled") {
      info = "❌ Supprimé";
    } else if (diff < 0) {
      info = `⚠️ Retardé de ${Math.abs(diff)} min`;
    } else if (diff < 2) {
      info = "🟢 Passage imminent";
    } else {
      info = `⏳ ${diff} min`;
    }

    const html = `
      <div>
        🕐 ${aimedStr} → ${expectedStr} ${info} <br/>
        🚩 Destination : ${mvj.DestinationName.value}
      </div>`;
    container.innerHTML += html;
  });
}

async function fetchVelib(stationId, elementId) {
  try {
    const url = `https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json`;
    const data = await fetchWithTimeout(url);
    const station = data.data.stations.find(s => s.station_id === stationId);

    if (!station) {
      document.getElementById(elementId).textContent = "Station introuvable";
      return;
    }

    document.getElementById(elementId).innerHTML = `
      🚲 Vélos : ${station.num_bikes_available} / 🚏 Bornes : ${station.num_docks_available}`;
  } catch (error) {
    document.getElementById(elementId).textContent = "Erreur Vélib'";
  }
}

async function fetchWeather(elementId) {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=48.84&longitude=2.42&current=temperature_2m,precipitation,rain,snowfall";
    const data = await fetchWithTimeout(url);
    const weather = data.current;
    document.getElementById(elementId).innerHTML = `
      🌡 ${weather.temperature_2m}°C ${weather.precipitation ? "🌧" : "☀️"}`;
  } catch (error) {
    document.getElementById(elementId).textContent = "Erreur météo";
  }
}

async function fetchTraffic(elementId) {
  try {
    const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=10";
    const data = await fetchWithTimeout(url);
    const record = data.records[0]?.fields;
    document.getElementById(elementId).innerHTML = record
      ? `🚦 Circulation : ${record.etat_trafic}`
      : "Aucune donnée";
  } catch (error) {
    document.getElementById(elementId).textContent = "Erreur trafic";
  }
}

function refreshAll() {
  fetchStop(STOP_IDS.rer_joinville[0], "rer");
  fetchStop(STOP_IDS.bus77_hippo[0], "bus77");
  fetchStop(STOP_IDS.bus201_breuil[0], "bus201");
  fetchVelib(VELIB_IDS.vincennes, "velib-vincennes");
  fetchVelib(VELIB_IDS.breuil, "velib-breuil");
  fetchWeather("meteo");
  fetchTraffic("trafic");
}

refreshAll();
setInterval(refreshAll, 60000);
