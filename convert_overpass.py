#!/usr/bin/env python3
# convert_overpass.py
# Reads an Overpass-style JSON dump and writes valid GeoJSON for Tippecanoe.

import json

# 1. Load your Overpass dump (still named fountains.geojson)
with open('fountains.geojson', 'r', encoding='utf-8') as f:
    data = json.load(f)

if 'elements' not in data:
    print("Error: 'elements' key not found in fountains.geojson.")
    exit(1)

# 2. Build GeoJSON features array
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

# 3. Wrap in a FeatureCollection
geojson = {
    "type": "FeatureCollection",
    "features": features
}

# 4. Write out the cleaned file
with open('fountains.clean.geojson', 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"Wrote {len(features)} features to fountains.clean.geojson")
