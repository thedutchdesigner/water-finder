// app.js - Stable dynamic clustering with incremental fetch

document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map').setView([0, 0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  const markers = L.markerClusterGroup({
    animate: true,
    animateAddingMarkers: true,
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 18,
    maxClusterRadius: z => z < 10 ? 150 : z < 14 ? 100 : 50,
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      const label = count > 500 ? '500+' : count;
      const size = Math.max(30, Math.min(count * 2, 60));
      return L.divIcon({
        html: `<div class="cluster-icon" style="width:${size}px;height:${size}px;line-height:${size}px;">${label}</div>`,
        iconSize: [size, size]
      });
    }
  }).addTo(map);

  const cache = new Map();
  let loading = false;

  async function fetchFountains(bounds) {
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(v => v.toFixed(3)).join(',');
    if (cache.has(key)) return cache.get(key);
    const query = `[out:json][timeout:20];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query
    });
    const data = await resp.json();
    cache.set(key, data.elements);
    return data.elements;
  }

  async function updateMarkers() {
    if (loading) return;
    loading = true;
    const bounds = map.getBounds();
    const points = await fetchFountains(bounds);
    markers.clearLayers();
    points.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const icon = L.divIcon({ className: 'circle-icon', iconSize: [16,16], iconAnchor: [8,8] });
      const m = L.marker([lat, lon], { icon }).on('click', () => {
        const url = /iP(hone|ad|od)/.test(navigator.platform)
          ? `maps://maps.apple.com/?daddr=${lat},${lon}`
          : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
        window.open(url, '_blank');
      });
      markers.addLayer(m);
    });
    loading = false;
  }

  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    L.circleMarker(e.latlng, { radius:6, fillColor:'blue', fillOpacity:0.9, color:null }).addTo(map);
    updateMarkers();
  });
  map.on('moveend', updateMarkers);

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
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
      video.srcObject = stream; await video.play();
    } catch {
      alert('Camera unavailable');
      exitAR();
    }
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR(){
    if (stream) stream.getTracks().forEach(t => t.stop());
    arView.style.display='none';
    document.getElementById('map').style.display='block';
    arBtn.style.display='block';
  }
});