const API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace";

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
  const url = `${API_PROXY_URL}/stop-monitoring?MonitoringRef=${monitoringRef}&LineRef=${lineRef}`;
  const res = await fetch(url);
  console.log("📝 [PRIM]", url, res.status);
  const data = await res.json();
  return data;
}

function parseTrips(json, expectedLineRef) {
  const visits = json?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
  const trips = visits.filter(v => v.MonitoredVehicleJourney?.LineRef?.value === expectedLineRef)
    .map(v => {
      const journey = v.MonitoredVehicleJourney;
      const call = journey.MonitoredCall;
      return {
        aimed: call.AimedDepartureTime,
        expected: call.ExpectedDepartureTime,
        direction: journey.DirectionName?.[0]?.value || "Direction inconnue"
      };
    });
  if (trips.length === 0) {
    console.log("❌ Aucun passage disponible pour la ligne demandée.");
  } else {
    trips.slice(0, 4).forEach(trip => console.log(formatTrip(trip)));
  }
}

function formatTrip(trip) {
  const aimed = aimedTime(trip.aimed);
  const expected = aimedTime(trip.expected);
  const now = new Date();
  const expectedDate = new Date(trip.expected);
  const timeLeft = Math.round((expectedDate - now) / 60000);
  const delay = aimed && expected ? Math.round((expectedDate - aimed) / 60000) : 0;
  const aimedStr = aimed ? aimed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : "—";
  const expectedStr = expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const delayStr = delay > 1 ? ` (retard +${delay} min)` : "";
  const imminent = timeLeft <= 1.5 ? "🟢 imminent" : `⏳ dans ${timeLeft} min`;
  return `🕐 ${aimedStr} → ${expectedStr} ${imminent}${delayStr}\nDirection ${trip.direction}`;
}

function aimedTime(iso) {
  return iso ? new Date(iso) : null;
}

async function fetchWeather() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis";
  const res = await fetch(url);
  console.log("📝 [Météo]", url, res.status);
  const data = await res.json();
  const temp = data.current.temperature_2m;
  const desc = weatherDescription(data.current.weathercode);
  console.log(`🌡 ${temp}°C, ${desc}`);
}

function weatherDescription(code) {
  const map = {
    0: "Ciel clair", 1: "Principalement clair", 2: "Partiellement nuageux",
    3: "Couvert", 45: "Brouillard", 51: "Bruine",
    61: "Pluie légère", 80: "Averses", 95: "Orages"
  };
  return map[code] || "Inconnu";
}

async function fetchTrafficRoad() {
  const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=5&facet=route";
  const res = await fetch(url);
  console.log("📝 [Trafic routier]", url, res.status);
  const data = await res.json();
  const infos = data.records.map(r => `🛣 ${r.fields.route} : ${r.fields.etat_circulation}`);
  console.log(infos.join("\n") || "✅ Trafic normal");
}

async function fetchVelib(stationId) {
  const url = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json";
  const res = await fetch(url);
  console.log("📝 [Vélib]", url, res.status);
  const data = await res.json();
  const station = data?.data?.stations?.find(s => s.station_id === stationId);
  if (station) {
    console.log(`🚲 ${station.num_bikes_available} vélos - 🅿️ ${station.num_docks_available} bornes`);
  } else {
    console.log("⚠️ Station Vélib introuvable ou indisponible.");
  }
}

async function main() {
  try {
    console.log("🚆 RER A – Joinville-le-Pont");
    const dataRer = await fetchPrimStop(STOP_IDS.rer_joinville, LINE_REFS.rer_a);
    parseTrips(dataRer, LINE_REFS.rer_a);

    console.log("\n🚌 Bus 77 – Hippodrome");
    const data77 = await fetchPrimStop(STOP_IDS.bus77_hippo, LINE_REFS.bus77);
    parseTrips(data77, LINE_REFS.bus77);

    console.log("\n🚌 Bus 201 – Breuil");
    const data201 = await fetchPrimStop(STOP_IDS.bus201_breuil, LINE_REFS.bus201);
    parseTrips(data201, LINE_REFS.bus201);

    console.log("\n🌦 Météo");
    await fetchWeather();

    console.log("\n🚦 Trafic routier");
    await fetchTrafficRoad();

    console.log("\n🚲 Vélib Vincennes");
    await fetchVelib(VELIB_IDS.vincennes);

  } catch (e) {
    console.error("🚨 Erreur inattendue :", e);
  }
}

main();
