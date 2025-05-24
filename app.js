// app.js - Restore default marker icons and proper icon URLs

document.addEventListener('DOMContentLoaded', async () => {
  // Ensure default marker icons load correctly
  if (L.Icon.Default) {
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
      iconUrl:        'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
      shadowUrl:      'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png'
    });
  }

  // Load static fountain cache if available
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch {}

  const useStatic = Array.isArray(fountains) && fountains.length > 0;

  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0,0], 15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  // Prepare marker layer
  let markerLayer, superIndex;
  if (useStatic) {
    // Supercluster for performance
    const features = fountains.map(f => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] }
    }));
    superIndex = new Supercluster({ radius: 60, maxZoom: 16 });
    superIndex.load(features);
    markerLayer = L.layerGroup().addTo(map);
  } else {
    // MarkerClusterGroup fallback
    markerLayer = L.markerClusterGroup({
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: z => z < 10 ? 120 : z < 14 ? 80 : 40,
      disableClusteringAtZoom: 16
    }).addTo(map);
  }

  // Cache for dynamic Overpass fetches
  const bboxCache = new Map();
  async function fetchDynamic(bounds) {
    const key = [bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()]
      .map(v=>v.toFixed(4)).join(',');
    if (bboxCache.has(key)) return bboxCache.get(key);

    const query = `[out:json][timeout:20];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    const data = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    }).then(res => res.json());
    bboxCache.set(key, data.elements);
    return data.elements;
  }

  // Render markers
  async function updateMarkers() {
    markerLayer.clearLayers();
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    if (useStatic) {
      // Static Supercluster
      const clusters = superIndex.getClusters(
        [bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],
        zoom
      );
      clusters.forEach(c => {
        const [lon,lat] = c.geometry.coordinates;
        const props = c.properties;
        if (props.cluster) {
          const count = props.point_count;
          const size = Math.max(30, Math.min(count * 2, 60));
          const html = `<div style="width:${size}px;height:${size}px;line-height:${size}px;">${count}</div>`;
          const icon = L.divIcon({ html, className: 'cluster-icon', iconSize: [size, size] });
          const mk = L.marker([lat,lon], { icon })
            .on('click', () => {
              const nZoom = superIndex.getClusterExpansionZoom(props.cluster_id);
              map.setView([lat,lon], nZoom);
            });
          markerLayer.addLayer(mk);
        } else {
          const mk = L.marker([lat,lon]) // default icon
            .on('click', () => {
              const url = /iP(hone|ad|od)/.test(navigator.platform)
                ? `maps://maps.apple.com/?daddr=${lat},${lon}`
                : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
              window.open(url, '_blank');
            });
          markerLayer.addLayer(mk);
        }
      });
    } else {
      // Dynamic Overpass
      const points = await fetchDynamic(map.getBounds());
      points.forEach(pt => {
        const lat = pt.lat ?? pt.center.lat;
        const lon = pt.lon ?? pt.center.lon;
        if (lat == null || lon == null) return;
        const mk = L.marker([lat,lon])
          .on('click', () => {
            const url = /iP(hone|ad|od)/.test(navigator.platform)
              ? `maps://maps.apple.com/?daddr=${lat},${lon}`
              : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
            window.open(url, '_blank');
          });
        markerLayer.addLayer(mk);
      });
    }
  }

  // On location found
  let userMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, {
      radius: 6,
      fillColor: 'blue',
      fillOpacity: 0.9,
      color: null
    }).addTo(map);
    updateMarkers();
  });
  map.on('moveend', updateMarkers);

  // AR toggle remains unchanged...

});