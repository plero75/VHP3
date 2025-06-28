const fs = require("fs");
const path = require("path");
const readline = require("readline");

const GTFS_FOLDER = "./gtfs";
const OUTPUT_FILE = "./public/gtfs-info.json";

const lineId = "C01742"; // ex. ligne RER A : C01742 dans GTFS IDFM

async function parseFirstLastAndStops() {
  const tripsFile = path.join(GTFS_FOLDER, "trips.txt");
  const stopTimesFile = path.join(GTFS_FOLDER, "stop_times.txt");
  const stopsFile = path.join(GTFS_FOLDER, "stops.txt");

  const tripIds = new Set();
  const stopIds = new Set();
  let firstTime = null;
  let lastTime = null;

  // Étape 1 : identifier les trips pour la ligne
  const tripsStream = readline.createInterface({
    input: fs.createReadStream(tripsFile),
    crlfDelay: Infinity
  });
  let tripsHeader;
  for await (const line of tripsStream) {
    if (!tripsHeader) { tripsHeader = line.split(","); continue; }
    const cols = line.split(",");
    const routeId = cols[1];
    if (routeId.endsWith(lineId)) tripIds.add(cols[2]); // trip_id
  }

  // Étape 2 : trouver horaires min/max et collecter stops
  const stopTimesStream = readline.createInterface({
    input: fs.createReadStream(stopTimesFile),
    crlfDelay: Infinity
  });
  let stHeader;
  for await (const line of stopTimesStream) {
    if (!stHeader) { stHeader = line.split(","); continue; }
    const cols = line.split(",");
    const tripId = cols[0], departure = cols[2], stopId = cols[3];
    if (tripIds.has(tripId)) {
      if (departure && departure !== " ") {
        if (!firstTime || departure < firstTime) firstTime = departure;
        if (!lastTime || departure > lastTime) lastTime = departure;
      }
      stopIds.add(stopId);
    }
  }

  // Étape 3 : lister les arrêts avec leurs noms
  const stops = [];
  const stopsStream = readline.createInterface({
    input: fs.createReadStream(stopsFile),
    crlfDelay: Infinity
  });
  let stopsHeader;
  for await (const line of stopsStream) {
    if (!stopsHeader) { stopsHeader = line.split(","); continue; }
    const cols = line.split(",");
    const stopId = cols[0], stopName = cols[2];
    if (stopIds.has(stopId)) stops.push(stopName);
  }

  const result = { first: firstTime, last: lastTime, stops };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`✅ Infos GTFS exportées dans ${OUTPUT_FILE}`);
}

parseFirstLastAndStops();