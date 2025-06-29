const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) {
      console.error(`HTTP error ${response.status}`);
      const errorText = await response.text();
      console.error("Réponse brute:", errorText);
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = `<p>❌ Erreur HTTP ${response.status}</p>`;
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      const text = await response.text();
      console.error("Réponse non JSON:", text);
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = `<p>❌ Réponse invalide reçue du serveur</p>`;
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ID '${containerId}' introuvable dans le DOM`);
      return;
    }
    container.innerHTML = '';

    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    if (visits.length === 0) {
      container.innerHTML = '<p>🛑 Aucun passage temps réel.</p>';
      return;
    }

    const now = new Date();
    const directions = {};
    visits.forEach(v => {
      const mvj = v.MonitoredVehicleJourney;
      const dirName = mvj.DirectionName?.[0]?.value || "Sens inconnu";
      if (!directions[dirName]) directions[dirName] = [];
      directions[dirName].push(v);
    });

    container.innerHTML = '';
    for (const [dir, dirVisits] of Object.entries(directions)) {
      container.innerHTML += `<h3>${dir}</h3>`;
      const filtered = dirVisits.slice(0, 4);
      filtered.forEach(v => {
        const mvj = v.MonitoredVehicleJourney;
        const aimed = mvj.MonitoredCall.AimedDepartureTime ? new Date(mvj.MonitoredCall.AimedDepartureTime) : new Date(mvj.MonitoredCall.ExpectedDepartureTime);
        const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
        const delay = Math.round((expected - aimed) / 60000);
        const timeLeft = Math.round((expected - now) / 60000);

        let status = '';
        if (mvj.MonitoredCall.DepartureStatus === 'cancelled') status = '❌ Supprimé';
        else if (timeLeft <= 1) status = '🟢 Imminent';
        else if (delay > 0) status = `⚠️ +${delay} min`;

        container.innerHTML += `
          <div class="passage">
            <strong>🕐 ${expected.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong>
            <span> (dans ${timeLeft} min) ${status}</span>
          </div>
        `;
      });
    }

    const updateEl = document.getElementById(updateId);
    if (updateEl) updateEl.textContent = `Mise à jour : ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    else console.warn(`Update ID '${updateId}' introuvable dans le DOM`);

  } catch (error) {
    console.error("Erreur JS:", error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '<p>❌ Erreur de chargement</p>';
  }
}

async function fetchTrafficAlerts(lineRef, containerId) {
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(lineRef)}`;
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    let data;
    try {
      data = await response.json();
    } catch (err) {
      const text = await response.text();
      console.error("Réponse non-JSON:", text);
      throw new Error("Réponse invalide, impossible de parser le JSON");
    }

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ID '${containerId}' introuvable dans le DOM`);
      return;
    }
    container.innerHTML = '';

    const messages = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (messages.length === 0) {
      container.innerHTML = '<p>✅ Aucun incident signalé.</p>';
      return;
    }

    messages.forEach(m => {
      const text = m.InfoMessageText?.[0]?.MessageText?.trim();
      if (text) container.innerHTML += `<div class="alert"><p>⚠️ ${text}</p></div>`;
    });
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '<p>❌ Erreur infos trafic</p>';
  }
}

const stops = {
  "rer-a": ["Nation", "Vincennes", "Fontenay-sous-Bois", "Joinville-le-Pont", "Nogent-sur-Marne"],
  "bus-77": ["Hippodrome de Vincennes", "Joinville-le-Pont RER"],
  "bus-201": ["Pyramide / École du Breuil", "Charenton - Écoles"]
};

function displayStops(containerId, lineKey) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`Container ID '${containerId}' introuvable dans le DOM`);
    return;
  }
  container.innerHTML = `
    <div class="stops-scroll">
      ${stops[lineKey].map(s => `<span>${s}</span>`).join(" ➔ ")}
    </div>
  `;
}

function refreshAll() {
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:', 'rer-a-passages', 'rer-a-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:', 'bus-77-passages', 'bus-77-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:', 'bus-201-passages', 'bus-201-update');

  fetchTrafficAlerts('STIF:Line::C01742:', 'rer-a-alerts');
  fetchTrafficAlerts('STIF:Lin
