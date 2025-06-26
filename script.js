
// =============================
//  CONFIGURATION & CONSTANTES
// =============================

const API_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev";
const STOP_AREAS = {
  rer: "STIF:StopArea:SP:43135:",
  bus77: "STIF:StopArea:SP:463641:",
  bus201: "STIF:StopArea:SP:463644:"
};

const STOP_POINTS = {
  rer: {
    name: "RER A Joinville-le-Pont",
    icon: "img/picto-rer-a.svg"
  },
  bus77: {
    name: "BUS 77 Hippodrome de Vincennes",
    icon: "img/picto-bus.svg"
  },
  bus201: {
    name: "BUS 201 Ecole du Breuil",
    icon: "img/picto-bus.svg"
  }
};

// ===================
//   UTILS
// ===================

function formatTime(d, withSec = false) {
  if (!d) return "-";
  let date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "-";
  const opts = withSec ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" };
  return date.toLocaleTimeString("fr-FR", opts);
}

function formatDateFr(d = new Date()) {
  return d.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ===================
//  MÉTÉO (Open-Meteo)
// ===================

async function fetchWeather() {
  const lat = 48.8327, lon = 2.4382;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=Europe%2FParis`;

  let html = `<div class='bloc-titre'><img src='img/picto-meteo.svg' class='icon-inline'>Météo</div>`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.current_weather) {
      const temp = Math.round(data.current_weather.temperature);
      const wind = Math.round(data.current_weather.windspeed);
      const code = data.current_weather.weathercode;
      const label = weatherCodeToString(code);
      const icon = `img/${code}.png`;

      html += `<div style="display:flex;align-items:center;gap:10px;">
                 <img src="${icon}" style="height:48px;" alt="${label}">
                 <div>
                   <div>🌡️ <b>${temp}°C</b></div>
                   <div>💨 ${wind} km/h</div>
                   <div>🌤️ ${label}</div>
                 </div>
               </div>`;
    } else {
      html += "<div>Météo indisponible</div>";
    }
  } catch (e) {
    html += "<div>Erreur météo</div>";
  }

  document.getElementById("weather-bloc").innerHTML = html;
}

function weatherCodeToString(code) {
  const mapping = {
    0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux", 3: "Couvert",
    45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine modérée",
    55: "Bruine dense", 56: "Bruine verglaçante légère", 57: "Bruine verglaçante dense",
    61: "Pluie faible", 63: "Pluie modérée", 65: "Pluie forte", 66: "Pluie verglaçante légère",
    67: "Pluie verglaçante forte", 71: "Neige faible", 73: "Neige modérée", 75: "Neige forte",
    77: "Grains de neige", 80: "Averses faibles", 81: "Averses modérées", 82: "Averses violentes",
    85: "Averses de neige faibles", 86: "Averses de neige fortes", 95: "Orage",
    96: "Orage avec grêle légère", 99: "Orage avec grêle forte"
  };
  return mapping[code] || "Inconnu";
}

// ===================
//  TRAFIC ROUTIER (Sytadin)
// ===================

async function updateTrafficBloc() {
  const container = document.getElementById("info-trafic-bloc");
  try {
    const res = await fetch("https://corsproxy.io/?https://www.sytadin.fr/sys/barreau_courbe_cms.php?type=N");
    const html = await res.text();
    const match = html.match(/globalEtat\":\"([^\"]+)\"/);
    const message = match ? match[1] : "État inconnu";

    container.innerHTML = `
      <div class='bloc-titre'><img src='img/picto-info.svg' class='icon-inline'>Info trafic routier autour de l’hippodrome</div>
      <div style="margin-top:10px">
        🚦 État global du trafic : <b>${message}</b>
      </div>
      <div style="margin-top:10px">
        <a href="https://www.sytadin.fr/" target="_blank" rel="noopener">
          <button style="padding:8px 16px;font-size:1em;">Voir carte Sytadin</button>
        </a>
      </div>`;
  } catch (e) {
    container.innerHTML = `
      <div class='bloc-titre'><img src='img/picto-info.svg' class='icon-inline'>Info trafic routier autour de l’hippodrome</div>
      <div style="margin-top:10px">⚠️ Données routières indisponibles.</div>`;
  }
}

// ===================
//  VÉLIB (statique)
// ===================

function updateVelibBloc(elementId, mechanical = 8, ebike = 2, free = 6) {
  document.getElementById(elementId).innerHTML = `
    <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
    🚲 Mécaniques : ${mechanical}<br>
    ⚡ Électriques : ${ebike}<br>
    🅿️ Places libres : ${free}
  `;
}

// ===================
//  TRANSPORTS (temps réel PRIM)
// ===================

async function fetchRealTime(monitoringRef) {
  try {
    const url = `${API_PROXY}/?url=${encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${monitoringRef}`
    )}`;
    const response = await fetch(url);
    const data = await response.json();
    return data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
  } catch (error) {
    console.error("Erreur fetch realtime", error);
    return [];
  }
}

async function getNextScheduledTime(monitoringRef) {
  try {
    const url = `${API_PROXY}/?url=${encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${monitoringRef}&PreviewInterval=PT12H`
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    return visits[0]?.MonitoredVehicleJourney?.MonitoredCall?.AimedDepartureTime || null;
  } catch {
    return null;
  }
}

async function renderDepartures(elementId, stopKey) {
  const visits = await fetchRealTime(STOP_AREAS[stopKey]);
  const now = new Date();

  if (!visits.length) {
    const nextStartTime = await getNextScheduledTime(STOP_AREAS[stopKey]);
    let message = "Aucun passage prévu actuellement";
    if (nextStartTime) {
      const nextDate = new Date(nextStartTime);
      const label = stopKey === "rer" ? "train" : "bus";
      message = (nextDate > now)
        ? `⏳ Service non commencé – premier ${label} prévu à ${formatTime(nextDate)}`
        : `✅ Service terminé – prochain ${label} demain à ${formatTime(nextDate)}`;
    }

    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='${STOP_POINTS[stopKey].icon}' class='icon-inline'>${STOP_POINTS[stopKey].name}</div>
      <ul><li>${message}</li></ul>
      <div class='schedule-extremes'>Aucun passage en cours</div>
    `;
    return;
  }

  const list = visits.slice(0, 4).map(v => {
    const t = v.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
    const dest = v.MonitoredVehicleJourney.DestinationName || "Terminus";
    return `<li>${formatTime(t)} → ${dest}</li>`;
  }).join("");

  const first = visits[0].MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
  const last = visits.at(-1).MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;

  document.getElementById(elementId).innerHTML = `
    <div class='title-line'><img src='${STOP_POINTS[stopKey].icon}' class='icon-inline'>${STOP_POINTS[stopKey].name}</div>
    <ul>${list}</ul>
    <div class='schedule-extremes'>
      Premier départ : ${formatTime(first)}<br>
      Dernier départ : ${formatTime(last)}
    </div>`;
}

// ===================
//  Rafraîchissement global
// ===================

function refreshAll() {
  document.getElementById("current-date").textContent = formatDateFr();
  document.getElementById("current-time").textContent = formatTime(new Date());
  fetchWeather();
  updateTrafficBloc();
  updateVelibBloc("velib-vincennes");
  updateVelibBloc("velib-breuil");
  renderDepartures("rer-content", "rer");
  renderDepartures("bus77-content", "bus77");
  renderDepartures("bus201-content", "bus201");
}

refreshAll();
setInterval(refreshAll, 60000);



// ===================
//  VÉLIB (dynamique)
// ===================

const VELIB_IDS = {
  "velib-vincennes": "1074333296",
  "velib-breuil": "508042092"
};

async function updateVelibBlocDynamic(elementId) {
  const infoURL = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_information.json";
  const statusURL = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json";

  try {
    const [infoRes, statusRes] = await Promise.all([fetch(infoURL), fetch(statusURL)]);
    const infoData = await infoRes.json();
    const statusData = await statusRes.json();

    const stationId = VELIB_IDS[elementId];
    const info = infoData.data.stations.find(s => s.station_id === stationId);
    const status = statusData.data.stations.find(s => s.station_id === stationId);

    if (!info || !status) throw new Error("Station non trouvée");

    const html = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>${info.name}</div>
      🚲 Mécaniques : ${status.num_bikes_available - status.num_ebikes_available}<br>
      ⚡ Électriques : ${status.num_ebikes_available}<br>
      🅿️ Places libres : ${status.num_docks_available}
    `;
    document.getElementById(elementId).innerHTML = html;
  } catch (e) {
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
      ❌ Erreur de chargement des données Vélib’
    `;
  }
}

// ===================
//  TRAFIC ROUTIER (Sytadin) AVEC COULEUR
// ===================

async function updateTrafficBloc() {
  const container = document.getElementById("info-trafic-bloc");
  try {
    const res = await fetch("https://corsproxy.io/?https://www.sytadin.fr/sys/barreau_courbe_cms.php?type=N");
    const html = await res.text();
    const match = html.match(/globalEtat\":\"([^\"]+)\"/);
    const message = match ? match[1] : "État inconnu";

    let color = "#888";
    if (/fluide/i.test(message)) color = "green";
    else if (/dense/i.test(message)) color = "orange";
    else if (/très dense|saturé/i.test(message)) color = "red";

    container.innerHTML = `
      <div class='bloc-titre'><img src='img/picto-info.svg' class='icon-inline'>Info trafic routier autour de l’hippodrome</div>
      <div style="margin-top:10px">
        <div style="padding:6px;border-left:10px solid ${color};">
        🚦 État global du trafic : <b>${message}</b></div>
      </div>
      <div style="margin-top:10px">
        <a href="https://www.sytadin.fr/" target="_blank" rel="noopener">
          <button style="padding:8px 16px;font-size:1em;">Voir carte Sytadin</button>
        </a>
      </div>`;
  } catch (e) {
    container.innerHTML = `
      <div class='bloc-titre'><img src='img/picto-info.svg' class='icon-inline'>Info trafic routier autour de l’hippodrome</div>
      <div style="margin-top:10px">⚠️ Données routières indisponibles.</div>`;
  }
}

// ===================
//  Rafraîchissement global avec Vélib dynamique
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
