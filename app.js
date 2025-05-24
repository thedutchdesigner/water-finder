// app.js - Performance-optimized with smart clustering and no marker shadows

document.addEventListener('DOMContentLoaded', () => {
  // Remove default shadow from all Leaflet default icons
  if (L.Icon.Default) {
    delete L.Icon.Default.prototype.options.shadowUrl;
  }

  // --- Initialize map ---
  const mapDiv = document.getElementById('map');
  const map = L.map(mapDiv).setView([0, 0], 15); // start at a reasonable zoom

  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // --- Smart clustering setup ---
  const markerCluster = L.markerClusterGroup({
    // Enables chunked loading for performance
    chunkedLoading: true,
    chunkInterval: 200,
    chunkProgress: (processed, total, elapsed) => {
      // optional: console.log(`Clustered ${processed}/${total} markers`);
    },
    removeOutsideVisibleBounds: true,
    // Dynamic cluster radius depending on zoom
    maxClusterRadius: (zoom) => {
      // larger clusters when zoomed out
      return zoom < 10 ? 120 : zoom < 14 ? 80 : 40;
    },
    // Disable clustering beyond a zoom level
    disableClusteringAtZoom: 16
  });
  map.addLayer(markerCluster);

  // --- Geolocation & Overpass fetching ---
  let locationMarker;
  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng, { radius: 6, color: 'blue', weight: 2 }).addTo(map);
    // fetch surroundings on location found
    fetchBBoxFountains(map.getBounds());
  });
  map.on('locationerror', () => alert('Could not get your location'));

  // Debounced fetch when map stops moving
  let fetchTimeout;
  map.on('moveend', () => {
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      fetchBBoxFountains(map.getBounds());
    }, 300);
  });

  // Cache for bounding-box requests
  const bboxCache = new Map();

  async function fetchBBoxFountains(bounds) {
    const key = [
      bounds.getSouth().toFixed(4),
      bounds.getWest().toFixed(4),
      bounds.getNorth().toFixed(4),
      bounds.getEast().toFixed(4)
    ].join(',');
    if (bboxCache.has(key)) {
      renderMarkers(bboxCache.get(key));
      return;
    }
    const query = `[out:json][timeout:20];
(
  node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
);
out center;`;
    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: query
      });
      const data = await resp.json();
      bboxCache.set(key, data.elements);
      renderMarkers(data.elements);
    } catch (err) {
      console.error('Overpass error', err);
    }
  }

  function renderMarkers(elements) {
    markerCluster.clearLayers();
    elements.forEach(el => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) return;
      const marker = L.marker([lat, lon]);
      markerCluster.addLayer(marker);
    });
  }

  // --- AR toggle (camera only) ---
  const arBtn = document.getElementById('ar-button');
  const arView = document.getElementById('ar-view');
  const exitBtn = document.getElementById('exit-ar');
  const video = document.getElementById('ar-video');
  let stream;

  arBtn.addEventListener('click', async () => {
    map.getContainer().style.display = 'none';
    arBtn.style.display = 'none';
    arView.style.display = 'block';
    exitBtn.style.display = 'block';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      console.error('Camera error', e);
      alert('Camera unavailable');
    }
  });

  exitBtn.addEventListener('click', () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    arView.style.display = 'none';
    exitBtn.style.display = 'none';
    map.getContainer().style.display = '';
    arBtn.style.display = '';
  });
});
