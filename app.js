import fs from "fs";
import https from "https";
import unzipper from "unzipper";
import csv from "csv-parser";
import { DateTime } from "luxon";

const LINES = ["RER A", "77", "201"];
const GTFS_URL = "https://opendata.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/download/?format=gtfs&timezone=Europe/Paris";
const THIS_WEEK = {
  start: DateTime.now().startOf('week'),
  end: DateTime.now().endOf('week'),
};

async function main() {
  console.log("🚦 Téléchargement du GTFS...");
  await downloadGTFS("./gtfs.zip");

  console.log("🔍 Extraction et filtrage...");
  const extracted = await extractGTFS("./gtfs.zip");

  const filteredRoutes = extracted.routes.filter(r => LINES.includes(r.route_short_name));
  const routeIds = filteredRoutes.map(r => r.route_id);
  const filteredTrips = extracted.trips.filter(t => routeIds.includes(t.route_id));
  const tripIds = filteredTrips.map(t => t.trip_id);
  const filteredStopTimes = extracted.stop_times.filter(s => tripIds.includes(s.trip_id));
  const activeServiceIds = extracted.calendar.filter(cal => {
    const startDate = DateTime.fromFormat(cal.start_date, "yyyyMMdd");
    const endDate = DateTime.fromFormat(cal.end_date, "yyyyMMdd");
    return THIS_WEEK.start <= endDate && THIS_WEEK.end >= startDate;
  }).map(cal => cal.service_id);

  const finalTrips = filteredTrips.filter(t => activeServiceIds.includes(t.service_id));
  const finalTripIds = finalTrips.map(t => t.trip_id);
  const finalStopTimes = filteredStopTimes.filter(s => finalTripIds.includes(s.trip_id));

  fs.writeFileSync("filtered_trips.json", JSON.stringify(finalTrips, null, 2));
  fs.writeFileSync("filtered_stop_times.json", JSON.stringify(finalStopTimes, null, 2));
  console.log("✅ Extraction terminée : JSONs mis à jour !");
}

function downloadGTFS(dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(GTFS_URL, res => {
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

function extractGTFS(zipPath) {
  return new Promise((resolve, reject) => {
    const extracted = {routes:[], trips:[], stop_times:[], calendar:[]};
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', entry => {
        const name = entry.path;
        if (["routes.txt", "trips.txt", "stop_times.txt", "calendar.txt"].includes(name)) {
          entry.pipe(csv())
            .on("data", d => extracted[name.split(".")[0]].push(d))
            .on("error", reject);
        } else {
          entry.autodrain();
        }
      })
      .on("close", () => resolve(extracted))
      .on("error", reject);
  });
}

main().catch(err => {
  console.error("❌ Erreur script:", err);
  process.exit(1);
});
