
const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

function updateDateTime() {
  const now = new Date();
  document.getElementById('datetime').textContent = now.toLocaleString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function fetchWeather(containerId = 'weather-info') {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.423&current_weather=true');
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const w = (await response.json()).current_weather;
    document.getElementById(containerId).innerHTML = `🌡 ${w.temperature}°C • 💨 ${w.windspeed} km/h • ☁️ Code: ${w.weathercode}`;
  } catch (err) { console.error(err); document.getElementById(containerId).innerHTML = '❌ Erreur météo'; }
}


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
    console.error(err);
    document.getElementById(containerId).textContent = '❌ Erreur actus';
  }
}

function showNewsItem(containerId) {
  if (newsItems.length === 0) return;
  const item = newsItems[currentNewsIndex];
  // Titre + description coupée (max 200c)
  const desc = item.description ? item.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/ +/g, ' ').trim() : '';
  const shortDesc = desc.length > 200 ? desc.slice(0,197).replace(/ [^ ]*$/, '') + "…" : desc;
  document.getElementById(containerId).innerHTML = `<div class="news-item">
    📰 <b>${item.title}</b>
    <div class="news-desc">${shortDesc}</div>
  </div>`;
  currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
  setTimeout(() => showNewsItem(containerId), 7000); // une actu toutes les 7 sec
}

function showNewsItem(containerId) {
  if (newsItems.length === 0) return;
  const item = newsItems[currentNewsIndex];
  document.getElementById(containerId).innerHTML = `<div class="news-item">📰 ${item.title}</div>`;
  currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
  setTimeout(() => showNewsItem(containerId), 4000); // change toutes les 4 sec
}

// -- Partie passages :


function formatAttente(expected, now = new Date()) {
  const diffMs = expected - now;
  if (diffMs < 0) return ""; // passé
  if (diffMs < 90000) return '<span class="imminent">imminent</span>';
  const min = Math.floor(diffMs / 60000);
  return `dans ${min} min`;
}

const GARES_PARIS = [
  "Paris", "Châtelet", "Gare de Lyon", "Auber", "Nation", "Charles de Gaulle", "La Défense"
];


function highlightGare(station, actuelle) {
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
    if (visits.length === 0) { container.innerHTML = '🛑 Aucun passage'; return; }

    // Regrouper par destination
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
        const attenteTxt = formatAttente(expected, new Date());
        const isDernier = v === dernier;

        // Gares desservies à venir : à partir de l'arrêt actuel (non inclus)
        const onward = mvj.OnwardCalls?.OnwardCall?.map(call => call.StopPointName?.[0]?.value).filter(Boolean) || [];
        const arretActuel = mvj.MonitoredCall.StopPointName?.[0]?.value || "";
        let startIdx = onward.findIndex(st => st.toLowerCase() === arretActuel.toLowerCase());
        let nextGares = (startIdx >= 0) ? onward.slice(startIdx + 1) : onward;
        let garesHtml = nextGares.length ?
          `<div class="gares-defile">` + nextGares.map(station => highlightGare(station, arretActuel)).join(' <span>|</span> ') + '</div>'
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
      if (updateEl) updateEl.textContent = "Mise à jour : " + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur chargement passages';
  }
}

async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    if (visits.length === 0) { container.innerHTML = '🛑 Aucun passage'; return; }

    // Regrouper par destination
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
        const attenteTxt = formatAttente(expected, new Date());
        const isDernier = v === dernier;

        // Gares desservies sur ce voyage :
        const onward = mvj.OnwardCalls?.OnwardCall?.map(call => call.StopPointName?.[0]?.value).filter(Boolean) || [];
        const arretActuel = mvj.MonitoredCall.StopPointName?.[0]?.value || "";
        let garesHtml = onward.length ?
          `<div class="gares-defile">` + onward.map(station => highlightGare(station, arretActuel)).join(' <span>|</span> ') + '</div>'
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
      if (updateEl) updateEl.textContent = "Mise à jour : " + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur chargement passages';
  }
}

async function fetchAndDisplay(url, containerId, updateId, premierId, dernierId, garesId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    if (!container) return console.warn(`Container '${containerId}' manquant`);
    container.innerHTML = '';

    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    if (visits.length === 0) { container.innerHTML = '🛑 Aucun passage'; return; }

    const now = new Date();
    visits.slice(0, 5).forEach(v => {
      const mvj = v.MonitoredVehicleJourney;
      const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
      const aimed = mvj.MonitoredCall.AimedDepartureTime ? new Date(mvj.MonitoredCall.AimedDepartureTime) : expected;
      const attenteTxt = formatAttente(expected, now);
      container.innerHTML += `<div class="passage-block">
        <strong>🕐 ${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong>
        <span> (${attenteTxt})</span>
        ➔ ${mvj.DestinationName?.[0]?.value || 'N/A'}
      </div>`;
    });

    if (updateId) {
      const updateEl = document.getElementById(updateId);
      if (updateEl) updateEl.textContent = `Mise à jour : ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    }
    // Premier/dernier horaires (exemple statique pour RER A)
    if (premierId) {
      const premierEl = document.getElementById(premierId);
      if (premierEl) premierEl.innerHTML = 'Premier départ : <strong>' + (RER_A_HORAIRES[0] || '--:--') + '</strong>';
    }
    if (dernierId) {
      const dernierEl = document.getElementById(dernierId);
      if (dernierEl) dernierEl.innerHTML = 'Dernier départ : <strong>' + (RER_A_HORAIRES[RER_A_HORAIRES.length-1] || '--:--') + '</strong>';
    }
    if (garesId) {
      const ul = document.getElementById(garesId);
      if (ul) ul.innerHTML = RER_A_GARES.map(station => `<li>${station}</li>`).join('');
    }
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur chargement passages';
  }
}

async function fetchTrafficAlerts(lineRef, containerId) {
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(lineRef)}`;
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const messages = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (messages.length === 0) { container.innerHTML = '✅ Aucun incident'; return; }
    messages.forEach(m => {
      const text = m.InfoMessageText?.[0]?.MessageText?.trim();
      if (text) container.innerHTML += `<div class="alert">⚠️ ${text}</div>`;
    });
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur alertes';
  }
}

async function fetchVelibDirect(url, containerId) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const stations = await response.json();
    const s = stations[0];
    document.getElementById(containerId).innerHTML = `📍 ${s.name}<br>🚲 ${s.numbikesavailable} mécaniques<br>🔌 ${s.ebike} électriques<br>🅿️ ${s.numdocksavailable} bornes`;
  // Ajout heure de mise à jour
  const now = new Date();
  if(containerId === 'velib-vincennes-data') {
    document.getElementById('velib-vincennes-update').textContent = 'Mise à jour : ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  if(containerId === 'velib-breuil-data') {
    document.getElementById('velib-breuil-update').textContent = 'Mise à jour : ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  } catch (err) { console.error(err); document.getElementById(containerId).innerHTML = '❌ Erreur Vélib’'; }
}

function refreshAll() {
  updateDateTime();
  fetchWeather();
  fetchNewsTicker('news-ticker');
  fetchAndDisplay(
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:',
    'rer-a-passages', 'rer-a-update', 'rer-a-premier', 'rer-a-dernier', 'rer-a-gares'
  );
  fetchAndDisplay(
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:',
    'bus-77-passages', 'bus-77-update', 'bus-77-premier', 'bus-77-dernier'
  );
  fetchAndDisplay(
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:',
    'bus-201-passages', 'bus-201-update', 'bus-201-premier', 'bus-201-dernier'
  );
  fetchTrafficAlerts('STIF:Line::C01742:', 'rer-a-alerts');
  fetchTrafficAlerts('STIF:Line::C00777:', 'bus-77-alerts');
  fetchTrafficAlerts('STIF:Line::C00201:', 'bus-201-alerts');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FParis', 'velib-vincennes-data');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FParis', 'velib-breuil-data');
}

refreshAll();
setInterval(refreshAll, 60000);
