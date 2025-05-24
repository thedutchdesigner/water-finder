// app.js - Using pre-cached fountains.json and circle markers for performance

document.addEventListener('DOMContentLoaded', async () => {
  // Load pre-cached fountain data
  let fountainCache = [];
  try {
    const resp = await fetch('fountains.json');
    fountainCache = await resp.json();
  } catch (e) {
    console.warn('No fountains.json cache found, falling back to Overpass');
  }

  // Remove default shadow from Leaflet markers
  if (L.Icon.Default) {
    delete L.Icon.Default.prototype.options.shadowUrl;
  }

  // Initialize map
  const map = L.map('map').setView([0, 0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Smart clustering
  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    maxClusterRadius: zoom => zoom < 10 ? 120 : zoom < 14 ? 80 : 40,
    disableClusteringAtZoom: 16
  }).addTo(map);

  // User location
  let userMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, { radius: 6, color: 'blue', weight: 2 }).addTo(map);
    updateMarkers(map.getBounds());
  });

  map.on('locationerror', () => alert('Could not get your location'));

  // Debounce bound changes
  let timer;
  map.on('moveend', () => {
    clearTimeout(timer);
    timer = setTimeout(() => updateMarkers(map.getBounds()), 300);
  });

  // Update markers: use cache or Overpass
  async function updateMarkers(bounds) {
    const south = bounds.getSouth(), west = bounds.getWest(),
          north = bounds.getNorth(), east = bounds.getEast();

    let data;
    if (fountainCache.length) {
      // filter static cache
      data = fountainCache.filter(f =>
        f.lat >= south && f.lat <= north &&
        f.lon >= west  && f.lon <= east
      );
    } else {
      // fallback Overpass
      const q = `[out:json][timeout:20];
node["amenity"="drinking_water"](${south},${west},${north},${east});
out center;`;
      const resp = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
      const json = await resp.json();
      data = json.elements;
    }

    // render
    cluster.clearLayers();
    data.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat, lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      // use circleMarker for no border icon
      const circ = L.circleMarker([lat, lon], {
        radius: 6, fillColor: '#1976d2', fillOpacity: 0.9, color: null
      });
      cluster.addLayer(circ);
    });
  }

  // AR toggle unchanged...
});
