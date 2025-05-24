// app.js - High-performance clustering with Supercluster and clickable markers

document.addEventListener('DOMContentLoaded', async () => {
  // Load static fountains cache
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch (e) {
    console.warn('fountains.json not found, no static cache');
  }

  // Build Supercluster index
  const geoFeatures = fountains.map(f => ({
    type: 'Feature',
    properties: { },
    geometry: { type: 'Point', coordinates: [f.lon, f.lat] }
  }));
  const index = new Supercluster({ radius: 60, maxZoom: 16 });
  index.load(geoFeatures);

  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0,0], 15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom:19, attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  // Marker layer
  const markersLayer = L.layerGroup().addTo(map);

  // User location
  let userMarker;
  map.locate({ setView:true, maxZoom:16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, { radius: 6, color: 'blue', fillColor: '#1976d2', fillOpacity:0.9, weight:0 }).addTo(map);
    updateClusters();
  });
  map.on('locationerror', () => alert('Location unavailable'));

  // Update clusters on moveend
  map.on('moveend', () => updateClusters());

  function updateClusters() {
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    markersLayer.clearLayers();

    // get clusters
    const clusters = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom
    );

    clusters.forEach(c => {
      const [lon, lat] = c.geometry.coordinates;
      const props = c.properties;

      if (props.cluster) {
        const count = props.point_count;
        const size = Math.max(30, Math.min(count * 2, 60));
        const html = `<div style="width:${size}px;height:${size}px;line-height:${size}px;">${count}</div>`;
        const icon = L.divIcon({ html, className: 'cluster-icon', iconSize: [size, size] });
        const marker = L.marker([lat, lon], { icon });
        marker.on('click', () => {
          const newZoom = index.getClusterExpansionZoom(props.cluster_id);
          map.setView([lat, lon], newZoom);
        });
        markersLayer.addLayer(marker);
      } else {
        // individual fountain
        const marker = L.circleMarker([lat, lon], {
          radius: 6, color: 'white', fillColor: '#1976d2', fillOpacity:1, weight:0
        });
        marker.on('click', () => {
          // navigate link
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? `maps://maps.apple.com/?daddr=${lat},${lon}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
          window.open(url, '_blank');
        });
        markersLayer.addLayer(marker);
      }
    });
  }

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
      stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'} });
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
    mapEl.style.display = '';
    arBtn.style.display = '';
  }
});
