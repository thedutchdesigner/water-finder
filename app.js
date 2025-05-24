// app.js - Combined static/dynamic clustering, clickable markers, AR toggle

document.addEventListener('DOMContentLoaded', async () => {
  // Load static cache
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch {}

  const useStatic = Array.isArray(fountains) && fountains.length > 0;

  // Remove default marker shadow
  if (L.Icon.Default) delete L.Icon.Default.prototype.options.shadowUrl;

  // Initialize map
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0,0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // Layers
  let markerCluster, index;
  if (useStatic) {
    // build supercluster index
    const features = fountains.map(f => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] }
    }));
    index = new Supercluster({ radius: 60, maxZoom: 16 });
    index.load(features);
    markerCluster = L.layerGroup().addTo(map);
  } else {
    // dynamic cluster fallback
    markerCluster = L.markerClusterGroup({
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: zoom => zoom<10?120:zoom<14?80:40,
      disableClusteringAtZoom: 16
    }).addTo(map);
  }

  // Fetch dynamic fountains if needed
  const cache = new Map();
  async function fetchBB(bounds) {
    const key = [bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()]
      .map(v=>v.toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key);
    const q = `[out:json][timeout:20];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    const data = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST', body:q
    }).then(r=>r.json());
    cache.set(key, data.elements);
    return data.elements;
  }

  // Render markers based on mode
  async function updateMarkers() {
    markerCluster.clearLayers();
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    if (useStatic) {
      const clusters = index.getClusters(
        [bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],
        zoom
      );
      clusters.forEach(c => {
        const [lon,lat] = c.geometry.coordinates;
        const props = c.properties;
        if (props.cluster) {
          const cnt = props.point_count;
          const size = Math.max(30,Math.min(cnt*2,60));
          const html = `<div style="width:${size}px;height:${size}px;line-height:${size}px;">${cnt}</div>`;
          const icon = L.divIcon({ html, className:'cluster-icon', iconSize:[size,size] });
          const mk = L.marker([lat,lon],{icon})
            .on('click',()=> {
              const nz = index.getClusterExpansionZoom(props.cluster_id);
              map.setView([lat,lon],nz);
            });
          markerCluster.addLayer(mk);
        } else {
          const mk = L.circleMarker([lat,lon], {
            radius:6, fillColor:'#1976d2', fillOpacity:1, color:null
          }).on('click',()=> {
            const url = /iP(hone|ad|od)/.test(navigator.platform)
              ? `maps://maps.apple.com/?daddr=${lat},${lon}`
              : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
            window.open(url,'_blank');
          });
          markerCluster.addLayer(mk);
        }
      });
    } else {
      const elements = await fetchBB(bounds);
      elements.forEach(el =>{
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (!lat || !lon) return;
        const mk = L.marker([lat,lon]).on('click',() => {
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? `maps://maps.apple.com/?daddr=${lat},${lon}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
          window.open(url,'_blank');
        });
        markerCluster.addLayer(mk);
      });
    }
  }

  // Location and map events
  let userMarker;
  map.locate({ setView:true, maxZoom:16 });
  map.on('locationfound', e => {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, {
      radius:6, color:'blue', fillColor:'#1976d2', fillOpacity:0.9, weight:0
    }).addTo(map);
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
    mapEl.style.display='none';
    arBtn.style.display='none';
    arView.style.display='block';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'} });
      video.srcObject = stream; await video.play();
    } catch {
      alert('Camera unavailable');
      exitAR();
    }
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR(){
    if (stream) stream.getTracks().forEach(t=>t.stop());
    arView.style.display='none';
    mapEl.style.display='';
    arBtn.style.display='';
  }
});
