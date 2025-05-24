// app.js - Simplified map init and AR toggle

// Wait until the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Leaflet map
  const map = L.map('map').setView([0, 0], 2);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Marker cluster
  const cluster = L.markerClusterGroup().addTo(map);

  // User location
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: '#007bff' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 2000);
  });
  map.on('locationerror', () => alert('Location unavailable'));

  // Debounce and cache for bounds
  let timeout;
  const cache = new Map();
  map.on('moveend', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const b = map.getBounds();
      const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
        .map(v => v.toFixed(3)).join(',');
      if (cache.has(key)) {
        renderMarkers(cache.get(key));
      } else {
        fetchFountains(b, key);
      }
    }, 500);
  });

  // Overpass fetch functions
  async function fetchNearby(lat, lon, radius) {
    const q = \`[out:json][timeout:15];node["amenity"="drinking_water"](around:\${radius},\${lat},\${lon});out center;\`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const d = await r.json();
      renderMarkers(d.elements);
    } catch (e) { console.error(e); }
  }
  async function fetchFountains(bounds, key) {
    const q = \`[out:json][timeout:25];
(
  node["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});
);
out center;\`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const d = await r.json();
      cache.set(key, d.elements);
      renderMarkers(d.elements);
    } catch (e) { console.error(e); }
  }

  function renderMarkers(list) {
    cluster.clearLayers();
    (list || []).forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (!lat || !lon) return;
      cluster.addLayer(L.marker([lat, lon]).bindPopup('Water'));
    });
  }

  // AR toggle: just show/hide video area for now
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const exitBtn = document.getElementById('exit-ar');
  const arInfo = document.getElementById('ar-info');
  const video = document.getElementById('ar-video');
  const overlay = document.getElementById('ar-overlay');

  arBtn.addEventListener('click', async () => {
    map.getContainer().style.display = 'none';
    arBtn.style.display = 'none';
    arView.style.display = 'block';
    exitBtn.style.display = 'block';
    arInfo.style.display = 'block';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'} });
      video.srcObject = stream;
      await video.play();
    } catch {
      alert('Camera unavailable');
      exitAR();
    }
  });

  exitBtn.addEventListener('click', exitAR);
  function exitAR() {
    map.getContainer().style.display = '';
    arBtn.style.display = '';
    arView.style.display = 'none';
    exitBtn.style.display = 'none';
    arInfo.style.display = 'none';
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t=>t.stop());
      video.srcObject = null;
    }
  }
});
