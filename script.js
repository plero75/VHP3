const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

const LINES = [
  { name: "RER A", monitoringRef: "STIF:StopArea:SP:43135:", lineRef: "STIF:Line::C01742:", elementId: "#rer-a", infoId: "#info-rer-a" },
  { name: "Bus 77", monitoringRef: "STIF:StopArea:SP:463641:", lineRef: "STIF:Line::C01789:", elementId: "#bus-77", infoId: "#info-bus-77" },
  { name: "Bus 201", monitoringRef: "STIF:StopArea:SP:463644:", lineRef: "STIF:Line::C01805:", elementId: "#bus-201", infoId: "#info-bus-201" }
];

function updateTimestamp(elementId) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.querySelector(elementId).insertAdjacentHTML('beforeend', `<div style="font-size:0.8em;">🕒 Mise à jour : ${time}</div>`);
}

function setLoading(elementId) {
  document.querySelector(elementId).innerHTML = "🔄 Chargement...";
}

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

async function fetchWithRetry(url, options = {}, retries = 1) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (retries > 0) {
      console.warn(`Retry ${url}`);
      return fetchWithRetry(url, options, retries - 1);
    } else {
      throw e;
    }
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
      const msg = hour < 5 || hour > 0 ? "🚫 Service terminé – prochain départ demain." : "Aucun passage disponible.";
      document.querySelector(line.elementId).innerHTML = msg;
      return;
    }
    let html = "<ul>";
    visits.slice(0, 4).forEach((v, i) => {
      const mvj = v.MonitoredVehicleJourney;
      const mc = mvj?.MonitoredCall;
      const isLast = i === visits.length - 1;
      const aimed = mc?.AimedDepartureTime, expected = mc?.ExpectedDepartureTime;

      const destination = mvj?.DestinationName?.[0]?.value || "Destination inconnue";
      const direction = mvj?.DirectionName?.[0]?.value || "";

      const tripLine = formatTrip(aimed, expected, isLast);

      html += `${tripLine}<br>🚩 <strong>${destination}</strong> ${direction}`;

      const onward = mvj.OnwardCalls?.OnwardCall;
      if (onward && onward.length > 0) {
        const stops = onward
          .map(o => o?.StopPointName?.[0]?.value)
          .filter(Boolean)
          .join(" ➔ ");
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

async function fetchPrimInfo(line) {
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line.lineRef}`;
  try {
    const data = await fetchWithRetry(url);
    const infos = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (infos.length) {
      const messages = infos.map(m => {
        const msg = m?.Content?.Message?.[0]?.value;
        return msg ? `⚠️ ${msg}` : "⚠️ Message vide";
      }).join("<br>");
      document.querySelector(line.infoId).innerHTML = messages;
    } else {
      document.querySelector(line.infoId).innerHTML = "✅ Pas de perturbation signalée.";
    }
  } catch (e) {
    console.error(e);
    document.querySelector(line.infoId).textContent = `Erreur info : ${e.message}`;
  }
}

async function fetchVelib(stationId, elementId) {
  setLoading(elementId);
  const url = `https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json`;
  try {
    const data = await fetchWithRetry(url);
    const station = data?.data?.stations?.find(s => s.station_id === stationId);
    if (station) {
      const types = station.num_bikes_available_types || [];
      let mec = 0, elec = 0;
      types.forEach(t => {
        if (t.vehicle_type_id === 1) mec = t.bikes_available;
        if (t.vehicle_type_id === 2) elec = t.bikes_available;
      });
      const total = station.num_bikes_available;
      const docks = station.num_docks_available;
      const html = `
        🚲 ${total} vélos disponibles :
        <img src="img/velibmec.png" alt="Mécaniques" style="height:20px;"> ${mec} &nbsp;
        <img src="img/velibelec.png" alt="Électriques" style="height:20px;"> ${elec} &nbsp;
        🅿️ ${docks} bornes libres
      `;
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

async function fetchWeather() {
  setLoading("#meteo");
  const url = `${CORS_PROXY}https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis`;
  try {
    const data = await fetchWithRetry(url);
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

async function fetchTrafficRoad() {
  setLoading("#trafic");
  const url = `${CORS_PROXY}https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=5&facet=route`;
  try {
    const data = await fetchWithRetry(url);
    const infos = data.records.map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`).join("<br>");
    document.querySelector("#trafic").innerHTML = infos || "✅ Trafic normal";
    updateTimestamp("#trafic");
  } catch (e) {
    console.error(e);
    document.querySelector("#trafic").textContent = `Erreur : ${e.message}`;
  }
}

async function updateLines() {
  await Promise.all(LINES.map(line => Promise.all([
    fetchPrimStop(line),
    fetchPrimInfo(line)
  ])));
}

async function updateMeteoTrafic() {
  await Promise.all([
    fetchWeather(),
    fetchTrafficRoad()
  ]);
}

async function updateVelib() {
  await Promise.all([
    fetchVelib("1074333296", "#velib-vincennes"),
    fetchVelib("1066333450", "#velib-breuil")
  ]);
}

// Exécution initiale et rafraîchissements différenciés
updateLines();
updateMeteoTrafic();
updateVelib();

setInterval(updateLines, 2 * 60 * 1000);
setInterval(updateVelib, 5 * 60 * 1000);
setInterval(updateMeteoTrafic, 15 * 60 * 1000);
