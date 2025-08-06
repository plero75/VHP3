// === CONFIGURATION GLOBALE ===
const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const MONITORING_REFS = [
  { id: "STIF:StopArea:SP:43135:", container: "rer-a-passages", update: "rer-a-update" },
  { id: "STIF:StopArea:SP:463641:", container: "bus-77-passages", update: "bus-77-update" },
  { id: "STIF:StopArea:SP:463644:", container: "bus-201-passages", update: "bus-201-update" },
];

// === HORLOGE ===
function updateDateTime() {
  const now = new Date();
  document.getElementById('datetime').textContent = now.toLocaleString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// === MÉTÉO ===
async function fetchWeather() {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.423&current_weather=true");
    const data = await res.json();
    const w = data.current_weather;
    document.getElementById("weather-summary").innerHTML = getWeatherIcon(w.weathercode) +
      `🌡 ${w.temperature}°C &nbsp;&nbsp;💨 ${w.windspeed} km/h &nbsp;&nbsp;(${w.weathercode})`;
    document.getElementById("weather-update").textContent = "Mise à jour : " + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch {
    document.getElementById("weather-summary").textContent = "❌ Erreur météo";
  }
}

function getWeatherIcon(code) {
  if (code < 3) return "☀️";
  if (code < 45) return "⛅";
  if (code < 60) return "🌧️";
  if (code < 80) return "⛈️";
  return "❓";
}

// === VELIB ===
async function fetchVelibDirect(url, containerId) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    const s = data[0];
    document.getElementById(containerId).innerHTML = `
      <div class="velib-block">
        📍 ${s.name}<br>
        🚲 ${s.numbikesavailable} mécaniques&nbsp;|&nbsp;🔌 ${s.ebike} électriques<br>
        🅿️ ${s.numdocksavailable} bornes
      </div>`;
    document.getElementById('velib-update').textContent = 'Mise à jour : ' + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch {
    document.getElementById(containerId).textContent = "❌ Erreur Vélib’";
  }
}

// === ACTUS FRANCE INFO ===
let newsItems = [], currentNewsIndex = 0;

async function fetchNewsTicker(containerId) {
  const url = 'https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss';
  try {
    const res = await fetch(url);
    const data = await res.json();
    newsItems = data.items || [];
    currentNewsIndex = 0;
    showNewsItem(containerId);
  } catch {
    document.getElementById(containerId).textContent = "❌ Erreur actus";
  }
}

function showNewsItem(containerId) {
  if (!newsItems.length) return;
  const item = newsItems[currentNewsIndex];
  const desc = item.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const shortDesc = desc.length > 220 ? desc.slice(0,217).replace(/ [^ ]*$/, '') + "…" : desc;
  document.getElementById(containerId).innerHTML = `<div class="news-item">
    📰 <b>${item.title}</b><div class="news-desc">${shortDesc}</div></div>`;
  currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
  setTimeout(() => showNewsItem(containerId), 9000);
}

// === TRANSPORT (PRIM STOP MONITORING) ===
async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(url));
    const data = await res.json();
    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    const now = new Date();
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!visits.length || !visits.some(v => new Date(v.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime) > now)) {
      container.innerHTML = `<div class="aucun-passage">🚫 Service terminé</div>`;
      return;
    }

    const groups = {};
    visits.forEach(v => {
      const dest = v.MonitoredVehicleJourney.DestinationName?.[0]?.value || "Inconnu";
      groups[dest] = groups[dest] || [];
      groups[dest].push(v);
    });

    for (const [dest, group] of Object.entries(groups)) {
      group.sort((a, b) => new Date(a.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime) - new Date(b.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime));
      container.innerHTML += `<div class="sens-block"><div class="sens-title">Vers <b>${dest}</b></div>`;
      group.forEach((v, idx) => {
        const mvj = v.MonitoredVehicleJourney;
        const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
        const attente = formatAttente(expected, now);
        const isLast = idx === group.length - 1;
        container.innerHTML += `
          <div class="passage-block">
            🕐 ${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            (${attente}) ${isLast ? '<span class="dernier-train">Dernier départ</span>' : ''}
          </div>`;
      });
      container.innerHTML += `</div>`;
    }

    if (updateId) document.getElementById(updateId).textContent = "Mise à jour : " + now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

  } catch {
    document.getElementById(containerId).textContent = "❌ Erreur chargement passages";
  }
}

// === UTILS ===
function formatAttente(expected, now) {
  const diff = Math.round((expected - now) / 60000);
  if (diff < 0) return "passé";
  if (diff < 2) return "🟢 imminent";
  return `⏳ dans ${diff} min`;
}

// === MONITORING REF CHECK (1 seule fois) ===
let monitoringRefsChecked = false;

async function checkMonitoringRefsOnce() {
  if (monitoringRefsChecked) return;
  monitoringRefsChecked = true;
  try {
    const url = CORS_PROXY + encodeURIComponent('https://prim.iledefrance-mobilites.fr/marketplace/referentiel/stop-areas');
    const res = await fetch(url);
    const data = await res.json();
    const validRefs = data.stop_areas.map(sa => sa.StopAreaId);
    MONITORING_REFS.forEach(ref => {
      if (!validRefs.includes(ref.id)) {
        console.warn(`❗ Identifiant non valide : ${ref.id}`);
        document.getElementById(ref.container).innerHTML = "❌ Identifiant non valide";
      }
    });
  } catch {
    console.error("❌ Erreur vérification MonitoringRef");
  }
}

// === INITIALISATION ===
document.addEventListener("DOMContentLoaded", () => {
  updateDateTime();
  setInterval(updateDateTime, 60 * 1000);

  fetchWeather();
  fetchVelibDirect("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FParis", "velib-vincennes");
  fetchVelibDirect("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FParis", "velib-breuil");

  fetchNewsTicker("newsTicker");

  checkMonitoringRefsOnce();
  MONITORING_REFS.forEach(ref => {
    fetchAndDisplay(`https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${ref.id}`, ref.container, ref.update);
  });
});
