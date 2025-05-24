// app.js - Leaflet map + AR.js toggling for location-based AR

document.addEventListener('DOMContentLoaded', () => {
  // Leaflet map initialization
  const mapContainer = document.getElementById('map');
  const map = L.map(mapContainer).setView([0, 0], 2);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);
  const markersCluster = L.markerClusterGroup({ maxClusterRadius: 50 });
  map.addLayer(markersCluster);

  // Location fetching
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
  });
  map.on('locationerror', () => console.error('Location error'));

  // Debounced bounding-box fetch
  let fetchTimeout;
  const bboxCache = new Map();
  map.on('moveend', () => {
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      const b = map.getBounds();
      const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
        .map(v => v.toFixed(3)).join(',');
      if (bboxCache.has(key)) {
        renderMarkers(bboxCache.get(key));
      } else {
        fetchFountains(b, key);
      }
    }, 500);
  });

  // Overpass fetches
  async function fetchNearby(lat, lon, radius) {
    const q = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const data = await r.json();
      renderMarkers(data.elements);
    } catch (err) { console.error(err); }
  }
  async function fetchFountains(bounds, key) {
    const q = `[out:json][timeout:25];(` +
      `node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});` +
      `way["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});` +
      `relation["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});` +
    `);out center;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const data = await r.json();
      bboxCache.set(key, data.elements);
      renderMarkers(data.elements);
    } catch (err) { console.error(err); }
  }

  function renderMarkers(elements) {
    markersCluster.clearLayers();
    window._fountains = elements;
    elements.forEach(el => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!lat || !lon) return;
      const name = el.tags?.name || 'Drinking water';
      markersCluster.addLayer(
        L.marker([lat, lon]).bindPopup(
          `<strong>${name}</strong><br/><button onclick="navigate(${lat},${lon})">Navigate</button>`
        )
      );
    });
  }

  window.navigate = (lat, lon) => {
    const isIOS = /iP(hone|ad|od)/.test(navigator.platform);
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url,'_blank');
  };

  // AR.js toggling
  const arBtn = document.getElementById('ar-button');
  const arSceneCont = document.getElementById('arSceneContainer');
  const exitBtn = document.getElementById('ar-exit-button');
  const scene = document.getElementById('ar-scene');

  function enterAR() {
    mapContainer.style.display = 'none';
    arBtn.style.display = 'none';
    arSceneCont.style.display = 'block';
    // add entities
    (window._fountains || []).forEach(f => {
      const lat = f.lat ?? f.center?.lat;
      const lon = f.lon ?? f.center?.lon;
      if (!lat || !lon) return;
      const entity = document.createElement('a-entity');
      entity.setAttribute('gps-entity-place', `latitude: ${lat}; longitude: ${lon};`);
      entity.setAttribute('geometry', 'primitive: cone; radiusBottom: 0; radiusTop: 1; height: 2');
      entity.setAttribute('material', 'color: blue; opacity: 0.8');
      entity.setAttribute('look-at', '[gps-camera]');
      entity.classList.add('ar-fountain');
      scene.appendChild(entity);
    });
  }

  function exitAR() {
    mapContainer.style.display = 'block';
    arBtn.style.display = 'block';
    arSceneCont.style.display = 'none';
    scene.querySelectorAll('.ar-fountain').forEach(e => e.remove());
  }

  arBtn.addEventListener('click', enterAR);
  exitBtn.addEventListener('click', exitAR);
});
