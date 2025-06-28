const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// Définition des lignes RER et bus avec tes MonitoringRefs et LineRefs officiels
const LINES = [
  { name: "RER A", monitoringRef: "STIF:StopPoint:Q:43135:", lineRef: "STIF:Line::C01742:", elementId: "#rer-a", infoId: "#info-rer-a" },
  { name: "Bus 77", monitoringRef: "STIF:StopPoint:Q:463641:", lineRef: "STIF:Line::C01789:", elementId: "#bus-77", infoId: "#info-bus-77" },
  { name: "Bus 201", monitoringRef: "STIF:StopPoint:Q:463644:", lineRef: "STIF:Line::C01805:", elementId: "#bus-201", infoId: "#info-bus-201" }
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
async function fetchWeather() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();
    const temp = data.current.temperature_2m;
    const code = data.current.weathercode;
    const desc = {
      0:"Ciel clair",1:"Principalement clair",2:"Partiellement nuageux",3:"Couvert",45:"Brouillard",
      51:"Bruine",61:"Pluie légère",80:"Averses",95:"Orages"
    }[code] || "Inconnu";
    const iconSrc = `img/${code}.png`;
    document.querySelector("#meteo").innerHTML = `
      <img src="${iconSrc}" alt="Météo" style="height:48px;vertical-align:middle;margin-right:8px;">
      🌡 ${temp}°C, ${desc}
    `;
    updateTimestamp("#meteo");
  } catch (e) {
    console.error(e);
    document.querySelector("#meteo").textContent = `Erreur : ${e.message}`;
  }
}


// Horaires RER / Bus
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
      const aimed = mc?.AimedDepartureTime, expected = mc?.ExpectedDepartureTime;
      const now = new Date();
      const aimedDate = aimed ? new Date(aimed) : null;
      const expectedDate = expected ? new Date(expected) : null;
      const delay = aimedDate && expectedDate ? Math.round((expectedDate - aimedDate) / 60000) : 0;
      const timeLeft = expectedDate ? Math.round((expectedDate - now) / 60000) : null;
      const imminent = timeLeft !== null ? (timeLeft <= 1.5 ? "🟢 imminent" : `⏳ dans ${timeLeft} min`) : "";
      const delayStr = delay > 1 ? ` (retard +${delay} min)` : "";
      const lastStr = i === visits.length - 1 ? " 🔴 Dernier passage" : "";
      const destination = mvj?.DestinationName?.[0]?.value || "Destination inconnue";
      const direction = mvj?.DirectionName?.[0]?.value || "";
      html += `<li>🕐 ${expectedDate?.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} ${imminent}${delayStr}${lastStr}<br>🚩 <strong>${destination}</strong> ${direction}`;
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

// Perturbations (optionnel selon quota)
async function fetchPrimInfo(line) {
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line.lineRef}`;
  try {
    const data = await fetchWithRetry(url);
    const infos = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    const messages = infos.map(m => m?.Content?.Message?.[0]?.value).filter(msg => msg).map(msg => `⚠️ ${msg}`).join("<br>");
    document.querySelector(line.infoId).innerHTML = messages || "✅ Pas de perturbation signalée.";
  } catch (e) {
    console.error(e);
    document.querySelector(line.infoId).textContent = `Erreur : ${e.message}`;
  }
}
async function fetchAndDisplayRSS(url, elementId) {
  setLoading(elementId);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);
    const html = items.map(item => {
      const title = item.querySelector("title")?.textContent || "Sans titre";
      return `<li>${title}</li>`;
    }).join("");
    document.querySelector(elementId).innerHTML = `<ul>${html}</ul>`;
    updateTimestamp(elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

// Premier chargement RSS Franceinfo
fetchAndDisplayRSS("https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://www.francetvinfo.fr/titres.rss", "#rss-news");

// Rafraîchissement toutes les heures
setInterval(() => {
fetchAndDisplayRSS("https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://www.francetvinfo.fr/titres.rss", "#rss-news");
}, 60 * 60 * 1000);

// Vélib'
 
async function fetchVelib(stationId, elementId) {
  setLoading(elementId);
  const url = "https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();

    const station = data?.data?.stations?.find(s => String(s.station_id) === String(stationId));
    if (station) {
      const types = station.num_bikes_available_types || [];
      let mec = 0, elec = 0;

      types.forEach(typeObj => {
        if (typeObj.mechanical !== undefined) mec = typeObj.mechanical;
        if (typeObj.ebike !== undefined) elec = typeObj.ebike;
      });

      const total = station.num_bikes_available;
      const docks = station.num_docks_available;
      const html = `🚲 ${total} vélos :
        <img src="img/velibmec.png" alt="Mécaniques" style="height:20px;"> ${mec} &nbsp;
        <img src="img/velibelec.png" alt="Électriques" style="height:20px;"> ${elec} &nbsp;
        🅿️ ${docks} bornes libres`;
      document.querySelector(elementId).innerHTML = html;
    } else {
      document.querySelector(elementId).innerHTML = "⚠️ Station Vélib introuvable ou indisponible.";
    }
    updateTimestamp(elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}


// Mises à jour globales
async function updateLines() { await Promise.all(LINES.map(line => fetchPrimStop(line))); }
async function updatePerturbations() { await Promise.all(LINES.map(line => fetchPrimInfo(line))); }
async function updateVelib() {
  await Promise.all([
    fetchVelib("1074333296", "#velib-vincennes"),
    fetchVelib("508042092", "#velib-breuil")
  ]);
}

// Premier chargement
updateLines();
updatePerturbations();
updateVelib();

// Rafraîchissements périodiques
setInterval(updateLines, 2 * 60 * 1000);
setInterval(updateVelib, 15 * 60 * 1000);
setInterval(updatePerturbations, 30 * 60 * 1000);
fetchWeather();
setInterval(fetchWeather, 15 * 60 * 1000);
