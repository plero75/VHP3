const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// --- BANDEAU ACTU ---
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
  const desc = item.description ? item.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/ +/g, ' ').trim() : '';
  const shortDesc = desc.length > 200 ? desc.slice(0,197).replace(/ [^ ]*$/, '') + "…" : desc;
  document.getElementById(containerId).innerHTML = `<div class="news-item">
    📰 <b>${item.title}</b>
    <div class="news-desc">${shortDesc}</div>
  </div>`;
  currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
  setTimeout(() => showNewsItem(containerId), 7000);
}

// --- TRANSPORT DYNAMIQUE ---
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

function highlightGare(station) {
  if (GARES_PARIS.some(kw => station.toLowerCase().includes(kw.toLowerCase())))
    return `<span class="gare-paris">${station}</span>`;
  return station;
}

async function fetchAndDisplay(url, containerId, updateId, debugId) {
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

        // Prochaines gares (après arrêt actuel)
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
      if (updateEl) updateEl.textContent = "Mise à jour : " + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    if (debugId) {
      const debugEl = document.getElementById(debugId);
      if (debugEl) debugEl.innerText = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur chargement passages';
  }
}

// --- INIT ---
fetchNewsTicker('news-ticker');
fetchAndDisplay(
  'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:',
  'rer-a-passages', 'rer-a-update', 'rer-a-debug'
);
fetchAndDisplay(
  'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:',
  'bus-77-passages', 'bus-77-update', 'bus-77-debug'
);
fetchAndDisplay(
  'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:',
  'bus-201-passages', 'bus-201-update', 'bus-201-debug'
);
// (pas de refreshAll auto dans la version debug - ajoute-le si besoin !)
