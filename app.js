// app.js - Manual AR overlay with proper toggle and full-screen camera

document.addEventListener('DOMContentLoaded', () => {
  // Leaflet map setup
  const mapDiv = document.getElementById('map');
  const map = L.map(mapDiv).setView([0, 0], 2);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);
  const markers = L.markerClusterGroup({ maxClusterRadius: 50 }).addTo(map);

  // Geolocation & Overpass
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
  });
  map.on('locationerror', () => alert('Could not get your location'));

  let timeout; const cache = new Map();
  map.on('moveend', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const b = map.getBounds();
      const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
        .map(v => v.toFixed(3)).join(',');
      if (cache.has(key)) renderMarkers(cache.get(key));
      else fetchFountains(b, key);
    }, 500);
  });

  async function fetchNearby(lat, lon, radius) {
    const q = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const d = await r.json(); renderMarkers(d.elements);
    } catch (e) { console.error(e); }
  }

  async function fetchFountains(bounds, key) {
    const q = `[out:json][timeout:25];(` +
      `node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});` +
      `way["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});` +
      `relation["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});` +
    `);out center;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const d = await r.json(); cache.set(key, d.elements); renderMarkers(d.elements);
    } catch (e) { console.error(e); }
  }

  function renderMarkers(list) {
    markers.clearLayers(); window._fountains = list;
    list.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat, lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      markers.addLayer(L.marker([lat, lon]).bindPopup(
        `<strong>${pt.tags?.name || 'Drinking water'}</strong><br><button onclick="navigate(${lat},${lon})">Navigate</button>`
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

  // AR overlay elements
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const exitBtn = document.getElementById('exit-ar');
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-overlay');
  const info = document.getElementById('distance-info');
  let stream, watcher;

  arBtn.addEventListener('click', async () => {
    // show AR view
    mapDiv.style.display = 'none';
    arBtn.style.display = 'none';
    arView.style.display = 'block';
    exitBtn.style.display = 'block';
    info.style.display = 'block';

    // start camera
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      console.error('Camera error', e);
      alert('Camera not available');
      return;
    }

    // prepare overlay
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // orientation
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp === 'granted') {
          startOrientation();
        } else {
          console.warn('Orientation permission denied');
        }
      } catch (err) {
        console.error('Orientation error', err);
      }
    } else {
      startOrientation();
    }
  });

  exitBtn.addEventListener('click', () => {
    // stop AR view
    if (stream) stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    arView.style.display = 'none';
    exitBtn.style.display = 'none';
    info.style.display = 'none';
    mapDiv.style.display = 'block';
    arBtn.style.display = 'block';
    if (watcher) {
      window.removeEventListener('deviceorientationabsolute', watcher);
      window.removeEventListener('deviceorientation', watcher);
    }
  });

  function startOrientation() {
    watcher = ev => drawOverlay(ev.alpha ?? ev.webkitCompassHeading ?? 0);
    window.addEventListener('deviceorientationabsolute', watcher, true);
    window.addEventListener('deviceorientation', watcher, true);
  }

  function drawOverlay(heading) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fountains = window._fountains || [];
    if (!locationMarker) return;
    const userPos = locationMarker.getLatLng();
    const data = fountains.map(f => {
      const lat = f.lat ?? f.center.lat, lon = f.lon ?? f.center.lon;
      const bearing = (Math.atan2(lon - userPos.lng, lat - userPos.lat) * 180) / Math.PI;
      const relative = bearing - heading;
      const dist = userPos.distanceTo(L.latLng(lat, lon));
      return {angle: relative, dist};
    }).sort((a, b) => a.dist - b.dist).slice(0, 3);

    data.forEach((d, i) => {
      const rad = d.angle * Math.PI / 180;
      const x = canvas.width / 2 + Math.sin(rad) * 100;
      const y = canvas.height / 2 - Math.cos(rad) * 100 * ((i + 1) / 1.5);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, canvas.height / 2);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 4;
      ctx.stroke();
    });

    if (data[0]) {
      info.textContent = `${Math.round(data[0].dist)} m to nearest water`;
    } else {
      info.textContent = '';
    }
  }
});
