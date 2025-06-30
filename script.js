const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// --- Horloge ---
function updateDateTime() {
  const now = new Date();
  document.getElementById('datetime').textContent = now.toLocaleString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// --- Actus défilantes ---
let newsItems = [];
let currentNewsIndex = 0;

async function fetchNewsTicker(containerId) {
  const url = 'https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    newsItems = data.items || [];
    if (newsItems.length === 0) {
      document.getElementById(containerId).innerHTML = '✅ Aucun article';
      return;
    }
    currentNewsIndex = 0;
    showNewsItem(containerId);
  } catch (err) {
    document.getElementById(containerId).textContent = '❌ Erreur actus';
  }
}

function showNewsItem(containerId) {
  if (newsItems.length === 0) return;
  const item = newsItems[currentNewsIndex];
  const desc = item.description ? item.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/ +/g, ' ').trim() : '';
  const shortDesc = desc.length > 220 ? desc.slice(0,217).replace(/ [^ ]*$/, '') + "…" : desc;
  document.getElementById(containerId).innerHTML = `<div class="news-item">
    📰 <b>${item.title}</b>
    <div class="news-desc">${shortDesc}</div>
  </div>`;
  currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
  setTimeout(() => showNewsItem(containerId), 9000);
}

// --- Transports (RER/Bus) ---
function formatAttente(expected, now = new Date()) {
  const diffMs = expected - now;
  if (diffMs < 0) return "";
  if (diffMs < 90000) return '<span class="imminent">imminent</span>';
  const min = Math.floor(diffMs / 60000);
  return `dans ${min} min`;
}

const GARES_PARIS = [
  "Paris", "Châtelet", "Gare de Lyon", "Auber", "Nation", "Charles de Gaulle", "La Défense"
];

function highlightGare(station) {
  if (GARES_PARIS.some(kw => station.toLowerCase().includes(kw.toLowerCase())))
    return `<span class="gare-paris">${station}</span>`;
  return station;
}

async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    const now = new Date();
    if (visits.length === 0 ||
      !visits.some(v => new Date(v.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime) > now)
    ) {
      // Service terminé
      let prochain = null;
      for (const v of visits) {
        const expected = new Date(v.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime);
        if (expected > now) { prochain = expected; break; }
      }
      let msg = `<div class="aucun-passage">
        <span class="badge-termine">🚫 Service terminé</span><br>`;
      if (prochain) {
        msg += `<span class="prochain-passage">🕐 Prochain passage à <b>${prochain.toLocaleDateString('fr-FR', {weekday:'long', day:'2-digit', month:'long'})} ${prochain.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b></span>`;
      }
      msg += '</div>';
      container.innerHTML = msg;
      if (updateId) {
        const updateEl = document.getElementById(updateId);
        if (updateEl) updateEl.textContent = "Mise à jour : " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }
      return;
    }
    // Sinon, affichage normal
    const groups = {};
    visits.forEach(v => {
      const dest = v.MonitoredVehicleJourney.DestinationName?.[0]?.value || 'Inconnu';
      if (!groups[dest]) groups[dest] = [];
      groups[dest].push(v);
    });

    Object.entries(groups).forEach(([dest, group]) => {
      group.sort((a, b) => new Date(a.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime) - new Date(b.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime));
      const premier = group[0];
      const dernier = group[group.length - 1];
      container.innerHTML += `<div class="sens-block"><div class="sens-title">Vers <b>${dest}</b></div>`;
      group.forEach((v, idx) => {
        const mvj = v.MonitoredVehicleJourney;
        const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
        const attenteTxt = formatAttente(expected, now);
        const isDernier = v === dernier;
        const onward = mvj.OnwardCalls?.OnwardCall?.map(call => call.StopPointName?.[0]?.value).filter(Boolean) || [];
        const arretActuel = mvj.MonitoredCall.StopPointName?.[0]?.value || "";
        let startIdx = onward.findIndex(st => st.toLowerCase() === arretActuel.toLowerCase());
        let nextGares = (startIdx >= 0) ? onward.slice(startIdx + 1) : onward;
        let garesHtml = nextGares.length ?
          `<div class="gares-defile">` + nextGares.map(station => highlightGare(station)).join(' <span>|</span> ') + '</div>'
          : '';
        container.innerHTML += `
          <div class="passage-block">
            <strong>🕐 ${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong>
            <span> (${attenteTxt})</span>
            ${isDernier ? '<span class="dernier-train">DERNIER AVANT FIN SERVICE</span>' : ''}
            ${garesHtml}
          </div>
        `;
      });
      container.innerHTML += `<div class="premier-dernier">
        Premier départ : <b>${new Date(premier.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b> /
        Dernier départ : <b>${new Date(dernier.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b>
        </div></div>`;
    });

    if (updateId) {
      const updateEl = document.getElementById(updateId);
      if (updateEl) updateEl.textContent = "Mise à jour : " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  } catch (err) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur chargement passages';
  }
}

// --- Trafic (Bison Futé IDF, RSS) ---
async function fetchTraffic() {
  const url = 'https://api.rss2json.com/v1/api.json?rss_url=https://www.bison-fute.gouv.fr/donnees-cles/rss/idf.xml';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const summaryEl = document.getElementById('traffic-summary');
    summaryEl.innerHTML = '';
    if (!data.items || !data.items.length) {
      summaryEl.innerHTML = '✅ Trafic fluide';
    } else {
      data.items.slice(0, 2).forEach(item => {
        const txt = item.title + (item.description ? ' – ' + item.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ') : '');
        summaryEl.innerHTML += `<div class="traffic-incident">🚧 ${txt.slice(0,190)}${txt.length>190?'…':''}</div>`;
      });
    }
    document.getElementById('traffic-update').textContent = "Mise à jour : " + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch (err) {
    document.getElementById('traffic-summary').textContent = '❌ Erreur trafic';
  }
}

// --- Météo (avec icônes PNG météo/IMG) ---
async function fetchWeather() {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.423&current_weather=true');
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const w = (await response.json()).current_weather;
    document.getElementById('weather-summary').innerHTML =
      `${weatherIcon(w.weathercode)} 🌡 ${w.temperature}°C • 💨 ${w.windspeed} km/h`;
    document.getElementById('weather-update').textContent = "Mise à jour : " + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch (err) {
    document.getElementById('weather-summary').textContent = '❌ Erreur météo';
  }
}
function weatherIcon(code) {
  const knownCodes = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99];
  const file = knownCodes.includes(code) ? `${code}.png` : '0.png';
  return `<img src="img/${file}" class="weather-icon" alt="météo">`;
}

// --- Vélib (2 stations) ---
async function fetchVelibDirect(url, containerId) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const stations = await response.json();
    const s = stations[0];
    document.getElementById(containerId).innerHTML = `
      <div class="velib-block">
        📍 ${s.name}<br>
        🚲 ${s.numbikesavailable} mécaniques&nbsp;|&nbsp;🔌 ${s.ebike} électriques<br>
        🅿️ ${s.numdocksavailable} bornes
      </div>
    `;
    document.getElementById('velib-update').textContent = 'Mise à jour : ' + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch (err) {
    document.getElementById(containerId).innerHTML = '❌ Erreur Vélib’';
  }
}

// --- Refresh all ---
function refreshAll() {
  updateDateTime();
  fetchNewsTicker('news-ticker');
  fetchAndDisplay(
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:',
    'rer-a-passages', 'rer-a-update'
  );
  fetchAndDisplay(
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:',
    'bus-77-passages', 'bus-77-update'
  );
  fetchAndDisplay(
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:',
    'bus-201-passages', 'bus-201-update'
  );
  fetchTraffic();
  fetchWeather();
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FParis', 'velib-vincennes');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FParis', 'velib-breuil');
}
refreshAll();
setInterval(refreshAll, 60000);
