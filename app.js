// app.js - Smooth fade clustering and 500+ cap fix

document.addEventListener('DOMContentLoaded', () => {
  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 15);

  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Create dedicated pane for clusters with fade transition
  map.createPane('clusterPane');
  const clusterPane = map.getPane('clusterPane');
  clusterPane.style.zIndex = 650;
  clusterPane.style.transition = 'opacity 0.3s';
  clusterPane.style.opacity = '1';

  // MarkerClusterGroup with animations and spiderfy, pinned to clusterPane
  const markers = L.markerClusterGroup({
    pane: 'clusterPane',
    animate: true,
    animateAddingMarkers: true,
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 16,
    maxClusterRadius: (zoom) => zoom < 8 ? 150 : zoom < 12 ? 100 : zoom < 16 ? 50 : 30,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      const label = count > 500 ? '500+' : count;
      const size = Math.max(30, Math.min(count * 2, 60));
      return L.divIcon({
        html: `<div class="cluster-icon" style="width:${size}px; height:${size}px; line-height:${size}px;">${label}</div>`,
        className: '',
        iconSize: [size, size]
      });
    }
  }).addTo(map);

  // Cache for Overpass queries
  const bboxCache = new Map();
  async function fetchFountains(bounds) {
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(v => v.toFixed(3)).join(',');
    if (bboxCache.has(key)) return bboxCache.get(key);
    const query = `[out:json][timeout:20];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    const data = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query
    }).then(r => r.json());
    bboxCache.set(key, data.elements);
    return data.elements;
  }

  // Render/update markers with fade
  async function updateMarkers() {
    // fade out clusters
    clusterPane.style.opacity = '0';

    const bounds = map.getBounds();
    const points = await fetchFountains(bounds);

    markers.clearLayers();
    points.forEach(pt => {
      const lat = pt.lat ?? pt.center.lat;
      const lon = pt.lon ?? pt.center.lon;
      if (lat == null || lon == null) return;
      const icon = L.divIcon({ className: 'circle-icon', iconSize: [16, 16], iconAnchor: [8, 8] });
      const m = L.marker([lat, lon], { icon }).on('click', () => {
        const url = /iP(hone|ad|od)/.test(navigator.platform)
          ? `maps://maps.apple.com/?daddr=${lat},${lon}`
          : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
        window.open(url, '_blank');
      });
      markers.addLayer(m);
    });

    // fade in clusters after slight delay
    setTimeout(() => {
      clusterPane.style.opacity = '1';
    }, 300);
  }

  // On location found and map movements
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    L.circleMarker(e.latlng, { radius: 6, fillColor: 'blue', fillOpacity: 0.9, color: null }).addTo(map);
    updateMarkers();
  });
  map.on('moveend', updateMarkers);

  // AR toggle remains unchanged...
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