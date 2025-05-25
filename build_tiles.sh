#!/usr/bin/env bash
# build_tiles.sh - Clean build of vector tiles from fountains.geojson

set -e

# 1. Check for source
if [ ! -f fountains.geojson ]; then
  echo "Error: fountains.geojson not found!"
  exit 1
fi

# 2. Clean previous outputs
echo "Cleaning previous outputs..."
rm -f fountains.mbtiles
rm -rf tiles
rm -f tiles.json
rm -f cleaned.geojson

# 3. Prepare cleaned.geojson
echo "Copying fountains.geojson to cleaned.geojson..."
cp fountains.geojson cleaned.geojson

# 4. Build new MBTiles (force overwrite)
echo "Building fresh MBTiles..."
tippecanoe --force -o fountains.mbtiles --drop-densest-as-needed -Z0 -z16 cleaned.geojson

# 5. Extract PBF tiles into tiles/
echo "Extracting PBF tiles..."
mb-util fountains.mbtiles tiles --image_format=pbf

# 6. Write updated tiles.json manifest
echo "Writing tiles.json manifest..."
cat <<EOF > tiles.json
{
  "tilejson": "2.2.0",
  "name": "fountains",
  "version": "1.0.0",
  "scheme": "xyz",
  "tiles": [
    "https://thedutchdesigner.github.io/water-finder/tiles/{z}/{x}/{y}.pbf"
  ]
}
EOF

echo "Build complete. Next steps:"
echo "  git add cleaned.geojson fountains.mbtiles tiles tiles.json"
echo "  git commit -m 'Rebuild vector tiles'"
echo "  git push"
