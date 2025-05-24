// app.js - AR click handler refactored so DeviceOrientationEvent.requestPermission()
// is called immediately on user gesture, then camera and play, then start AR.

// DOMContentLoaded wrapper
document.addEventListener('DOMContentLoaded', () => {
  // Initialize map
  const map = L.map('map').setView([0, 0], 2);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // MarkerCluster
  const markersCluster = L.markerClusterGroup({ maxClusterRadius: 50 });
  map.addLayer(markersCluster);

  // Location
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationerror', () => console.error('Location error'));
  map.on('locationfound', (e) => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue' }).addTo(map);
    fetchNearby(e.latlng.lat, e.latlng.lng, 1000);
  });

  // Debounce bbox fetch
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

  // Fetch radius
  async function fetchNearby(lat, lon, radius) {
    const q = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const data = await r.json();
      renderMarkers(data.elements);
    } catch (err) { console.error(err); }
  }

  // Fetch bbox
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

  // Render markers
  function renderMarkers(elements) {
    markersCluster.clearLayers();
    window._fountains = elements;
    elements.forEach(el => {
      const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
      if (lat==null||lon==null) return;
      const name = el.tags?.name || 'Drinking water';
      markersCluster.addLayer(
        L.marker([lat, lon]).bindPopup(
          `<strong>${name}</strong><br/><button onclick="navigate(${lat},${lon})">Navigate</button>`
        )
      );
    });
  }

  // Navigate
  window.navigate = (lat, lon) => {
    const isIOS = /iP(hone|od|ad)/.test(navigator.platform);
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url,'_blank');
  };

  // AR elements
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const arVideo = document.getElementById('ar-video');
  const arCanvas = document.getElementById('ar-overlay');
  const arInfo = document.getElementById('ar-info');
  let arStream, watcher;

  // AR click handler: request orientation permission first
  arBtn.addEventListener('click', () => {
    if (arView.style.display === 'none') {
      // request orientation permission as user gesture
      const orientPromise = (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function')
        ? DeviceOrientationEvent.requestPermission()
        : Promise.resolve('granted');

      orientPromise.then(resp => {
        if (resp !== 'granted') throw new Error('Orientation permission denied');
        // then request camera
        return navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'}, audio:false });
      })
      .then(stream => {
        arStream = stream;
        arVideo.srcObject = stream;
        return arVideo.play();
      })
      .then(() => {
        arView.style.display = 'block';
        arCanvas.width = window.innerWidth;
        arCanvas.height = window.innerHeight;
        startAR();
      })
      .catch(err => {
        console.error('AR init error', err);
        alert('AR mode not available: ' + err.message);
        if (arStream) arStream.getTracks().forEach(t => t.stop());
      });
    } else {
      // exit AR
      arView.style.display = 'none';
      if (arStream) arStream.getTracks().forEach(t => t.stop());
      if (watcher) {
        window.removeEventListener('deviceorientationabsolute', watcher);
        window.removeEventListener('deviceorientation', watcher);
      }
    }
  });

  // startAR and drawAR unchanged...
  function startAR() {
    watcher = ev => drawAR(ev.alpha ?? ev.webkitCompassHeading ?? 0);
    window.addEventListener('deviceorientationabsolute', watcher, true);
    window.addEventListener('deviceorientation', watcher, true);
  }

  function drawAR(heading) {
    const ctx = arCanvas.getContext('2d');
    ctx.clearRect(0,0,arCanvas.width,arCanvas.height);
    const fountains = window._fountains || [];
    if (!locationMarker) return;
    const userPos = locationMarker.getLatLng();
    const data = fountains.map(f => {
      const lat = f.lat ?? f.center.lat, lon=f.lon ?? f.center.lon;
      const bearing = (Math.atan2(lon-userPos.lng, lat-userPos.lat)*180)/Math.PI;
      return { angle:bearing-heading, dist:userPos.distanceTo(L.latLng(lat,lon)) };
    }).sort((a,b)=>a.dist-b.dist).slice(0,3);

    data.forEach((d,i)=>{
      const rad=(d.angle*Math.PI)/180;
      const x=arCanvas.width/2+Math.sin(rad)*100;
      const y=arCanvas.height/2-Math.cos(rad)*100*((i+1)/1.5);
      ctx.beginPath();ctx.moveTo(arCanvas.width/2,arCanvas.height/2);
      ctx.lineTo(x,y);ctx.strokeStyle='rgba(0,123,255,0.7)';ctx.lineWidth=4;ctx.stroke();
    });
    if(data[0]) arInfo.textContent=\`\${Math.round(data[0].dist)} m to nearest water\`;
  }
});

