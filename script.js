const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();

    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    if (visits.length === 0) {
      container.innerHTML = '<p>🛑 Aucun passage prévu</p>';
    } else {
      visits.slice(0, 4).forEach(v => {
        const mvj = v.MonitoredVehicleJourney;
        const aimed = new Date(mvj.MonitoredCall.AimedDepartureTime);
        const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
        const delay = Math.round((expected - aimed) / 60000);
        const now = new Date();
        const timeLeft = Math.round((expected - now) / 60000);

        let status = '';
        if (mvj.MonitoredCall.DepartureStatus === 'cancelled') {
          status = '❌ Supprimé';
        } else if (timeLeft <= 1) {
          status = '🟢 Imminent';
        } else if (delay > 0) {
          status = `⚠️ +${delay} min`;
        }

        container.innerHTML += `
          <div class="passage">
            <strong>🕐 ${expected.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong>
            <span> (dans ${timeLeft} min) ${status}</span>
          </div>
        `;
      });
    }
    document.getElementById(updateId).textContent = `Mise à jour : ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  } catch (error) {
    console.error(error);
    document.getElementById(containerId).innerHTML = '<p>❌ Erreur de chargement</p>';
  }
}

async function fetchTrafficAlerts(lineRef, containerId) {
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(lineRef)}`;
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();

    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const messages = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (messages.length === 0) {
      container.innerHTML = '<p>✅ Aucun incident signalé.</p>';
    } else {
      messages.forEach(m => {
        container.innerHTML += `
          <div class="alert">
            <p>⚠️ <strong>${m.InfoMessageIdentifier}</strong></p>
            <p>${m.InfoChannelRef}: ${m.InfoMessageText?.[0]?.MessageText || 'Message indisponible'}</p>
          </div>
        `;
      });
    }
  } catch (error) {
    console.error(error);
    document.getElementById(containerId).innerHTML = '<p>❌ Erreur infos trafic</p>';
  }
}

const firstLastTimes = {
  "rer-a": { first: "05:15", last: "00:32" },
  "bus-77": { first: "06:05", last: "22:45" },
  "bus-201": { first: "06:15", last: "21:55" }
};

function displayFirstLast(containerId, lineKey) {
  const container = document.getElementById(containerId);
  const times = firstLastTimes[lineKey];
  container.innerHTML = `
    <p>🕓 Premier passage : ${times.first}</p>
    <p>🌙 Dernier passage : ${times.last}</p>
  `;
}

const stops = {
  "rer-a": ["Nation", "Vincennes", "Fontenay-sous-Bois", "Joinville-le-Pont", "Nogent-sur-Marne"],
  "bus-77": ["Hippodrome de Vincennes", "Joinville-le-Pont RER"],
  "bus-201": ["Pyramide / École du Breuil", "Charenton - Écoles"]
};

function displayStops(containerId, lineKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div class="stops">${stops[lineKey].map(s => `<span>${s}</span>`).join(" ➔ ")}</div>
  `;
}

async function fetchVelibDirect(url, containerId) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const stations = await response.json();
    const container = document.getElementById(containerId);

    if (!stations || stations.length === 0) {
      container.innerHTML = `<p>❌ Aucune donnée Vélib’</p>`;
      return;
    }

    const s = stations[0];
    container.innerHTML = `
      <p>📍 ${s.name}</p>
      <p>🚲 Mécaniques : ${s.numbikesavailable}</p>
      <p>🔌 Électriques : ${s.ebike || 'N/A'}</p>
      <p>🅿️ Bornes libres : ${s.numdocksavailable}</p>
    `;
  } catch (error) {
    console.error(error);
    document.getElementById(containerId).innerHTML = '<p>❌ Erreur Vélib’</p>';
  }
}

function refreshAll() {
  // Passages temps réel
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:', 'rer-a-passages', 'rer-a-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:', 'bus-77-passages', 'bus-77-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:', 'bus-201-passages', 'bus-201-update');

  // Infos trafic
  fetchTrafficAlerts('STIF:Line::C01742:', 'rer-a-alerts');
  fetchTrafficAlerts('STIF:Line::C00777:', 'bus-77-alerts');
  fetchTrafficAlerts('STIF:Line::C00201:', 'bus-201-alerts');

  // Premier/dernier passage
  displayFirstLast('rer-a-firstlast', 'rer-a');
  displayFirstLast('bus-77-firstlast', 'bus-77');
  displayFirstLast('bus-201-firstlast', 'bus-201');

  // Liste des arrêts
  displayStops('rer-a-stops', 'rer-a');
  displayStops('bus-77-stops', 'bus-77');
  displayStops('bus-201-stops', 'bus-201');

  // Vélib'
  fetchVelibDirect(
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FBerlin',
    'velib-vincennes-data'
  );
  fetchVelibDirect(
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FBerlin',
    'velib-breuil-data'
  );
}

refreshAll();
setInterval(refreshAll, 60000);
