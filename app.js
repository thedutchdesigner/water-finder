// app.js - Initializing on DOMContentLoaded with AR support

document.addEventListener('DOMContentLoaded', () => {
  try {
    // 1. Initialize map
    const map = L.map('map').setView([0, 0], 2);
    L.tileLayer(
      'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
    ).addTo(map);

    // 2. MarkerCluster
    const markersCluster = L.markerClusterGroup({ maxClusterRadius: 50 });
    map.addLayer(markersCluster);

    // 3. Location
    let locationMarker;
    map.locate({ setView: true, maxZoom: 16 });
    map.on('locationerror', () => console.error('Location error'));
    map.on('locationfound', (e) => {
      if (locationMarker) map.removeLayer(locationMarker);
      locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
      fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
    });

    // 4. BBox fetch debounce + cache
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

    // Fetch functions
    async function fetchNearby(lat, lon, radius) {
      const q = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
      try {
        const resp = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
        const data = await resp.json();
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
        const resp = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
        const data = await resp.json();
        bboxCache.set(key, data.elements);
        renderMarkers(data.elements);
      } catch (err) { console.error(err); }
    }

    // Render markers
    function renderMarkers(elements) {
      markersCluster.clearLayers();
      window._fountains = elements;
      elements.forEach((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat==null || lon==null) return;
        const name = el.tags?.name || 'Drinking water';
        const marker = L.marker([lat, lon]).bindPopup(
          `<strong>${name}</strong><br/><button onclick="navigate(${lat},${lon})">Navigate</button>`
        );
        markersCluster.addLayer(marker);
      });
    }

    // Navigate
    window.navigate = (lat, lon) => {
      const url = /iP(hone|ad|od)/.test(navigator.platform)
        ? `maps://maps.apple.com/?daddr=${lat},${lon}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
      window.open(url, '_blank');
    };

    // AR setup
    const arBtn = document.getElementById('ar-button');
    const arView = document.getElementById('ar-view');
    const arVideo = document.getElementById('ar-video');
    const arCanvas = document.getElementById('ar-overlay');
    const arInfo = document.getElementById('ar-info');
    let arStream, watcher;

    arBtn.addEventListener('click', async () => {
      console.log('AR button clicked');
      if (arView.style.display === 'none') {
        arView.style.display = 'block';
        arCanvas.width = window.innerWidth;
        arCanvas.height = window.innerHeight;
        try {
          console.log('Request camera');
          arStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, audio: false
          });
          arVideo.srcObject = arStream;
          await arVideo.play();
          console.log('Video playing');

          if (DeviceOrientationEvent.requestPermission) {
            console.log('Request orientation');
            const resp = await DeviceOrientationEvent.requestPermission();
            console.log('Orientation response', resp);
            if (resp !== 'granted') throw new Error('Orientation permission denied');
          }

          startAR();
        } catch (e) {
          console.error('AR init error', e);
          alert('AR mode not available: ' + e.message);
          arView.style.display = 'none';
          if (arStream) arStream.getTracks().forEach(t => t.stop());
        }
      } else {
        arView.style.display = 'none';
        if (arStream) arStream.getTracks().forEach(t => t.stop());
        if (watcher) {
          window.removeEventListener('deviceorientationabsolute', watcher);
          window.removeEventListener('deviceorientation', watcher);
        }
      }
    });

    function startAR() {
      watcher = (ev) => {
        const heading = ev.alpha ?? ev.webkitCompassHeading ?? 0;
        drawAR(heading);
      };
      window.addEventListener('deviceorientationabsolute', watcher, true);
      window.addEventListener('deviceorientation', watcher, true);
    }

    function drawAR(heading) {
      const ctx = arCanvas.getContext('2d');
      ctx.clearRect(0, 0, arCanvas.width, arCanvas.height);
      const fountains = window._fountains || [];
      if (!locationMarker) return;
      const userPos = locationMarker.getLatLng();
      const data = fountains.map((f) => {
        const lat = f.lat ?? f.center?.lat;
        const lon = f.lon ?? f.center?.lon;
        const bearing = (Math.atan2(lon - userPos.lng, lat - userPos.lat) * 180) / Math.PI;
        const relative = bearing - heading;
        const dist = userPos.distanceTo(L.latLng(lat, lon));
        return { angle: relative, dist };
      }).sort((a,b) => a.dist - b.dist).slice(0,3);

      data.forEach((d,i) => {
        const angleRad = (d.angle * Math.PI) / 180;
        const x = arCanvas.width/2 + Math.sin(angleRad)*100;
        const y = arCanvas.height/2 - Math.cos(angleRad)*100*((i+1)/1.5);
        ctx.beginPath();
        ctx.moveTo(arCanvas.width/2, arCanvas.height/2);
        ctx.lineTo(x,y);
        ctx.strokeStyle = 'rgba(0,123,255,0.7)';
        ctx.lineWidth = 4;
        ctx.stroke();
      });

      if (data[0]) {
        arInfo.textContent = `${Math.round(data[0].dist)} m to nearest water`;
      }
    }
  } catch (e) {
    console.error('Initialization error', e);
  }
});