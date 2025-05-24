// app.js - Static Supercluster via Web Worker + dynamic Overpass fallback

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Load static cache
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch (err) {
    console.warn('fountains.json load error', err);
  }
  const useStatic = Array.isArray(fountains) && fountains.length > 0;

  // Layers
  let markerLayer;
  let worker, workerReady = false;

  if (useStatic) {
    // Setup Web Worker for Supercluster
    worker = new Worker('cluster-worker.js');
    worker.postMessage({ type: 'load', data: fountains });
    worker.onmessage = e => {
      if (e.data.type === 'loaded') {
        workerReady = true;
        performClustering();
      } else if (e.data.type === 'clusters') {
        renderClusters(e.data.clusters);
      }
    };
    markerLayer = L.layerGroup().addTo(map);
  } else {
    // Fallback to MarkerClusterGroup with Overpass
    markerLayer = L.markerClusterGroup({
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 16,
      maxClusterRadius: z => z < 8 ? 150 : z < 12 ? 100 : z < 16 ? 50 : 30,
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        const label = count > 500 ? '500+' : count;
        const size = Math.max(30, Math.min(count * 2, 60));
        return L.divIcon({
          html: `<div class="cluster-icon" style="width:${size}px;height:${size}px;line-height:${size}px;">${label}</div>`,
          className: '',
          iconSize: [size, size]
        });
      }
    }).addTo(map);
  }

  // Overpass fetch cache
  const cache = new Map();
  async function fetchOverpass(bounds) {
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(v => v.toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key);
    const query = `
      [out:json][timeout:20];
      node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      out center;
    `;
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query
    });
    const data = await resp.json();
    cache.set(key, data.elements);
    return data.elements;
  }

  // Render for static clusters
  function performClustering() {
    if (!workerReady) return;
    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const zoom = map.getZoom();
    worker.postMessage({ type: 'getClusters', bbox, zoom });
  }

  function renderClusters(clusters) {
    markerLayer.clearLayers();
    clusters.forEach(c => {
      const [lon, lat] = c.geometry.coordinates;
      if (c.properties.cluster) {
        const cnt = c.properties.point_count;
        const label = cnt > 500 ? '500+' : cnt;
        const size = Math.max(30, Math.min(cnt * 2, 60));
        const icon = L.divIcon({
          html: `<div class="cluster-icon" style="width:${size}px;height:${size}px;line-height:${size}px;">${label}</div>`,
          className: '',
          iconSize: [size, size]
        });
        L.marker([lat, lon], { icon })
          .on('click', () => {
            const nz = worker.worker ? worker.worker.getClusterExpansionZoom(c.properties.cluster_id) : null;
            map.setView([lat, lon], nz || map.getZoom() + 2);
          })
          .addTo(markerLayer);
      } else {
        const icon = L.divIcon({ className: 'circle-icon', iconSize: [16, 16], iconAnchor: [8, 8] });
        L.marker([lat, lon], { icon })
          .on('click', () => {
            const url = /iP(hone|ad|od)/.test(navigator.platform)
              ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
              : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
            window.open(url, '_blank');
          })
          .addTo(markerLayer);
      }
    });
  }

  // Fetch & render for dynamic fallback
  async function updateDynamic() {
    const points = await fetchOverpass(map.getBounds());
    markerLayer.clearLayers();
    points.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      const m = L.marker([lat, lon])
        .on('click', () => {
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
            : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
          window.open(url, '_blank');
        });
      markerLayer.addLayer(m);
    });
  }

  // Map event handlers
  map.on('moveend zoomend', () => {
    useStatic ? performClustering() : updateDynamic();
  });

  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    L.circleMarker(e.latlng, { radius: 6, fillColor: 'blue', fillOpacity: 0.9, color: null }).addTo(map);
    useStatic ? performClustering() : updateDynamic();
  });

  // AR toggle unchanged
  const arBtn = document.getElementById('ar-button'),
        arView = document.getElementById('ar-view'),
        exitBtn = document.getElementById('exit-ar'),
        video = document.getElementById('ar-video');
  let stream;
  arBtn.addEventListener('click', async () => {
    mapEl.style.display = 'none';
    arBtn.style.display = 'none';
    arView.style.display = 'block';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } });
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
