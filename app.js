// app.js - Refined: remove default icons, use circleMarker & supercluster

document.addEventListener('DOMContentLoaded', async () => {
  // Globally disable default icon images
  if (L.Icon.Default) {
    delete L.Icon.Default.prototype.options.iconUrl;
    delete L.Icon.Default.prototype.options.shadowUrl;
    // Ensure no fallback CSS background
    L.Icon.Default.mergeOptions({ className: '' });
  }

  // Load static data
  let fountains = [];
  try {
    fountains = await fetch('fountains.json').then(r => r.json());
  } catch {}

  const useStatic = Array.isArray(fountains) && fountains.length > 0;

  // Build supercluster if static
  let superIndex, markerLayer;
  if (useStatic) {
    const features = fountains.map(f => ({ type:'Feature', properties:{}, geometry:{ type:'Point', coordinates:[f.lon,f.lat] } }));
    superIndex = new Supercluster({ radius:60, maxZoom:16 });
    superIndex.load(features);
    markerLayer = L.layerGroup().addTo(map);
  } else {
    markerLayer = L.markerClusterGroup({
      chunkedLoading:true, removeOutsideVisibleBounds:true,
      maxClusterRadius: z=>z<10?120:z<14?80:40, disableClusteringAtZoom:16
    }).addTo(map);
  }

  // Initialize map
  const map = L.map('map').setView([0,0],15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',{
    maxZoom:19, attribution:'© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  // Caching dynamic fetch
  const cache = new Map();
  async function fetchBB(bounds) {
    const key=[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()].map(v=>v.toFixed(4)).join(',');
    if(cache.has(key)) return cache.get(key);
    const q=`[out:json][timeout:20];node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out center;`;
    const data=await fetch('https://overpass-api.de/api/interpreter',{ method:'POST', body:q }).then(r=>r.json());
    cache.set(key,data.elements);
    return data.elements;
  }

  // Rendering logic
  async function updateMarkers() {
    markerLayer.clearLayers();
    const bounds=map.getBounds(), zoom=map.getZoom();

    if(useStatic) {
      superIndex.getClusters(
        [bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()], zoom
      ).forEach(c=>{
        const [lon,lat]=c.geometry.coordinates, props=c.properties;
        if(props.cluster) {
          const cnt=props.point_count, size=Math.max(30,Math.min(cnt*2,60));
          const html=`<div style="width:${size}px;height:${size}px;line-height:${size}px;">${cnt}</div>`;
          const icon=L.divIcon({ html, className:'cluster-icon', iconSize:[size,size] });
          L.marker([lat,lon],{icon}).on('click',()=>map.setView([lat,lon], superIndex.getClusterExpansionZoom(props.cluster_id))).addTo(markerLayer);
        } else {
          L.circleMarker([lat,lon],{radius:6, fillColor:'#1976d2', fillOpacity:1, color:null})
           .on('click',()=>window.open(/iP(hone|ad|od)/.test(navigator.platform)?`maps://maps.apple.com/?daddr=${lat},${lon}`:`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`))
           .addTo(markerLayer);
        }
      });
    } else {
      (await fetchBB(bounds)).forEach(pt=>{
        const lat=pt.lat??pt.center.lat, lon=pt.lon??pt.center.lon;
        L.circleMarker([lat,lon],{radius:6, fillColor:'#1976d2', fillOpacity:1, color:null})
          .on('click',()=>window.open(/iP(hone|ad|od)/.test(navigator.platform)?`maps://maps.apple.com/?daddr=${lat},${lon}`:`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`))
          .addTo(markerLayer);
      });
    }
  }

  // Map events
  let locationMarker;
  map.locate({ setView:true, maxZoom:16 });
  map.on('locationfound', e=>{
    if(locationMarker) map.removeLayer(locationMarker);
    locationMarker=L.circleMarker(e.latlng,{radius:6,fillColor:'blue',fillOpacity:0.9,color:null}).addTo(map);
    updateMarkers();
  });
  map.on('moveend', updateMarkers);

  // AR toggle
  const arBtn=document.getElementById('ar-button'),
        arView=document.getElementById('ar-view'),
        exitBtn=document.getElementById('exit-ar'),
        video=document.getElementById('ar-video');
  let stream;
  arBtn.addEventListener('click',async()=>{
    document.getElementById('map').style.display='none';
    arBtn.style.display='none';
    arView.style.display='block';
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});video.srcObject=stream;await video.play();}
    catch{alert('Camera unavailable'); exitAR();}
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR(){ if(stream)stream.getTracks().forEach(t=>t.stop()); arView.style.display='none'; document.getElementById('map').style.display=''; arBtn.style.display=''; }
});