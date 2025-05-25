// app.js - Static clustering with Web Worker

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Load fountains.json
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch (err) {
    console.error('Failed to load fountains.json', err);
    return;
  }

  // Setup Supercluster worker
  const worker = new Worker('cluster-worker.js');
  let workerReady = false;
  worker.onmessage = (e) => {
    const { type, clusters } = e.data;
    if (type === 'loaded') {
      workerReady = true;
      requestClusters();
    } else if (type === 'clusters') {
      renderClusters(clusters);
    }
  };
  worker.postMessage({ type: 'load', data: fountains });

  // Marker layer
  const markerLayer = L.layerGroup().addTo(map);

  // Request clusters
  function requestClusters() {
    if (!workerReady) return;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    worker.postMessage({ type: 'getClusters', bbox, zoom: map.getZoom() });
  }

  // Render clusters
  function renderClusters(clusters) {
    markerLayer.clearLayers();
    clusters.forEach(c => {
      const [lon, lat] = c.geometry.coordinates;
      const props = c.properties;
      if (props.cluster) {
        const cnt = props.point_count;
        const label = cnt > 500 ? '500+' : cnt;
        const size = Math.max(30, Math.min(cnt * 2, 60));
        const icon = L.divIcon({
          html: `<div class="cluster-icon" style="width:${size}px;height:${size}px;line-height:${size}px;">${label}</div>`,
          className:'', iconSize:[size, size]
        });
        L.marker([lat, lon], { icon })
          .on('click', () => {
            map.setView([lat, lon], map.getZoom() + 2);
          }).addTo(markerLayer);
      } else {
        const icon = L.divIcon({ className:'circle-icon', iconSize:[16,16], iconAnchor:[8,8] });
        L.marker([lat, lon], { icon })
          .on('click', () => {
            const url = /iP(hone|ad|od)/.test(navigator.platform)
              ? `maps://maps.apple.com/?daddr=${lat},${lon}`
              : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
            window.open(url, '_blank');
          }).addTo(markerLayer);
      }
    });
  }

  // Map events
  map.locate({ setView:true, maxZoom:16 });
  map.on('locationfound', e => {
    L.circleMarker(e.latlng, { radius:6, fillColor:'blue', fillOpacity:0.9, color:null }).addTo(map);
    requestClusters();
  });
  map.on('moveend zoomend', () => requestClusters());

  // AR toggle
  const arBtn = document.getElementById('ar-button'),
        arView = document.getElementById('ar-view'),
        exitBtn = document.getElementById('exit-ar'),
        video = document.getElementById('ar-video');
  let stream;
  arBtn.addEventListener('click', async () => {
    mapEl.style.display='none'; arBtn.style.display='none'; arView.style.display='block';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'} });
      video.srcObject = stream; await video.play();
    } catch { alert('Camera unavailable'); exitAR(); }
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR() {
    if (stream) stream.getTracks().forEach(t=>t.stop());
    arView.style.display='none'; mapEl.style.display='block'; arBtn.style.display='block';
  }
});
