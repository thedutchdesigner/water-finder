// app.js - Use circleMarkers for individual points, supercluster for performance

document.addEventListener('DOMContentLoaded', async () => {
  // Load static fountain data
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch (e) {
    console.warn('No fountains.json found; dynamic fetch in use.');
  }
  const useStatic = Array.isArray(fountains) && fountains.length > 0;

  // Remove default marker shadows
  if (L.Icon.Default) delete L.Icon.Default.prototype.options.shadowUrl;

  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  // Prepare marker container
  let markerLayer, superIndex;
  if (useStatic) {
    // Build supercluster index
    const features = fountains.map(f => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] }
    }));
    superIndex = new Supercluster({ radius: 60, maxZoom: 16 });
    superIndex.load(features);
    markerLayer = L.layerGroup().addTo(map);
  } else {
    // Use markerClusterGroup for dynamic
    markerLayer = L.markerClusterGroup({
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: zoom => zoom < 10 ? 120 : zoom < 14 ? 80 : 40,
      disableClusteringAtZoom: 16
    }).addTo(map);
  }

  // Cache for dynamic bounding-box fetch
  const bboxCache = new Map();

  async function fetchDynamic(bounds) {
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(v => v.toFixed(4)).join(',');
    if (bboxCache.has(key)) return bboxCache.get(key);

    const q = \`[out:json][timeout:20];
node["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});
out center;\`;
    const data = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: q
    }).then(r => r.json());
    bboxCache.set(key, data.elements);
    return data.elements;
  }

  // Render markers based on static or dynamic
  async function updateMarkers() {
    markerLayer.clearLayers();
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    if (useStatic) {
      const clusters = superIndex.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom
      );
      clusters.forEach(c => {
        const [lon, lat] = c.geometry.coordinates;
        const props = c.properties;
        if (props.cluster) {
          // cluster icon stays
          const count = props.point_count;
          const size = Math.max(30, Math.min(count * 2, 60));
          const html = `<div style="width:${size}px;height:${size}px;line-height:${size}px;">${count}</div>`;
          const icon = L.divIcon({ html, className: 'cluster-icon', iconSize: [size, size] });
          const m = L.marker([lat, lon], { icon }).on('click', () => {
            const nz = superIndex.getClusterExpansionZoom(props.cluster_id);
            map.setView([lat, lon], nz);
          });
          markerLayer.addLayer(m);
        } else {
          // individual - circle marker
          const m = L.circleMarker([lat, lon], {
            radius: 6, fillColor: '#1976d2', fillOpacity: 1, color: null
          }).on('click', () => {
            const url = /iP(hone|ad|od)/.test(navigator.platform)
              ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
              : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
            window.open(url, '_blank');
          });
          markerLayer.addLayer(m);
        }
      });
    } else {
      const points = await fetchDynamic(bounds);
      points.forEach(pt => {
        const lat = pt.lat ?? pt.center?.lat;
        const lon = pt.lon ?? pt.center?.lon;
        if (lat == null || lon == null) return;
        const m = L.circleMarker([lat, lon], {
          radius: 6, fillColor: '#1976d2', fillOpacity: 1, color: null
        }).on('click', () => {
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
            : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
          window.open(url, '_blank');
        });
        markerLayer.addLayer(m);
      });
    }
  }

  // On location and map moves
  let userMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, {
      radius: 6, fillColor: 'blue', fillOpacity: 0.9, color: null
    }).addTo(map);
    updateMarkers();
  });
  map.on('moveend', updateMarkers);

  // AR toggle
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
    mapEl.style.display = '';
    arBtn.style.display = '';
  }
});

// End of app.js
