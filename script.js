// ===================
//  GTFS CACHE MODULE
// ===================

const GTFS_CACHE_KEY = "gtfsCache";

async function loadGTFS(lineKey, stopId) {
  const cache = getCachedGTFS();
  const today = new Date().toISOString().split("T")[0];

  if (cache?.lastUpdate === today && cache.lines?.[lineKey]) {
    return cache.lines[lineKey];
  }

  const url = `https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/download/?format=json&timezone=Europe/Paris`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const trips = data.filter(entry => entry.stop_point_id?.includes(stopId));
    if (!trips.length) throw new Error("GTFS: aucun trip trouvé.");

    const times = trips.map(t => t.departure_time).sort();
    const stopsSet = new Set();
    trips.forEach(t => {
      if (t.stop_name) stopsSet.add(t.stop_name);
    });

    const result = {
      first: times[0],
      last: times[times.length - 1],
      stops: Array.from(stopsSet)
    };

    const newCache = {
      lastUpdate: today,
      lines: { ...cache?.lines, [lineKey]: result }
    };
    localStorage.setItem(GTFS_CACHE_KEY, JSON.stringify(newCache));
    return result;
  } catch (e) {
    console.error("Erreur chargement GTFS", e);
    return null;
  }
}

function getCachedGTFS() {
  try {
    const raw = localStorage.getItem(GTFS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
// =============================
//  CONFIGURATION & CONSTANTES
// =============================

const API_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev";
const STOP_POINTS = {
  rer: {
    name: "RER A Joinville-le-Pont",
    icon: "img/picto-rer-a.svg",
    url: `${API_PROXY}/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43135:&LineRef=STIF:Line::C01371:`
  },
  bus77: {
    name: "BUS 77 Hippodrome de Vincennes",
    icon: "img/picto-bus.svg",
    url: `${API_PROXY}/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463641:&LineRef=STIF:Line::C01445:`
  },
  bus201: {
    name: "BUS 201 École du Breuil",
    icon: "img/picto-bus.svg",
    url: `${API_PROXY}/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463644:&LineRef=STIF:Line::C01201:`
  }
};

const VELIB_IDS = {
  "velib-vincennes": "1074333296",
  "velib-breuil": "508042092"
};

// ===================
//   UTILS
// ===================

function formatTime(d) {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
}
function formatDateFr(d = new Date()) {
  return d.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ===================
//  MÉTÉO
// ===================

async function fetchWeather() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=48.8327&longitude=2.4382&current_weather=true&timezone=Europe%2FParis";
  let html = `<div class='bloc-titre'><img src='img/picto-meteo.svg' class='icon-inline'>Météo</div>`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.current_weather) {
      const t = Math.round(data.current_weather.temperature);
      const vent = data.current_weather.windspeed;
      const code = data.current_weather.weathercode;
      html += `
        <div>🌡️ <b>${t}°C</b></div>
        <div>💨 ${vent} km/h</div>
        <div>🌤️ ${weatherCodeToString(code)}</div>
      `;
    } else html += "<div>Météo indisponible</div>";
  } catch {
    html += "<div>Erreur météo</div>";
  }
  document.getElementById("weather-bloc").innerHTML = html;
}

function weatherCodeToString(code) {
  const map = {
    0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux", 3: "Couvert",
    45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine modérée",
    55: "Bruine dense", 61: "Pluie faible", 63: "Pluie modérée", 65: "Pluie forte",
    80: "Averses faibles", 81: "Averses modérées", 82: "Averses fortes", 95: "Orage"
  };
  return map[code] || "Inconnu";
}

// ===================
//  TRAFIC ROUTIER SYTADIN
// ===================

async function updateTrafficBloc() {
  const el = document.getElementById("info-trafic-bloc");
  try {
    const res = await fetch("https://corsproxy.io/?https://www.sytadin.fr/sys/barreau_courbe_cms.php?type=N");
    const html = await res.text();
    const match = html.match(/globalEtat":"([^"]+)"/);
    const message = match ? match[1] : "Indisponible";
    const color = /fluide/i.test(message) ? "green" :
                  /dense/i.test(message) ? "orange" : "red";
    el.innerHTML = `
      <div class='bloc-titre'><img src='img/picto-info.svg' class='icon-inline'>Info trafic routier</div>
      <div style="border-left:10px solid ${color};padding-left:10px;margin-top:10px">🚦 ${message}</div>
    `;
  } catch {
    el.innerHTML = "<div class='bloc-titre'>Trafic routier</div><div>Indisponible</div>";
  }
}

// ===================
//  VELIB DYNAMIQUE
// ===================

async function updateVelibBlocDynamic(id) {
  const infoURL = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_information.json";
  const statusURL = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json";
  try {
    const [infoRes, statusRes] = await Promise.all([fetch(infoURL), fetch(statusURL)]);
    const infoData = await infoRes.json();
    const statusData = await statusRes.json();
    const sid = VELIB_IDS[id];
    const info = infoData.data.stations.find(s => s.station_id === sid);
    const stat = statusData.data.stations.find(s => s.station_id === sid);
    const ele = document.getElementById(id);
    ele.innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>${info.name}</div>
      🚲 Mécaniques : ${stat.num_bikes_available - stat.num_ebikes_available}<br>
      ⚡ Électriques : ${stat.num_ebikes_available}<br>
      🅿️ Places libres : ${stat.num_docks_available}
    `;
  } catch {
    document.getElementById(id).innerHTML = "Données Vélib indisponibles.";
  }
}

// ===================
//  TEMPS RÉEL PRIM
// ===================

async function renderDepartures(elementId, stopKey) {
  const block = STOP_POINTS[stopKey];
  try {
    const res = await fetch(block.url);
    const data = await res.json();
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    if (!visits.length) {
      document.getElementById(elementId).innerHTML = `
        <div class='title-line'><img src='${block.icon}' class='icon-inline'>${block.name}</div>
        <ul><li>✅ Service terminé — reprise prévue demain</li></ul>`;
      return;
    }

    const items = visits.slice(0, 4).map(v => {
      const t = v.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
      const dest = v.MonitoredVehicleJourney.DestinationName;
      return `<li>${formatTime(t)} → ${dest}</li>`;
    }).join("");

    const first = visits[0].MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
    const last = visits.at(-1).MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;

    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='${block.icon}' class='icon-inline'>${block.name}</div>
      <ul>${items}</ul>
      <div class='schedule-extremes'>Premier départ : ${formatTime(first)}<br>Dernier départ : ${formatTime(last)}</div>`;
  } catch {
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='${block.icon}' class='icon-inline'>${block.name}</div>
      <ul><li>Erreur chargement des données</li></ul>`;
  }
}

// ===================
//  RAFRAÎCHISSEMENT
// ===================

function refreshAll() {
  document.getElementById("current-date").textContent = formatDateFr();
  document.getElementById("current-time").textContent = formatTime(new Date());
  fetchWeather();
  updateTrafficBloc();
  updateVelibBlocDynamic("velib-vincennes");
  updateVelibBlocDynamic("velib-breuil");
  renderDepartures("rer-content", "rer");
  renderDepartures("bus77-content", "bus77");
  renderDepartures("bus201-content", "bus201");
}

refreshAll();
setInterval(refreshAll, 60000);
