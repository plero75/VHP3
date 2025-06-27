import requests
from datetime import datetime

API_PROXY_URL = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace"

STOP_IDS = {
    "rer_joinville": "STIF:StopPoint:Q:39406:",
    "bus77_hippo": "STIF:StopPoint:Q:463640:",
    "bus201_breuil": "STIF:StopPoint:Q:463646:",
}
LINE_REFS = {
    "rer_a": "STIF:Line::C01742:",
    "bus77": "STIF:Line::C01789:",
    "bus201": "STIF:Line::C01805:",
}
VELIB_IDS = {
    "vincennes": "1074333296",
}

def log_response(label, response):
    print(f"\n📝 [{label}]")
    print(f"URL: {response.url}")
    print(f"Status: {response.status_code}")
    print(f"Body:\n{response.text[:1000]}{'...' if len(response.text) > 1000 else ''}")

def fetch_prim_stop(monitoring_ref, line_ref):
    url = f"{API_PROXY_URL}/stop-monitoring?MonitoringRef={monitoring_ref}&LineRef={line_ref}"
    res = requests.get(url, timeout=10)
    log_response("PRIM", res)
    res.raise_for_status()
    return res.json()

def parse_and_display_trips(json_data, expected_line_ref):
    try:
        visits = (
            json_data.get("Siri", {})
            .get("ServiceDelivery", {})
            .get("StopMonitoringDelivery", [{}])[0]
            .get("MonitoredStopVisit", [])
        )
    except Exception as e:
        print(f"🚨 Erreur parsing JSON : {e}")
        print("❌ Données invalides ou structure inattendue.")
        return

    trips = []
    for visit in visits:
        journey = visit.get("MonitoredVehicleJourney", {})
        if journey.get("LineRef", {}).get("value") != expected_line_ref:
            continue
        call = journey.get("MonitoredCall", {})
        aimed = call.get("AimedDepartureTime")
        expected = call.get("ExpectedDepartureTime")
        direction = journey.get("DirectionName", [{}])[0].get("value", "Direction inconnue")
        trips.append({"aimed": aimed, "expected": expected, "direction": direction})

    if not trips:
        print("❌ Aucun passage disponible pour la ligne demandée.")
    else:
        for trip in trips[:4]:
            print(format_trip(trip))

def format_trip(trip):
    aimed_dt = datetime.fromisoformat(trip["aimed"]) if trip["aimed"] else None
    expected_dt = datetime.fromisoformat(trip["expected"]) if trip["expected"] else None
    if not expected_dt:
        return "⛔ Heure inconnue"
    delay = ((expected_dt - aimed_dt).total_seconds() / 60) if aimed_dt else 0
    now = datetime.now()
    time_left = round((expected_dt - now).total_seconds() / 60)
    aimed_str = aimed_dt.strftime("%H:%M") if aimed_dt else "—"
    expected_str = expected_dt.strftime("%H:%M")
    delay_str = f"(retard +{round(delay)} min)" if delay > 1 else ""
    imminent = "🟢 imminent" if time_left <= 1.5 else f"⏳ dans {time_left} min"
    return f"🕐 {aimed_str} → {expected_str} {imminent} {delay_str}\nDirection {trip['direction']}"

def fetch_weather():
    url = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.43&current=temperature_2m,weathercode&timezone=Europe%2FParis"
    res = requests.get(url, timeout=10)
    log_response("Météo", res)
    res.raise_for_status()
    data = res.json()
    temp = data["current"]["temperature_2m"]
    desc = get_weather_description(data["current"]["weathercode"])
    print(f"🌡 {temp}°C, {desc}")

def get_weather_description(code):
    weather_map = {
        0: "Ciel clair",
        1: "Principalement clair",
        2: "Partiellement nuageux",
        3: "Couvert",
        45: "Brouillard",
        51: "Bruine",
        61: "Pluie légère",
        80: "Averses",
        95: "Orages",
    }
    return weather_map.get(code, "Inconnu")

def fetch_traffic_road():
    url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=5&facet=route"
    res = requests.get(url, timeout=10)
    log_response("Trafic routier", res)
    res.raise_for_status()
    data = res.json()
    infos = [f"🛣 {r['fields']['route']} : {r['fields']['etat_circulation']}" for r in data.get("records", [])]
    print("\n".join(infos) or "✅ Trafic normal")

def fetch_velib(station_id):
    url = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json"
    res = requests.get(url, timeout=10)
    log_response("Vélib", res)
    res.raise_for_status()
    stations = res.json().get("data", {}).get("stations", [])
    if not stations:
        print("⚠️ Aucune donnée Vélib trouvée.")
        return
    station = next((s for s in stations if s.get("station_id") == station_id), None)
    if station:
        print(f"🚲 {station['num_bikes_available']} vélos - 🅿️ {station['num_docks_available']} bornes")
    else:
        print("⚠️ Station Vélib introuvable ou indisponible.")

def main():
    try:
        print("🚆 RER A – Joinville-le-Pont")
        data = fetch_prim_stop(STOP_IDS["rer_joinville"], LINE_REFS["rer_a"])
        parse_and_display_trips(data, LINE_REFS["rer_a"])

        print("\n🚌 Bus 77 – Hippodrome")
        data = fetch_prim_stop(STOP_IDS["bus77_hippo"], LINE_REFS["bus77"])
        parse_and_display_trips(data, LINE_REFS["bus77"])

        print("\n🚌 Bus 201 – Breuil")
        data = fetch_prim_stop(STOP_IDS["bus201_breuil"], LINE_REFS["bus201"])
        parse_and_display_trips(data, LINE_REFS["bus201"])

        print("\n🌦 Météo")
        fetch_weather()

        print("\n🚦 Trafic routier")
        fetch_traffic_road()

        print("\n🚲 Vélib Vincennes")
        fetch_velib(VELIB_IDS["vincennes"])

    except requests.RequestException as e:
        print("🚨 Erreur API:", e)
    except Exception as e:
        print("🚨 Erreur inattendue:", e)

if __name__ == "__main__":
    main()
