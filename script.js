const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTrip(aimed, expected) {
  const aimedDate = aimed ? new Date(aimed) : null;
  const expectedDate = expected ? new Date(expected) : null;
  const now = new Date();
  const delay = aimedDate && expectedDate ? Math.round((expectedDate - aimedDate) / 60000) : 0;
  const timeLeft = expectedDate ? Math.round((expectedDate - now) / 60000) : null;
  if (timeLeft !== null) {
    const imminent = timeLeft <= 1.5 ? "🟢 imminent" : `⏳ dans ${timeLeft} min`;
    const delayStr = delay > 1 ? ` (retard +${delay} min)` : "";
    return `${formatTime(aimed)} → ${formatTime(expected)} ${imminent}${delayStr}`;
  } else {
    return "❌ Passage annulé ou inconnu";
  }
}

async function fetchPrimStop(monitoringRef, lineRef, elementId) {
  const url = `${CORS_PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${monitoringRef}&LineRef=${lineRef}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    const trips = visits.slice(0, 4).map(v => {
      const mc = v.MonitoredVehicleJourney?.MonitoredCall;
      return formatTrip(mc?.AimedDepartureTime, mc?.ExpectedDepartureTime);
    });
    document.querySelector(elementId).innerHTML = trips.length ? trips.join("<br>") : "Aucun passage disponible.";
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

async function fetchWeather() {
  const url = `${CORS_PROXY}https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();
    const temp = data.current.temperature_2m;
    const desc = {
      0:"Ciel clair",1:"Principalement clair",2:"Partiellement nuageux",3:"Couvert",45:"Brouillard",
      51:"Bruine",61:"Pluie légère",80:"Averses",95:"Orages"
    }[data.current.weathercode] || "Inconnu";
    document.querySelector("#meteo").textContent = `🌡 ${temp}°C, ${desc}`;
  } catch (e) {
    console.error(e);
    document.querySelector("#meteo").textContent = `Erreur : ${e.message}`;
  }
}

async function fetchTrafficRoad() {
  const url = `${CORS_PROXY}https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=5&facet=route`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();
    document.querySelector("#trafic").innerHTML = data.records.map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`).join("<br>") || "✅ Trafic normal";
  } catch (e) {
    console.error(e);
    document.querySelector("#trafic").textContent = `Erreur : ${e.message}`;
  }
}

async function fetchVelib(stationId, elementId) {
  const url = `${CORS_PROXY}https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const data = await res.json();
    const station = data?.data?.stations?.find(s => s.station_id === stationId);
    document.querySelector(elementId).textContent = station ?
      `🚲 ${station.num_bikes_available} vélos - 🅿️ ${station.num_docks_available} bornes` :
      "⚠️ Station Vélib introuvable ou indisponible.";
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

async function main() {
  await Promise.allSettled([
    fetchPrimStop("STIF:StopArea:SP:43135:", "STIF:Line::C01742:", "#rer-a"),
    fetchPrimStop("STIF:StopArea:SP:463641:", "STIF:Line::C01789:", "#bus-77"),
    fetchPrimStop("STIF:StopArea:SP:463644:", "STIF:Line::C01805:", "#bus-201"),
    fetchWeather(),
    fetchTrafficRoad(),
    fetchVelib("1074333296", "#velib-vincennes"),
    fetchVelib("1066333450", "#velib-breuil")
  ]);
}

// Exécution initiale et rafraîchissement périodique
main();
setInterval(main, 2*60*1000);
