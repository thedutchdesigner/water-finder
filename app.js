// app.js with improved AR support and orientation permissions

// Pure Leaflet + CartoDB Positron minimal tiles
const map = L.map('map').setView([0, 0], 2);
L.tileLayer(
  'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
).addTo(map);

// Marker cluster group
const markersCluster = L.markerClusterGroup({ maxClusterRadius: 50 });
map.addLayer(markersCluster);

// Location marker
let locationMarker;
map.locate({ setView: true, maxZoom: 16 });
map.on('locationerror', () => alert('Could not get your location'));
map.on('locationfound', (e) => {
  if (locationMarker) map.removeLayer(locationMarker);
  locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
  fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
});

// Debounced bbox fetch and cache
let fetchTimeout;
const bboxCache = new Map();
map.on('moveend', () => {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(() => {
    const b = map.getBounds();
    const key = [
      b.getSouth().toFixed(3),
      b.getWest().toFixed(3),
      b.getNorth().toFixed(3),
      b.getEast().toFixed(3)
    ].join(',');
    if (bboxCache.has(key)) {
      renderMarkers(bboxCache.get(key));
    } else {
      fetchFountains(b, key);
    }
  }, 500);
});

// Overpass small radius fetch
async function fetchNearby(lat, lon, radius) {
  const query = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    const data = await resp.json();
    renderMarkers(data.elements);
  } catch (err) {
    console.error('Overpass radius error', err);
  }
}

// Overpass bbox fetch
async function fetchFountains(bounds, key) {
  const query = `[out:json][timeout:25];(node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});way["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});relation["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}););out center;`;
  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    const data = await resp.json();
    bboxCache.set(key, data.elements);
    renderMarkers(data.elements);
  } catch (err) {
    console.error('Overpass bbox error', err);
  }
}

// Render markers and store for AR
function renderMarkers(elements) {
  markersCluster.clearLayers();
  window._fountains = elements;
  elements.forEach((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return;
    const name = el.tags?.name || 'Drinking water';
    markersCluster.addLayer(
      L.marker([lat, lon]).bindPopup(
        `<strong>${name}</strong><br/><button onclick="navigate(${lat},${lon})">Navigate</button>`
      )
    );
  });
}

// Navigate handler
window.navigate = (lat, lon) => {
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform);
  const url = isIOS
    ? `maps://maps.apple.com/?daddr=${lat},${lon}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  window.open(url, '_blank');
};

// AR functionality
const arBtn = document.getElementById('ar-button');
const arView = document.getElementById('ar-view');
const arVideo = document.getElementById('ar-video');
const arCanvas = document.getElementById('ar-overlay');
const arInfo = document.getElementById('ar-info');
let arStream, watcher;

arBtn.addEventListener('click', async () => {
  if (arView.style.display === 'none') {
    // Show AR view
    arView.style.display = 'block';
    arCanvas.width = window.innerWidth;
    arCanvas.height = window.innerHeight;
    try {
      // Request camera
      arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      arVideo.srcObject = arStream;
      await arVideo.play();
      // Request orientation permission for iOS 13+
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp !== 'granted') throw new Error('Orientation permission denied');
      }
      startAR();
    } catch (e) {
      console.error('AR init error', e);
      alert('AR mode not available');
      // Fallback: exit AR
      arView.style.display = 'none';
      if (arStream) arStream.getTracks().forEach(t => t.stop());
    }
  } else {
    // Exit AR view
    arView.style.display = 'none';
    if (arStream) arStream.getTracks().forEach(t => t.stop());
    if (watcher) window.removeEventListener('deviceorientationabsolute', watcher);
  }
});

function startAR() {
  watcher = (ev) => {
    const heading = ev.alpha ?? ev.webkitCompassHeading ?? 0;
    drawAR(heading);
  };
  window.addEventListener('deviceorientationabsolute', watcher, true);
}

function drawAR(heading) {
  const ctx = arCanvas.getContext('2d');
  ctx.clearRect(0, 0, arCanvas.width, arCanvas.height);
  const fountains = window._fountains || [];
  if (!locationMarker) return;
  const userPos = locationMarker.getLatLng();
  const data = fountains
    .map((f) => {
      const lat = f.lat ?? f.center.lat;
      const lon = f.lon ?? f.center.lon;
      const bearing = (Math.atan2(lon - userPos.lng, lat - userPos.lat) * 180) / Math.PI;
      const relative = bearing - heading;
      const dist = userPos.distanceTo(L.latLng(lat, lon));
      return { angle: relative, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
  data.forEach((d, i) => {
    const angleRad = (d.angle * Math.PI) / 180;
    const x = arCanvas.width / 2 + Math.sin(angleRad) * 100;
    const y = arCanvas.height / 2 - Math.cos(angleRad) * 100 * ((i + 1) / 1.5);
    ctx.beginPath();
    ctx.moveTo(arCanvas.width / 2, arCanvas.height / 2);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(0,123,255,0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
  });
  if (data[0]) {
    arInfo.textContent = `${Math.round(data[0].dist)} m to nearest water`;
  }
}
