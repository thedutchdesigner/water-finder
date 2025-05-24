// app.js - Main script using Web Worker for clustering

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Leaflet map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Prepare marker layer
  const markerLayer = L.layerGroup().addTo(map);

  // Load fountain cache
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch (err) {
    console.error('Failed to load fountains.json', err);
    alert('Static data not found.');
    return;
  }

  // Initialize Web Worker
  const worker = new Worker('cluster-worker.js');
  let workerReady = false;
  worker.postMessage({ type: 'load', data: fountains });

  worker.onmessage = (e) => {
    const { type, clusters } = e.data;
    if (type === 'loaded') {
      workerReady = true;
      // Trigger initial clustering after worker ready
      if (map._lastCenter) performClustering();
    } else if (type === 'clusters') {
      renderClusters(clusters);
    }
  };

  // Utility to request clusters
  function performClustering() {
    if (!workerReady) return;
    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const zoom = map.getZoom();
    worker.postMessage({ type: 'getClusters', bbox, zoom });
  }

  // Render clusters on map
  function renderClusters(clusters) {
    markerLayer.clearLayers();
    clusters.forEach(c => {
      const [lon, lat] = c.geometry.coordinates;
      const props = c.properties;
      if (props.cluster) {
        const count = props.point_count;
        const label = count > 500 ? '500+' : count;
        const size = Math.max(30, Math.min(count * 2, 60));
        const icon = L.divIcon({
          html: `<div class="cluster-icon" style="width:${size}px; height:${size}px; line-height:${size}px;">${label}</div>`,
          className: '',
          iconSize: [size, size]
        });
        L.marker([lat, lon], { icon }).on('click', () => {
          const expansionZoom = index.getClusterExpansionZoom(props.cluster_id);
          map.setView([lat, lon], expansionZoom);
        }).addTo(markerLayer);
      } else {
        // individual point
        const icon = L.divIcon({
          className: 'circle-icon',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        L.marker([lat, lon], { icon }).on('click', () => {
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? `maps://maps.apple.com/?daddr=${lat},${lon}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
          window.open(url, '_blank');
        }).addTo(markerLayer);
      }
    });
  }

  // Listen for map events
  map.on('moveend', performClustering);
  map.on('zoomend', performClustering);

  // Location found event
  let userMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, { radius: 6, fillColor: 'blue', fillOpacity: 0.9, color: null }).addTo(map);
    performClustering();
  });

  // AR toggle (camera only)
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const exitBtn = document.getElementById('exit-ar');
  const video = document.getElementById('ar-video');
  let stream;
  arBtn.addEventListener('click', async () => {
    mapEl.style.display = 'none';
    arBtn.style.display = 'none';
    arView.style.display = 'block';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
    } catch {
      alert('Camera unavailable');
      exitAR();
    }
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    arView.style.display = 'none';
    mapEl.style.display = 'block';
    arBtn.style.display = 'block';
  }
});
