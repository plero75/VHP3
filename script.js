const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// Lignes à suivre
const LINES = [
  { name: "RER A", monitoringRef: "STIF:StopArea:SP:43135:", lineRef: "STIF:Line::C01742:", elementId: "#rer-a", infoId: "#info-rer-a" },
  { name: "Bus 77", monitoringRef: "STIF:StopArea:SP:463641:", lineRef: "STIF:Line::C01789:", elementId: "#bus-77", infoId: "#info-bus-77" },
  { name: "Bus 201", monitoringRef: "STIF:StopArea:SP:463644:", lineRef: "STIF:Line::C01805:", elementId: "#bus-201", infoId: "#info-bus-201" }
];

function setLoading(elementId) {
  document.querySelector(elementId).innerHTML = "🔄 Chargement...";
}

function updateTimestamp(elementId) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.querySelector(elementId).insertAdjacentHTML('beforeend', `<div style="font-size:0.8em;">🕒 Mise à jour : ${time}</div>`);
}

async function fetchWithRetry(url, options = {}, retries = 1) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (retries > 0) return fetchWithRetry(url, options, retries - 1);
    else throw e;
  }
}

// Horaires
function formatTrip(aimed, expected, isLast) {
  const aimedDate = aimed ? new Date(aimed) : null;
  const expectedDate = expected ? new Date(expected) : null;
  const now = new Date();
  const delay = aimedDate && expectedDate ? Math.round((expectedDate - aimedDate) / 60000) : 0;
  const timeLeft = expectedDate ? Math.round((expectedDate - now) / 60000) : null;
  if (timeLeft !== null) {
    const imminent = timeLeft <= 1.5 ? "🟢 imminent" : `⏳ dans ${timeLeft} min`;
    const delayStr = delay > 1 ? ` (retard +${delay} min)` : "";
    const lastStr = isLast ? " 🔴 Dernier passage" : "";
    return `<li>🕐 ${expectedDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} ${imminent}${delayStr}${lastStr}`;
  } else {
    return "<li>❌ Passage annulé ou inconnu";
  }
}

async function fetchPrimStop(line) {
  setLoading(line.elementId);
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${line.monitoringRef}&LineRef=${line.lineRef}`;
  try {
    const data = await fetchWithRetry(url);
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    if (!visits.length) {
      const hour = new Date().getHours();
      document.querySelector(line.elementId).innerHTML = (hour < 5 || hour > 0) ? "🚫 Service terminé – prochain départ demain." : "Aucun passage disponible.";
      return;
    }
    let html = "<ul>";
    visits.slice(0, 4).forEach((v, i) => {
      const mvj = v.MonitoredVehicleJourney, mc = mvj?.MonitoredCall;
      const tripLine = formatTrip(mc?.AimedDepartureTime, mc?.ExpectedDepartureTime, i === visits.length-1);
      const destination = mvj?.DestinationName?.[0]?.value || "Destination inconnue";
      const direction = mvj?.DirectionName?.[0]?.value || "";
      html += `${tripLine}<br>🚩 <strong>${destination}</strong> ${direction}`;
      const onward = mvj.OnwardCalls?.OnwardCall;
      if (onward?.length > 0) {
        const stops = onward.map(o => o?.StopPointName?.[0]?.value).filter(Boolean).join(" ➔ ");
        html += `<div style="font-size:0.85em; color:#555;">🛤️ ${stops}</div>`;
      }
      html += "</li>";
    });
    html += "</ul>";
    document.querySelector(line.elementId).innerHTML = html;
    updateTimestamp(line.elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(line.elementId).textContent = `Erreur : ${e.message}`;
  }
}

// Gestion quota perturbations
let generalMessageRequests = 0;
const GENERAL_MESSAGE_QUOTA = 20000;
const GENERAL_MESSAGE_THRESHOLD = GENERAL_MESSAGE_QUOTA * 0.8;
let perturbationInterval = 30 * 60 * 1000;
let perturbationIntervalId = null;

function startPerturbationInterval() {
  if (perturbationIntervalId) clearInterval(perturbationIntervalId);
  perturbationIntervalId = setInterval(updatePerturbations, perturbationInterval);
}

async function fetchPrimInfo(line) {
  generalMessageRequests++;
  if (generalMessageRequests >= GENERAL_MESSAGE_THRESHOLD && perturbationInterval < 2 * 60 * 60 * 1000) {
    document.querySelector("#alerts").innerHTML = "⚠️ Quota perturbations proche de la limite : mise à jour toutes les 2h.";
    perturbationInterval = 2 * 60 * 60 * 1000;
    startPerturbationInterval();
  }
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line.lineRef}`;
  try {
    const data = await fetchWithRetry(url);
    const infos = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    const messages = infos.map(m => m?.Content?.Message?.[0]?.value).filter(msg => msg).map(msg => `⚠️ ${msg}`).join("<br>");
    document.querySelector(line.infoId).innerHTML = messages || "✅ Pas de perturbation signalée.";
  } catch (e) {
    console.error(e);
    document.querySelector(line.infoId).textContent = `Erreur info : ${e.message}`;
  }
}

// Vélib’ via PRIM
async function fetchVelib(stationId, elementId) {
  setLoading(elementId);
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/velib/station_status.json`;
  try {
    const data = await fetchWithRetry(url);
    const station = data?.data?.stations?.find(s => s.station_id === stationId);
    if (station) {
      const types = station.num_bikes_available_types || [];
      let mec = 0, elec = 0;
      types.forEach(t => { if (t.vehicle_type_id === 1) mec = t.bikes_available; if (t.vehicle_type_id === 2) elec = t.bikes_available; });
      const html = `🚲 ${station.num_bikes_available} vélos : <img src="img/velibmec.png" alt="Mécaniques" style="height:20px;"> ${mec} &nbsp;<img src="img/velibelec.png" alt="Électriques" style="height:20px;"> ${elec} &nbsp;🅿️ ${station.num_docks_available} bornes libres`;
      document.querySelector(elementId).innerHTML = html;
    } else document.querySelector(elementId).innerHTML = "⚠️ Station Vélib introuvable ou indisponible.";
    updateTimestamp(elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

// Bandeau actualités RSS
async function fetchAndDisplayRSS(url, elementId) {
  setLoading(elementId);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);
    const html = items.map(item => `<li>${item.querySelector("title")?.textContent || "Sans titre"}</li>`).join("");
    document.querySelector(elementId).innerHTML = `<ul>${html}</ul>`;
    updateTimestamp(elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

// Fonctions d'update
async function updateLines() { await Promise.all(LINES.map(line => fetchPrimStop(line))); }
async function updatePerturbations() { await Promise.all(LINES.map(line => fetchPrimInfo(line))); }
async function updateVelib() {
  await Promise.all([
    fetchVelib("1074333296", "#velib-vincennes"),
    fetchVelib("1066333450", "#velib-breuil")
  ]);
}

// Exécution initiale
updateLines();
updateVelib();
updatePerturbations();
fetchAndDisplayRSS("https://ton-flux-rss.com/feed.xml", "#rss-news");
startPerturbationInterval();

// Rafraîchissements
setInterval(updateLines, 2 * 60 * 1000);
setInterval(updateVelib, 15 * 60 * 1000);
setInterval(fetchAndDisplayRSS, 60 * 60 * 1000, "https://ton-flux-rss.com/feed.xml", "#rss-news");
