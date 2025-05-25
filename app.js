document.addEventListener('DOMContentLoaded', async () => {
  const map = L.map('map').setView([0,0],15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',{
    maxZoom:19, attribution:'© OpenStreetMap © CartoDB'}).addTo(map);

  let fountains = [];
  try { fountains = await fetch('fountains.json').then(r=>r.json()); }
  catch { console.warn('No static data'); }
  const useStatic = Array.isArray(fountains) && fountains.length>0;

  const layer = L.layerGroup().addTo(map);
  let workerReady=false, worker;
  if(useStatic) {
    worker = new Worker('cluster-worker.js');
    worker.postMessage({type:'load', data:fountains});
    worker.onmessage = e => {
      if(e.data.type==='loaded') { workerReady=true; update(); }
      else if(e.data.type==='clusters') render(e.data.clusters);
    };
  }

  async function fetchDynamic() {
    const b = map.getBounds();
    const q=`[out:json][timeout:15];node["amenity"="drinking_water"](${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()});out center;`;
    const d = await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q})
      .then(r=>r.json()).then(json=>json.elements);
    return d;
  }

  function request() {
    if(useStatic) {
      if(workerReady) {
        const b=map.getBounds();
        worker.postMessage({type:'getClusters', bbox:[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()], zoom:map.getZoom()});
      }
    } else dynamic();
  }

  function render(clusters) {
    layer.clearLayers();
    clusters.forEach(c=>{
      const [lon,lat]=c.geometry.coordinates;
      if(c.properties.cluster) {
        const n=c.properties.point_count;
        const label=n>500?'500+':n;
        const size=Math.max(30,Math.min(n*2,60));
        const icon=L.divIcon({html:`<div class="cluster-icon" style="width:${size}px;height:${size}px;line-height:${size}px;">${label}</div>`,
          iconSize:[size,size]});
        L.marker([lat,lon],{icon}).on('click',()=>map.setView([lat,lon],map.getZoom()+2)).addTo(layer);
      } else {
        const icon=L.divIcon({className:'circle-icon', iconSize:[16,16], iconAnchor:[8,8]});
        L.marker([lat,lon],{icon}).on('click',()=>window.open(
          (/iP(hone|ad|od)/.test(navigator.platform)?`maps://maps.apple.com/?daddr=${lat},${lon}`:`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`),
          '_blank')).addTo(layer);
      }
    });
  }

  async function dynamic(){
    const pts=await fetchDynamic();
    render(pts.map(pt=>({geometry:{coordinates:[pt.lon,pt.lat||pt.center.lat]},properties:{}})));
  }

  function update(){ request(); }

  map.locate({setView:true, maxZoom:16});
  map.on('locationfound',()=>update());
  map.on('moveend zoomend',()=>update());

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
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=stream; await video.play();}
    catch{alert('Camera unavailable'); exitAR();}
  });
  exitBtn.addEventListener('click',exitAR);
  function exitAR(){ if(stream) stream.getTracks().forEach(t=>t.stop()); arView.style.display='none'; document.getElementById('map').style.display='block'; arBtn.style.display='block'; }
});