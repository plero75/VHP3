import fetch from "node-fetch";

const MONITORING_REFS = [
  "STIF:StopArea:SP:43135:",
  "STIF:StopArea:SP:463641:",
  "STIF:StopArea:SP:463644:"
];

async function checkRefs() {
  console.log("⏰ Vérification quotidienne des MonitoringRefs...");
  const url = 'https://prim.iledefrance-mobilites.fr/marketplace/referentiel/stop-areas';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const validRefs = data.stop_areas.map(sa => sa.StopAreaId);
    MONITORING_REFS.forEach(ref => {
      if (!validRefs.includes(ref)) {
        console.log(`❗ Identifiant invalide détecté : ${ref}`);
        // 👉 Ici : envoi d'un email ou d'un message Slack
      } else {
        console.log(`✅ Identifiant valide : ${ref}`);
      }
    });
  } catch (err) {
    console.error("❌ Erreur lors de la vérification :", err);
  }
}

checkRefs();
