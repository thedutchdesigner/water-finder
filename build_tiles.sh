#!/usr/bin/env bash
# build_tiles.sh - Generate vector tiles from fountains.geojson or fountains.json

set -e

INPUT_JSON=""
# Determine input geojson source
if [ -f fountains.json ]; then
  echo "Found Overpass JSON: fountains.json"
  if ! command -v osmtogeojson &> /dev/null; then
    echo "Installing osmtogeojson…"
    npm install -g osmtogeojson
  fi
  echo "Converting fountains.json to fountains.geojson…"
  osmtogeojson fountains.json > fountains.geojson
  INPUT_JSON="fountains.geojson"
elif [ -f fountains.geojson ]; then
  echo "Using existing fountains.geojson as input"
  INPUT_JSON="fountains.geojson"
else
  echo "Error: neither fountains.json nor fountains.geojson found!"
  exit 1
fi

# Ensure cleaned.geojson
echo "Preparing cleaned.geojson…"
cp "$INPUT_JSON" cleaned.geojson

# 2. Build MBTiles using tippecanoe
echo "Building MBTiles…"
tippecanoe -o fountains.mbtiles   --drop-densest-as-needed -Z0 -z16 cleaned.geojson

# 3. Extract PBF tiles using mbutil
echo "Extracting PBF tiles to tiles/…"
rm -rf tiles
mb-util fountains.mbtiles tiles --image_format=pbf

# 4. Create tiles.json manifest
echo "Writing tiles.json manifest…"
cat <<EOF > tiles.json
{
  "tilejson": "2.2.0",
  "name": "fountains",
  "version": "1.0.0",
  "scheme": "xyz",
  "tiles": [
    "https://<YOUR_USERNAME>.github.io/<YOUR_REPO_NAME>/tiles/{z}/{x}/{y}.pbf"
  ]
}
EOF

echo "Done! Now: git add fountains.geojson tiles tiles.json && git commit -m 'Add vector tiles' && git push"
