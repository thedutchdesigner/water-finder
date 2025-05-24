// app.js - Enhanced AR overlay with markers and distance labels

document.addEventListener('DOMContentLoaded', () => {
  // --- Leaflet map setup ---
  const mapDiv = document.getElementById('map');
  const map = L.map(mapDiv).setView([0, 0], 2);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);
  const markers = L.markerClusterGroup({ maxClusterRadius: 50 }).addTo(map);

  // --- Geolocation & Overpass fetching ---
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 2000);
  });
  map.on('locationerror', () => alert('Could not get your location'));

  let timeout;
  const cache = new Map();
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
    const q = \`[out:json][timeout:15];
node["amenity"="drinking_water"](around:\${radius},\${lat},\${lon});
out center;\`;
    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const data = await resp.json();
      renderMarkers(data.elements);
    } catch (e) {
      console.error('Overpass radius error', e);
    }
  }

  async function fetchFountains(bounds, key) {
    const q = \`[out:json][timeout:25];
(
  node["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});
  way["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});
  relation["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});
);
out center;\`;
    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const data = await resp.json();
      cache.set(key, data.elements);
      renderMarkers(data.elements);
    } catch (e) {
      console.error('Overpass bbox error', e);
    }
  }

  function renderMarkers(list) {
    markers.clearLayers();
    window._fountains = list;
    list.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const name = pt.tags?.name || 'Drinking water';
      markers.addLayer(L.marker([lat, lon]).bindPopup(\`<strong>\${name}</strong>\`));
    });
  }

  window.navigate = (lat, lon) => {
    const isIOS = /iP(hone|ad|od)/.test(navigator.platform);
    const url = isIOS
      ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
      : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
    window.open(url, '_blank');
  };

  // --- AR overlay elements ---
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const exitBtn = document.getElementById('exit-ar');
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-overlay');
  const info = document.getElementById('distance-info');
  let stream, watcher;

  arBtn.addEventListener('click', async () => {
    if (arView.style.display !== 'block') {
      mapDiv.style.display = 'none';
      arBtn.style.display = 'none';
      arView.style.display = 'block';
      exitBtn.style.display = 'block';
      info.style.display = 'block';

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        console.error('Camera error', e);
        alert('Camera not available');
        return;
      }

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Request orientation permission on iOS
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const resp = await DeviceOrientationEvent.requestPermission();
          if (resp !== 'granted') throw new Error('Orientation denied');
        } catch (err) {
          console.warn('Orientation permission missing', err);
        }
      }

      watcher = ev => drawOverlay(ev.alpha ?? ev.webkitCompassHeading ?? 0);
      window.addEventListener('deviceorientationabsolute', watcher, true);
      window.addEventListener('deviceorientation', watcher, true);
    }
  });

  exitBtn.addEventListener('click', () => {
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

  function drawOverlay(heading) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fountains = (window._fountains || [])
      // compute bearing and dist for each
      .map(f => {
        const lat = f.lat ?? f.center.lat;
        const lon = f.lon ?? f.center.lon;
        const userPos = locationMarker.getLatLng();
        const bearing = (Math.atan2(lon - userPos.lng, lat - userPos.lat) * 180) / Math.PI;
        const relative = ((bearing - heading + 540) % 360) - 180; // normalize to [-180,180]
        const dist = userPos.distanceTo(L.latLng(lat, lon));
        return { relative, dist };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5); // show up to 5

    // draw central crosshair
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 20, canvas.height / 2);
    ctx.lineTo(canvas.width / 2 + 20, canvas.height / 2);
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - 20);
    ctx.lineTo(canvas.width / 2, canvas.height / 2 + 20);
    ctx.stroke();

    // draw each fountain as a circle around crosshair
    fountains.forEach((f, i) => {
      const angleRad = f.relative * Math.PI / 180;
      const radius = 100; // base radius
      const x = canvas.width / 2 + Math.sin(angleRad) * radius;
      const y = canvas.height / 2 - Math.cos(angleRad) * radius;
      // circle
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      // label
      ctx.font = '16px sans-serif';
      ctx.fillText(\`\${Math.round(f.dist)}m\`, x + 10, y);
    });

    info.textContent = fountains[0]
      ? \`Nearest: \${Math.round(fountains[0].dist)} m\`
      : '';
  }
});
