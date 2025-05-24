// app.js - Basic map and AR toggle without cluster to ensure map loads

document.addEventListener('DOMContentLoaded', function() {
  // Check Leaflet
  if (typeof L === 'undefined') {
    alert('Leaflet failed to load');
    return;
  }

  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 2);

  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Location marker
  let locationMarker;

  map.locate({ setView: true, maxZoom: 16 });

  map.on('locationfound', function(e) {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 2000);
  });

  map.on('locationerror', function() {
    alert('Could not get your location');
  });

  // Debounced bbox fetch
  let fetchTimer;
  const cache = {};

  map.on('moveend', function() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(function() {
      const b = map.getBounds();
      const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
        .map(v => v.toFixed(3)).join(',');
      if (cache[key]) {
        renderMarkers(cache[key]);
      } else {
        fetchFountains(b, key);
      }
    }, 500);
  });

  async function fetchNearby(lat, lon, r) {
    const q = `[out:json][timeout:15];
node["amenity"="drinking_water"](around:${r},${lat},${lon});
out center;`;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const data = await res.json();
      renderMarkers(data.elements);
    } catch (err) {
      console.error('fetchNearby error', err);
    }
  }

  async function fetchFountains(bounds, key) {
    const q = `[out:json][timeout:25];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
      const data = await res.json();
      cache[key] = data.elements;
      renderMarkers(data.elements);
    } catch (err) {
      console.error('fetchFountains error', err);
    }
  }

  function renderMarkers(list) {
    list.forEach(pt => {
      const lat = pt.lat ?? pt.center.lat;
      const lon = pt.lon ?? pt.center.lon;
      if (!lat || !lon) return;
      L.marker([lat, lon]).addTo(map).bindPopup('Water fountain');
    });
  }

  // AR Toggle
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const exitBtn = document.getElementById('exit-ar');
  const vid = document.getElementById('ar-video');
  const overlay = document.getElementById('ar-overlay');
  const info = document.getElementById('ar-info');
  let stream, orientationHandler;

  arBtn.addEventListener('click', async function() {
    mapEl.style.display = 'none';
    arBtn.style.display = 'none';
    arView.style.display = 'block';
    exitBtn.style.display = 'block';
    info.style.display = 'block';

    // start camera
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      vid.srcObject = stream;
      await vid.play();
    } catch (e) {
      alert('Camera unavailable');
      exitAR();
      return;
    }

    // show static overlay?
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
  });

  exitBtn.addEventListener('click', exitAR);

  function exitAR() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    vid.srcObject = null;
    arView.style.display = 'none';
    exitBtn.style.display = 'none';
    info.style.display = 'none';
    mapEl.style.display = 'block';
    arBtn.style.display = 'block';
    if (orientationHandler) {
      window.removeEventListener('deviceorientationabsolute', orientationHandler, true);
      window.removeEventListener('deviceorientation', orientationHandler, true);
    }
  }
});
