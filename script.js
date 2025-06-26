
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=48.8327&longitude=2.4382&current_weather=true&timezone=Europe%2FParis';

// METEO
async function fetchWeather() {
  try {
    const res = await fetch(WEATHER_URL);
    const data = await res.json();
    if (data.current_weather) {
      document.getElementById("weather").innerHTML = `
        <strong>Météo Vincennes</strong><br>
        🌡️ Température : ${Math.round(data.current_weather.temperature)}°C<br>
        💨 Vent : ${data.current_weather.windspeed} km/h
      `;
    }
  } catch (e) {
    document.getElementById("weather").innerText = "Météo indisponible";
  }
}
fetchWeather();
setInterval(fetchWeather, 300000);

// TRAFIC SYTADIN
document.getElementById("traffic").innerHTML = `
  <strong>Trafic routier temps réel (Sytadin)</strong><br>
  <iframe src='https://www.sytadin.fr/sys/baro' width='100%' height='300' style='border:none'></iframe>
`;

// HORAIRES SIMULÉS
function displaySchedules() {
  const horaires = {
    rer: { first: "05:23", last: "00:42" },
    bus77: { first: "06:10", last: "22:45" },
    bus201: { first: "06:00", last: "21:50" }
  };

  document.getElementById("rer-schedule").innerText = `Premier départ : ${horaires.rer.first} | Dernier départ : ${horaires.rer.last}`;
  document.getElementById("bus77-schedule").innerText = `Premier départ : ${horaires.bus77.first} | Dernier départ : ${horaires.bus77.last}`;
  document.getElementById("bus201-schedule").innerText = `Premier départ : ${horaires.bus201.first} | Dernier départ : ${horaires.bus201.last}`;
}
displaySchedules();

// VELIB
const velibStations = [
  { code: "12163", name: "Hippodrome Paris-Vincennes", container: "velib-12163" },
  { code: "12128", name: "Pyramide - École du Breuil", container: "velib-12128" }
];

async function fetchVelib() {
  try {
    const url = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json";
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    for (const sta of velibStations) {
      const station = data.find(s => s.stationcode === sta.code);
      const el = document.getElementById(sta.container);
      if (!station) {
        el.innerHTML = `<div>🔌 Station Vélib ${sta.name} indisponible</div>`;
        continue;
      }
      el.innerHTML = `
        <strong>🚲 Vélib - ${sta.name}</strong><br>
        📍 Statut : ${station.status}<br>
        🚲 Vélos mécaniques : ${station.mechanical}<br>
        ⚡ Vélos électriques : ${station.ebike}<br>
        🅿️ Bornes libres : ${station.numdocksavailable}
      `;
    }
  } catch (e) {
    velibStations.forEach(sta => {
      const el = document.getElementById(sta.container);
      el.innerHTML = `<div>⚠️ Erreur Vélib ${sta.name} : ${e.message}</div>`;
    });
  }
}
fetchVelib();
setInterval(fetchVelib, 60000);
