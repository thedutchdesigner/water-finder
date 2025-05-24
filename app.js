// app.js - Use SVG vector icons for markers with Supercluster/dynamic fallback

document.addEventListener('DOMContentLoaded', async () => {
  // Load static fountain data
  let fountains = [];
  try { fountains = await fetch('fountains.json').then(r => r.json()); } catch {}

  const useStatic = Array.isArray(fountains) && fountains.length > 0;

  // SVG marker HTML
  const svgIconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path d="M12 0C8 0 0 9.6 0 14.4S5.4 24 12 24s12-6.6 12-9.6S16 0 12 0z" fill="#1976d2"/>
  </svg>`;

  // Prepare supercluster if static
  let superIndex, markerLayer;
  if (useStatic) {
    const features = fountains.map(f => ({
      type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [f.lon, f.lat] }
    }));
    superIndex = new Supercluster({ radius: 60, maxZoom: 16 });
    superIndex.load(features);
    markerLayer = L.layerGroup().addTo(map);
  } else {
    markerLayer = L.markerClusterGroup({
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: z => z < 10 ? 120 : z < 14 ? 80 : 40,
      disableClusteringAtZoom: 16
    }).addTo(map);
  }

  // Initialize map
  const map = L.map('map').setView([0, 0], 15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  // Cache for dynamic Overpass
  const cache = new Map();
  async function fetchDynamic(bounds) {
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(v => v.toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key);
    const q = `[out:json][timeout:20];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    const data = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q })
      .then(r => r.json());
    cache.set(key, data.elements);
    return data.elements;
  }

  async function updateMarkers() {
    markerLayer.clearLayers();
    const bounds = map.getBounds(), zoom = map.getZoom();

    if (useStatic) {
      superIndex.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom
      ).forEach(c => {
        const [lon, lat] = c.geometry.coordinates;
        const props = c.properties;
        if (props.cluster) {
          const cnt = props.point_count;
          const size = Math.max(30, Math.min(cnt * 2, 60));
          const html = `<div style="width:${size}px;height:${size}px;line-height:${size}px;">${cnt}</div>`;
          const icon = L.divIcon({ html, className: 'cluster-icon', iconSize: [size, size] });
          L.marker([lat, lon], { icon })
            .on('click', () => map.setView([lat, lon], superIndex.getClusterExpansionZoom(props.cluster_id)))
            .addTo(markerLayer);
        } else {
          const icon = L.divIcon({ html: svgIconHtml, className: 'custom-marker', iconSize: [24, 36], iconAnchor: [12, 36] });
          L.marker([lat, lon], { icon })
            .on('click', () => {
              const url = /iP(hone|ad|od)/.test(navigator.platform)
                ? `maps://maps.apple.com/?daddr=${lat},${lon}`
                : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
              window.open(url, '_blank');
            })
            .addTo(markerLayer);
        }
      });
    } else {
      const pts = await fetchDynamic(bounds);
      pts.forEach(pt => {
        const lat = pt.lat ?? pt.center.lat, lon = pt.lon ?? pt.center.lon;
        const icon = L.divIcon({ html: svgIconHtml, className: 'custom-marker', iconSize: [24, 36], iconAnchor: [12, 36] });
        L.marker([lat, lon], { icon })
          .on('click', () => {
            const url = /iP(hone|ad|od)/.test(navigator.platform)
              ? `maps://maps.apple.com/?daddr=${lat},${lon}`
              : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
            window.open(url, '_blank');
          })
          .addTo(markerLayer);
      });
    }
  }

  // Map events
  let userMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, { radius: 6, fillColor: 'blue', fillOpacity: 0.9, color: null }).addTo(map);
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
    try { stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }); video.srcObject = stream; await video.play(); }
    catch { alert('Camera unavailable'); exitAR(); }
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    arView.style.display = 'none';
    document.getElementById('map').style.display = '';
    arBtn.style.display = '';
  }
});

// End of app.js
