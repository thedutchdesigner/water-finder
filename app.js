// app.js - Leaflet map + dynamic AR.js injection with working toggle

document.addEventListener('DOMContentLoaded', () => {
  // --- Leaflet Map Setup ---
  const mapDiv = document.getElementById('map');
  const map = L.map(mapDiv).setView([0, 0], 2);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);
  const cluster = L.markerClusterGroup({ maxClusterRadius: 50 });
  map.addLayer(cluster);

  // --- Geolocation & Overpass Fetch ---
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
  });
  map.on('locationerror', () => console.error('Location error'));

  let timeout;
  const cache = new Map();
  map.on('moveend', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const b = map.getBounds();
      const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(v => v.toFixed(3)).join(',');
      if (cache.has(key)) renderMarkers(cache.get(key));
      else fetchFountains(b, key);
    }, 500);
  });

  async function fetchNearby(lat, lon, radius) {
    const q = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const d = await r.json();
      renderMarkers(d.elements);
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
      const d = await r.json();
      cache.set(key, d.elements);
      renderMarkers(d.elements);
    } catch (err) { console.error(err); }
  }

  function renderMarkers(list) {
    cluster.clearLayers();
    window._fountains = list;
    list.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const name = pt.tags?.name || 'Drinking water';
      cluster.addLayer(L.marker([lat, lon]).bindPopup(
        `<strong>${name}</strong><br/><button onclick="navigate(${lat},${lon})">Navigate</button>`
      ));
    });
  }

  window.navigate = (lat, lon) => {
    const isIOS = /iP(hone|ad|od)/.test(navigator.platform);
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, '_blank');
  };

  // --- AR.js Injection & Toggle ---
  const arBtn = document.getElementById('ar-button');
  const exitBtn = document.getElementById('ar-exit-button');
  const container = document.getElementById('arSceneContainer');

  arBtn.addEventListener('click', () => {
    mapDiv.style.display = 'none';
    arBtn.style.display = 'none';
    container.style.display = 'block';
    exitBtn.style.display = 'block';

    // Create AR scene
    const scene = document.createElement('a-scene');
    scene.setAttribute('embedded', '');
    scene.setAttribute('arjs', 'sourceType: webcam;gpsMinDistance:2;debugUIEnabled:false');
    scene.style.position = 'absolute';
    scene.style.top = '0';
    scene.style.left = '0';
    scene.style.width = '100%';
    scene.style.height = '100%';

    // Camera
    const camera = document.createElement('a-camera');
    camera.setAttribute('gps-camera', '');
    camera.setAttribute('rotation-reader', '');
    scene.appendChild(camera);

    // Add fountain markers
    (window._fountains || []).forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const entity = document.createElement('a-entity');
      entity.setAttribute('gps-entity-place', `latitude: ${lat}; longitude: ${lon};`);
      entity.setAttribute('geometry', 'primitive: cone; radiusBottom: 0; radiusTop: 1; height: 2');
      entity.setAttribute('material', 'color: blue; opacity: 0.8');
      entity.setAttribute('look-at', '[gps-camera]');
      entity.classList.add('ar-fountain');
      scene.appendChild(entity);
    });

    container.appendChild(scene);
  });

  exitBtn.addEventListener('click', () => {
    // Remove AR scene and show map
    mapDiv.style.display = 'block';
    arBtn.style.display = 'block';
    container.style.display = 'none';
    exitBtn.style.display = 'none';
    const scene = container.querySelector('a-scene');
    if (scene) container.removeChild(scene);
  });
});
