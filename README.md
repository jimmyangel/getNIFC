## getNIFC - Get a snapshot of [NIFC](https://data-nifc.opendata.arcgis.com/) data in TopoJSON format

This utility retrieves a collection of fire perimeter files published by NIFC for the state of Oregon in geojson format and converts
them to TopoJSON. The utility collects all individual perimeter files for a every fire and combines them
into a single TopoJSON file per fire.

The utility also produces a JSON summary file with a list of all fires processed.

Percentage of forest land is calculated by intersecting the area of the last perimeter file with a GeoJSON shape of the forest land to intersect with.

In addition, elevation data is added to the location of each fire in the summary file.

```
Usage:
  node getNIFC.js [OPTIONS] [ARGS]

  Options:
    -d, --dest [FILE]      Destination directory (Default is rcwildfires-data)
    -f, --forest [STRING]  Url of forestland GeoJSON (or "ignore") (Default is https://stable-data.oregonhowl.org/oregon/forestland.json)
    -h, --help             Display help and usage details
```
