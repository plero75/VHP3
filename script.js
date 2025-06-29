const CORS_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

async function fetchAndDisplay(url, containerId, updateId) {
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    let data;
    try { data = await response.json(); }
    catch (e) {
      const text = await response.text();
      console.error("Réponse non JSON:", text);
      throw new Error("JSON invalide");
    }
    const container = document.getElementById(containerId);
    if (!container) return console.warn(`Container ID '${containerId}' introuvable`);
    container.innerHTML = '';

    const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    if (visits.length === 0) {
      container.innerHTML = '<p>🛑 Aucun passage temps réel.</p>';
      return;
    }

    const now = new Date();
    visits.slice(0, 6).forEach(v => {
      const mvj = v.MonitoredVehicleJourney;
      const aimed = mvj.MonitoredCall.AimedDepartureTime ? new Date(mvj.MonitoredCall.AimedDepartureTime) : new Date(mvj.MonitoredCall.ExpectedDepartureTime);
      const expected = new Date(mvj.MonitoredCall.ExpectedDepartureTime);
      const onwardCalls = mvj.OnwardCalls?.OnwardCall || [];
      container.innerHTML += `
        <div class="passage-block">
          <div class="passage-header">
            <div class="mission-code">
              <div class="operator">${mvj.OperatorRef?.value?.split(':').pop() || 'N/A'}</div>
              <div class="mission">${mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef?.split(':').pop() || 'N/A'}</div>
            </div>
            <div class="main-info">
              <div class="time">${expected.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
              <div class="line-badge">${mvj.LineRef?.value?.split(':').pop() || ''}</div>
              <div class="destination">${mvj.DestinationName?.[0]?.value || 'N/A'}</div>
            </div>
          </div>
          <div class="stops-list">${onwardCalls.length > 0 ? onwardCalls.map(call => call.StopPointName?.[0]?.value || 'N/A').join(' • ') : 'Arrêts non disponibles'}</div>
        </div>`;
    });

    const updateEl = document.getElementById(updateId);
    if (updateEl) updateEl.textContent = `Mise à jour : ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '<p>❌ Erreur chargement passages</p>';
  }
}

async function fetchTrafficAlerts(lineRef, containerId) {
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(lineRef)}`;
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    if (!container) return console.warn(`Container ID '${containerId}' introuvable`);
    container.innerHTML = '';
    const messages = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (messages.length === 0) {
      container.innerHTML = '<p>✅ Aucun incident signalé.</p>';
      return;
    }
    messages.forEach(m => {
      const text = m.InfoMessageText?.[0]?.MessageText?.trim();
      if (text) container.innerHTML += `<div class="alert"><p>⚠️ ${text}</p></div>`;
    });
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '<p>❌ Erreur infos trafic</p>';
  }
}

async function fetchWeather(containerId) {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.423&current_weather=true');
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const w = (await response.json()).current_weather;
    const container = document.getElementById(containerId);
    if (!container) return console.warn(`Container ID '${containerId}' introuvable`);
    container.innerHTML = `<p>🌡 Température : ${w.temperature}°C</p><p>💨 Vent : ${w.windspeed} km/h</p><p>🌥 Conditions : ${w.weathercode}</p>`;
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '<p>❌ Erreur météo</p>';
  }
}

async function fetchVelibDirect(url, containerId) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const stations = await response.json();
    const container = document.getElementById(containerId);
    if (!container) return console.warn(`Container ID '${containerId}' introuvable`);
    if (!stations || stations.length === 0) {
      container.innerHTML = `<p>❌ Aucune donnée Vélib’</p>`; return;
    }
    const s = stations[0];
    container.innerHTML = `<p>📍 ${s.name}</p><p>🚲 Mécaniques : ${s.numbikesavailable}</p><p>🔌 Électriques : ${s.ebike || 'N/A'}</p><p>🅿️ Bornes libres : ${s.numdocksavailable}</p>`;
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '<p>❌ Erreur Vélib’</p>';
  }
}

async function fetchNewsTicker(containerId) {
  const rssProxyUrl = 'https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss';
  try {
    const response = await fetch(rssProxyUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    const container = document.getElementById(containerId);
    if (!container) return console.warn(`Container ID '${containerId}' introuvable`);
    const items = data.items || [];
    container.innerHTML = items.length === 0
      ? '✅ Aucun article récent.'
      : items.slice(0,10).map(item => `<span style="margin-right:50px;">📰 ${item.title}</span>`).join('');
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.textContent = '❌ Erreur actus';
  }
}

function refreshAll() {
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:43135:', 'rer-a-passages', 'rer-a-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463641:', 'bus-77-passages', 'bus-77-update');
  fetchAndDisplay('https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopArea:SP:463644:', 'bus-201-passages', 'bus-201-update');
  fetchTrafficAlerts('STIF:Line::C01742:', 'rer-a-alerts');
  fetchTrafficAlerts('STIF:Line::C00777:', 'bus-77-alerts');
  fetchTrafficAlerts('STIF:Line::C00201:', 'bus-201-alerts');
  fetchWeather('weather-data');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12163)&timezone=Europe%2FParis', 'velib-vincennes-data');
  fetchVelibDirect('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/exports/json?lang=fr&qv1=(12128)&timezone=Europe%2FParis', 'velib-breuil-data');
  fetchNewsTicker('news-ticker');
}

refreshAll();
setInterval(refreshAll, 60000);
