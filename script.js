function setLoading(elementId) {
  document.querySelector(elementId).innerHTML = "🔄 Chargement...";
}

function updateTimestamp(elementId) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.querySelector(elementId).insertAdjacentHTML('beforeend', `<div style="font-size:0.8em;">🕒 Mise à jour : ${time}</div>`);
}

async function fetchAndDisplayRSS(url, elementId) {
  setLoading(elementId);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);
    const html = items.map(item => {
      const title = item.querySelector("title")?.textContent || "Sans titre";
      return `<li>${title}</li>`;
    }).join("");
    document.querySelector(elementId).innerHTML = `<ul>${html}</ul>`;
    updateTimestamp(elementId);
  } catch (e) {
    console.error(e);
    document.querySelector(elementId).textContent = `Erreur : ${e.message}`;
  }
}

// Appelle la fonction avec ton flux RSS :
fetchAndDisplayRSS("https://ton-flux-rss.com/feed.xml", "#rss-news");
