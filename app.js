document.addEventListener('DOMContentLoaded', () => {
  // Initialize map
  const map = L.map('map').setView([0, 0], 15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  // Marker cluster group
  const markers = L.markerClusterGroup({
    animate: true,
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    disableClusteringAtZoom: 16,
    maxClusterRadius: (zoom) => zoom < 10 ? 150 : zoom < 14 ? 100 : 50,
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

  // Cache for Overpass responses
  const cache = new Map();
  async function fetchFountains() {
    const b = map.getBounds();
    const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
      .map(v => v.toFixed(3)).join(',');
    if (cache.has(key)) return cache.get(key);
    const query = `[out:json][timeout:20];
node["amenity"="drinking_water"](${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()});
out center;`;
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query
    });
    const data = await resp.json();
    cache.set(key, data.elements);
    return data.elements;
  }

  // Update markers
  let loading = false;
  async function updateMarkers() {
    if (loading) return;
    loading = true;
    const pts = await fetchFountains();
    markers.clearLayers();
    pts.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const icon = L.divIcon({ className: 'circle-icon', iconSize: [16,16], iconAnchor: [8,8] });
      L.marker([lat, lon], { icon })
        .on('click', () => {
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? `maps://maps.apple.com/?daddr=${lat},${lon}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
          window.open(url, '_blank');
        })
        .addTo(markers);
    });
    loading = false;
  }

  // Map events
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', () => updateMarkers());
  map.on('moveend', () => updateMarkers());

  // AR toggle
  const arBtn = document.getElementById('ar-button'),
        arView = document.getElementById('ar-view'),
        exitBtn = document.getElementById('exit-ar'),
        video = document.getElementById('ar-video');
  let stream;
  arBtn.addEventListener('click', async () => {
    document.getElementById('map').style.display = 'none';
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
    document.getElementById('map').style.display = 'block';
    arBtn.style.display = 'block';
  }
});
