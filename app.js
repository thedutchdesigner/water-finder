// app.js - Manual AR overlay with camera + compass

document.addEventListener('DOMContentLoaded', () => {
  // Leaflet map setup
  const mapDiv = document.getElementById('map');
  const map = L.map(mapDiv).setView([0, 0], 2);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);
  const markers = L.markerClusterGroup({ maxClusterRadius: 50 }).addTo(map);

  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
  });
  map.on('locationerror', () => alert('Could not get your location'));

  // Debounce and cache for bbox fetch
  let fetchTimeout;
  const cache = new Map();
  map.on('moveend', () => {
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      const b = map.getBounds();
      const key = [b.getSouth().toFixed(3), b.getWest().toFixed(3),
                   b.getNorth().toFixed(3), b.getEast().toFixed(3)].join(',');
      if (cache.has(key)) renderMarkers(cache.get(key));
      else fetchFountains(b, key);
    }, 500);
  });

  async function fetchNearby(lat, lon, radius) {
    const q = `[out:json][timeout:15];
node["amenity"="drinking_water"](around:${radius},${lat},${lon});
out center;`;
    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const data = await resp.json();
      renderMarkers(data.elements);
    } catch (e) { console.error(e); }
  }

  async function fetchFountains(bounds, key) {
    const q = `[out:json][timeout:25];
(
  node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
  way["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
  relation["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
);
out center;`;
    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const data = await resp.json();
      cache.set(key, data.elements);
      renderMarkers(data.elements);
    } catch (e) { console.error(e); }
  }

  function renderMarkers(list) {
    markers.clearLayers();
    window._fountains = list;
    list.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const name = pt.tags?.name || 'Drinking water';
      markers.addLayer(L.marker([lat, lon]).bindPopup(`<strong>${name}</strong><br><button onclick="navigate(${lat},${lon})">Navigate</button>`));
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
    if (arView.style.display !== 'block') {
      // show AR view
      arView.style.display = 'block';
      mapDiv.style.display = 'none';
      arBtn.style.display = 'none';
      // start camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        await video.play();
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // request orientation permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const resp = await DeviceOrientationEvent.requestPermission();
          if (resp !== 'granted') throw new Error('Permission denied');
        }
        // start orientation listener
        watcher = ev => drawAR(ev.alpha ?? ev.webkitCompassHeading ?? 0);
        window.addEventListener('deviceorientationabsolute', watcher, true);
        window.addEventListener('deviceorientation', watcher, true);
      } catch (e) {
        console.error(e);
        alert('AR not available');
        exitAR();
      }
    }
  });

  exitBtn.addEventListener('click', () => exitAR());

  function exitAR() {
    arView.style.display = 'none';
    mapDiv.style.display = 'block';
    arBtn.style.display = 'block';
    if (stream) stream.getTracks().forEach(t => t.stop());
    window.removeEventListener('deviceorientationabsolute', watcher);
    window.removeEventListener('deviceorientation', watcher);
  }

  function drawAR(heading) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fountains = window._fountains || [];
    if (!locationMarker) return;
    const userPos = locationMarker.getLatLng();
    const data = fountains.map(f => {
      const lat = f.lat ?? f.center.lat;
      const lon = f.lon ?? f.center.lon;
      const bearing = (Math.atan2(lon - userPos.lng, lat - userPos.lat) * 180) / Math.PI;
      const relative = bearing - heading;
      const dist = userPos.distanceTo(L.latLng(lat, lon));
      return { angle: relative, dist };
    }).sort((a, b) => a.dist - b.dist).slice(0, 3);

    data.forEach((d, i) => {
      const rad = (d.angle * Math.PI) / 180;
      const x = canvas.width / 2 + Math.sin(rad) * 100;
      const y = canvas.height / 2 - Math.cos(rad) * 100 * ((i + 1) / 1.5);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, canvas.height / 2);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
      ctx.lineWidth = 4;
      ctx.stroke();
    });
    if (data[0]) {
      info.textContent = `${Math.round(data[0].dist)} m to nearest water`;
    }
  }
});
