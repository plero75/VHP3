// ===================
//  GTFS CACHE MODULE
// ===================

const GTFS_CACHE_KEY = "gtfsCache";

function resetGTFSCache() {
  localStorage.removeItem(GTFS_CACHE_KEY);
  alert("Cache GTFS réinitialisé.");
}

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

// ===================
//  INFOS TRAFIC PRIM
// ===================

async function fetchTrafficAlerts(lineRef) {
  const url = \`https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=\${lineRef}\`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const messages = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    return messages.map(msg => msg?.Content?.Message?.[0]?.Value).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// ===================
//  AFFICHAGE TEMPS RÉEL + PERTURBATIONS
// ===================

async function renderDepartures(elementId, stopKey, lineRef, stopId) {
  const block = STOP_POINTS[stopKey];
  try {
    const res = await fetch(block.url);
    const data = await res.json();
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    let trafficInfo = await fetchTrafficAlerts(lineRef);
    let trafficHTML = trafficInfo.length
      ? "<div class='alert'>⚠️ " + trafficInfo.join("<br>") + "</div>"
      : "";

    if (!visits.length) {
      const gtfs = await loadGTFS(stopKey, stopId);
      const nextTime = gtfs?.first ? \`⏳ Reprise prévue à \${gtfs.first}\` : "Pas d'horaire théorique connu";
      const stopsList = gtfs?.stops?.join(" → ") || "";

      document.getElementById(elementId).innerHTML = \`
        <div class='title-line'><img src='\${block.icon}' class='icon-inline'>\${block.name}</div>
        <ul><li>✅ Service terminé — \${nextTime}</li></ul>
        <div class='stops-list'>🚏 \${stopsList}</div>\${trafficHTML}\`;
      return;
    }

    const items = visits.slice(0, 4).map(v => {
      const t = v.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
      const dest = v.MonitoredVehicleJourney.DestinationName;
      return \`<li>\${formatTime(t)} → \${dest}</li>\`;
    }).join("");

    const first = visits[0]?.MonitoredVehicleJourney?.MonitoredCall?.AimedDepartureTime;
    const last = visits.at(-1)?.MonitoredVehicleJourney?.MonitoredCall?.AimedDepartureTime;

    const gtfs = await loadGTFS(stopKey, stopId);
    const stopsList = gtfs?.stops?.join(" → ") || "";

    document.getElementById(elementId).innerHTML = \`
      <div class='title-line'><img src='\${block.icon}' class='icon-inline'>\${block.name}</div>
      <ul>\${items}</ul>
      \${last ? \`<div class='schedule-extremes'>Premier départ : \${formatTime(first)}<br>Dernier départ : \${formatTime(last)}</div>\` : ""}
      <div class='stops-list'>🚏 \${stopsList}</div>
      \${trafficHTML}
    \`;
  } catch (e) {
    document.getElementById(elementId).innerHTML = \`
      <div class='title-line'><img src='\${block.icon}' class='icon-inline'>\${block.name}</div>
      <ul><li>Erreur chargement des données</li></ul>\`;
  }
}
