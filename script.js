const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

async function fetchAndDisplay(url, containerId, updateId) {
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
    const directions = {};
    visits.forEach(v => {
      const mvj = v.MonitoredVehicleJourney;
      const dirName = mvj.DirectionName?.[0]?.value || "Sens inconnu";
      if (!directions[dirName]) directions[dirName] = [];
      directions[dirName].push(v);
    });

    for (const [dir, dirVisits] of Object.entries(directions)) {
      container.innerHTML += `
        <div class="direction-block">
          <h3 class="direction-title">➡️ ${dir}</h3>
          ${dirVisits.slice(0, 4).map(v => {
            const mvj = v.MonitoredVehicleJourney;
            const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
            const aimed = mvj.MonitoredCall.AimedDepartureTime ? new Date(mvj.MonitoredCall.AimedDepartureTime) : expected;
            const delayMin = Math.round((expected - aimed) / 60000);
            return `
              <div class="passage-block">
                ${delayMin > 0 ? `
                  <span style="text-decoration:line-through; color:#888;">${aimed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                  <strong style="color:yellow; margin-left:5px;">${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong>
                  <span style="color:#f66; margin-left:5px;">(+${delayMin} min)</span>
                ` : `
                  <strong>🕐 ${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong>
                `}
                ➔ ${mvj.DestinationName?.[0]?.value || 'N/A'}
              </div>`;
          }).join('')}
        </div>`;
    }

    const updateEl = document.getElementById(updateId);
    if (updateEl) updateEl.textContent = `Mise à jour : ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '❌ Erreur chargement passages';
  }
}

// Les autres fonctions de ton dashboard restent inchangées (fetchTrafficAlerts, fetchWeather, etc.)
// Tu peux continuer à utiliser refreshAll() comme avant.

function refreshAll() {
  fetchNewsTicker('news-ticker');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:', 'rer-a-passages', 'rer-a-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:', 'bus-77-passages', 'bus-77-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:', 'bus-201-passages', 'bus-201-update');
  fetchTrafficAlerts('STIF:Line::C01742:', 'rer-a-alerts');
  fetchTrafficAlerts('STIF:Line::C00777:', 'bus-77-alerts');
  fetchTrafficAlerts('STIF:Line::C00201:', 'bus-201-alerts');
  fetchWeather('weather-data');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FParis', 'velib-vincennes-data');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FParis', 'velib-breuil-data');
}

refreshAll();
setInterval(refreshAll, 60000);
