const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();

    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    // Déterminer stopId selon le containerId
    let stopId;
    if (containerId.includes('rer-a')) stopId = 'STIF:StopArea:SP:43135:';
    else if (containerId.includes('bus-77')) stopId = 'STIF:StopArea:SP:463641:';
    else if (containerId.includes('bus-201')) stopId = 'STIF:StopArea:SP:463644:';

    // ➔ Nouveau test pour fallback
    if (visits.length === 0) {
      container.innerHTML = '<p>🛑 Aucun passage temps réel, chargement des horaires théoriques...</p>';
      await displayFallbackSchedule(stopId, containerId);
      return; // Arrêter ici car pas de temps réel
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
        const aimed = new Date(mvj.MonitoredCall.AimedDepartureTime);
        const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
        const delay = Math.round((expected - aimed) / 60000);
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

    document.getElementById(updateId).textContent = `Mise à jour : ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
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
    messages.forEach(m => {
      const text = m.InfoMessageText?.[0]?.MessageText?.trim();
      if (text) {
        container.innerHTML += `<div class="alert"><p>⚠️ ${text}</p></div>`;
      }
    });
    if (container.innerHTML === '') {
      container.innerHTML = '<p>✅ Aucun incident signalé.</p>';
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
async function displayFallbackSchedule(stopId, containerId) {
  try {
    const response = await fetch("gtfs-fallback.json");
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const data = await response.json();

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const times = data
      .filter(entry => entry.stop_id === stopId)
      .map(entry => {
        const [h, m] = entry.departure_time.split(":").map(Number);
        return { time: entry.departure_time, minutes: h * 60 + m };
      })
      .filter(entry => entry.minutes >= nowMinutes);

    const container = document.getElementById(containerId);
    if (times.length > 0) {
      container.innerHTML += `<p>🕐 Prochain horaire théorique : ${times[0].time}</p>`;
    } else {
      container.innerHTML += `<p>🛑 Aucun horaire théorique disponible pour aujourd’hui</p>`;
    }
  } catch (err) {
    console.error(err);
    document.getElementById(containerId).innerHTML += `<p>❌ Erreur fallback théorique</p>`;
  }
}

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

async function fetchWeather(containerId) {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.423&current_weather=true');
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const w = (await response.json()).current_weather;
    document.getElementById(containerId).innerHTML = `
      <p>🌡 Température : ${w.temperature}°C</p>
      <p>💨 Vent : ${w.windspeed} km/h</p>
      <p>🌥 Conditions : ${w.weathercode}</p>
    `;
  } catch (error) {
    console.error(error);
    document.getElementById(containerId).innerHTML = '<p>❌ Erreur météo</p>';
  }
}

async function fetchTraffic(containerId) {
  try {
    const response = await fetch('https://www.data.gouv.fr/fr/datasets/r/0845c838-6f18-40c3-936f-da204107759a');
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const filtered = data.filter(r =>
      r.route && (r.route.includes('A86') || r.route.toLowerCase().includes('périphérique'))
    );

    if (filtered.length === 0) {
      container.innerHTML = '<p>✅ Circulation fluide sur A86 et périph.</p>';
    } else {
      filtered.forEach(r => {
        container.innerHTML += `
          <div class="passage">
            <p>🛣 <strong>${r.route}</strong></p>
            <p>🚦 État : ${r.etat_circulation || 'N/A'}</p>
            <p>📍 Localisation : ${r.localisation || 'Non précisée'}</p>
            ${r.nature_evenement ? `<p>⚠️ Événement : ${r.nature_evenement}</p>` : ''}
            ${r.description_evenement ? `<p>📝 Détails : ${r.description_evenement}</p>` : ''}
            <hr>
          </div>
        `;
      });
    }
  } catch (error) {
    console.error(error);
    document.getElementById(containerId).innerHTML = '<p>❌ Erreur trafic routier</p>';
  }
}

function refreshAll() {
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:', 'rer-a-passages', 'rer-a-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:', 'bus-77-passages', 'bus-77-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:', 'bus-201-passages', 'bus-201-update');

  fetchTrafficAlerts('STIF:Line::C01742:', 'rer-a-alerts');
  fetchTrafficAlerts('STIF:Line::C00777:', 'bus-77-alerts');
  fetchTrafficAlerts('STIF:Line::C00201:', 'bus-201-alerts');

  displayFirstLast('rer-a-firstlast', 'rer-a');
  displayFirstLast('bus-77-firstlast', 'bus-77');
  displayFirstLast('bus-201-firstlast', 'bus-201');

  displayStops('rer-a-stops', 'rer-a');
  displayStops('bus-77-stops', 'bus-77');
  displayStops('bus-201-stops', 'bus-201');

  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FBerlin', 'velib-vincennes-data');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FBerlin', 'velib-breuil-data');

  fetchWeather('weather-data');
  fetchTraffic('traffic-data');
}

refreshAll();
setInterval(refreshAll, 60000);
