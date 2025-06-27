console.log("🔎 Début du script");

const API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace";

console.log("📍 Configuration des identifiants d'arrêts et lignes");

const STOP_IDS = {
  rer_joinville: "STIF:StopPoint:Q:39406:",
  bus77_hippo: "STIF:StopPoint:Q:463640:",
  bus201_breuil: "STIF:StopPoint:Q:463646:"
};

const LINE_REFS = {
  rer_a: "STIF:Line::C01742:",
  bus77: "STIF:Line::C01789:",
  bus201: "STIF:Line::C01805:"
};

const VELIB_IDS = {
  vincennes: "1074333296"
};

async function fetchPrimStop(monitoringRef, lineRef) {
  console.log(`➡️ fetchPrimStop: monitoringRef=${monitoringRef}, lineRef=${lineRef}`);
  const url = `${API_PROXY_URL}/stop-monitoring?MonitoringRef=${monitoringRef}&LineRef=${lineRef}`;
  const res = await fetch(url);
  console.log("📝 [PRIM] Response status:", res.status);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors de la requête PRIM.`);
  return await res.json();
}

function parseTrips(json, expectedLineRef) {
  console.log("🔍 Parsing trips pour la ligne:", expectedLineRef);
  const visits = json?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
  const trips = visits.filter(v => v.MonitoredVehicleJourney?.LineRef?.value === expectedLineRef)
    .map(v => ({
      aimed: v.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime,
      expected: v.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime,
      direction: v.MonitoredVehicleJourney.DirectionName?.[0]?.value || "Direction inconnue"
    }));
  console.log("📝 Nombre de passages trouvés:", trips.length);
  trips.length ? trips.slice(0, 4).forEach(trip => console.log(formatTrip(trip))) : console.log("❌ Aucun passage disponible pour la ligne demandée.");
}

function formatTrip(trip) {
  const aimed = aimedTime(trip.aimed), expected = aimedTime(trip.expected), now = new Date();
  const timeLeft = Math.round((expected - now) / 60000), delay = aimed && expected ? Math.round((expected - aimed) / 60000) : 0;
  const aimedStr = aimed ? aimed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : "—", expectedStr = expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const delayStr = delay > 1 ? ` (retard +${delay} min)` : "", imminent = timeLeft <= 1.5 ? "🟢 imminent" : `⏳ dans ${timeLeft} min`;
  console.log(`📝 formatTrip: aimed=${trip.aimed}, expected=${trip.expected}, direction=${trip.direction}`);
  return `🕐 ${aimedStr} → ${expectedStr} ${imminent}${delayStr}\nDirection ${trip.direction}`;
}

const aimedTime = iso => iso ? new Date(iso) : null;

async function fetchWeather() {
  console.log("➡️ fetchWeather");
  const url = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis";
  const res = await fetch(url);
  console.log("📝 [Météo] Response status:", res.status);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors de la requête météo.`);
  const data = await res.json();
  console.log(`🌡 Température: ${data.current.temperature_2m}°C, Code météo: ${data.current.weathercode}`);
  console.log(`🌡 Description: ${weatherDescription(data.current.weathercode)}`);
}

const weatherDescription = code => ({0:"Ciel clair",1:"Principalement clair",2:"Partiellement nuageux",3:"Couvert",45:"Brouillard",51:"Bruine",61:"Pluie légère",80:"Averses",95:"Orages"}[code] || "Inconnu");

async function fetchTrafficRoad() {
  console.log("➡️ fetchTrafficRoad");
  const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=5&facet=route";
  const res = await fetch(url);
  console.log("📝 [Trafic routier] Response status:", res.status);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors de la requête trafic.`);
  const data = await res.json();
  console.log("📝 Nombre d'entrées trafic:", data.records.length);
  console.log(data.records.map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`).join("\n") || "✅ Trafic normal");
}

async function fetchVelib(stationId) {
  console.log("➡️ fetchVelib stationId:", stationId);
  const url = "https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json";
  const res = await fetch(url);
  console.log("📝 [Vélib] Response status:", res.status);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors de la requête Vélib.`);
  const data = await res.json();
  const station = data?.data?.stations?.find(s => s.station_id === stationId);
  console.log("📝 Station trouvée:", !!station);
  station ? console.log(`🚲 ${station.num_bikes_available} vélos - 🅿️ ${station.num_docks_available} bornes`) : console.log("⚠️ Station Vélib introuvable ou indisponible.");
}

async function main() {
  console.log("🚦 Début de la fonction main");
  try {
    const [dataRer, data77, data201] = await Promise.all([
      fetchPrimStop(STOP_IDS.rer_joinville, LINE_REFS.rer_a),
      fetchPrimStop(STOP_IDS.bus77_hippo, LINE_REFS.bus77),
      fetchPrimStop(STOP_IDS.bus201_breuil, LINE_REFS.bus201)
    ]);

    console.log("🚆 RER A – Joinville-le-Pont");
    parseTrips(dataRer, LINE_REFS.rer_a);

    console.log("\n🚌 Bus 77 – Hippodrome");
    parseTrips(data77, LINE_REFS.bus77);

    console.log("\n🚌 Bus 201 – Breuil");
    parseTrips(data201, LINE_REFS.bus201);

    await Promise.all([fetchWeather(), fetchTrafficRoad(), fetchVelib(VELIB_IDS.vincennes)]);

  } catch (e) {
    console.error("🚨 Erreur inattendue :", e);
  }
}

main();
