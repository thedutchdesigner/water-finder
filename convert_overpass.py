#!/usr/bin/env python3
# convert_overpass.py — turn Overpass JSON into real GeoJSON Points

import json
import sys

# Load Overpass dump (your fountains.geojson)
try:
    data = json.load(open('fountains.geojson', 'r', encoding='utf-8'))
except Exception as e:
    print("Error reading fountains.geojson:", e)
    sys.exit(1)

if 'elements' not in data:
    print("Error: fountains.geojson must be the Overpass output with an 'elements' array.")
    sys.exit(1)

features = []
for el in data['elements']:
    lat = el.get('lat')
    lon = el.get('lon')
    if lat is None or lon is None:
        continue
    features.append({
        "type": "Feature",
        "properties": el.get('tags', {}),
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat]
        }
    })

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open('fountains.clean.geojson', 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"Wrote {len(features)} features to fountains.clean.geojson")
