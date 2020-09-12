const cli = require('cli')
const log = require('simple-node-logger').createSimpleLogger()
const axios = require('axios')
const fs = require('fs')
const turf = require('@turf/turf')
const slugify = require('slugify')
const Cesium = require('cesium')
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwMzE3NzI4MC1kM2QxLTQ4OGItOTRmMy1jZjNiMzgyZWNjMTEiLCJpZCI6ODMxLCJpYXQiOjE1MjU5Nzg4MDN9.Aw5ul-R15-PWF1eziTS9fOffIMjm02TL0eRtOD59v2s'

const dest = 'rcwildfires-data'

let forestland
let forestlandArea
let fireRecords = {}

let activeUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Public_Wildfire_Perimeters_View/FeatureServer/0/query'
let archivedUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Archived_Wildfire_Perimeters2/FeatureServer/0/query'
let params = {
  where: 'GISAcres>=1000',
  //where: 'IncidentName=\'Archie Creek\'',
  //outFields: 'IRWINID,CreateDate,DateCurrent,IncidentName,GISAcres',
  outFields: '*',
  orderByFields: 'DateCurrent',
  geometry: '-124.567,41.992,-116.464,46.292',
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  outSR: '4326',
  geometryPrecision: '5',
  f: 'geojson'
}

log.setLevel('info')

var options = cli.parse({
    dest: ['d', 'Destination directory', 'file', 'rcwildfires-data'],
    forest: ['f', 'Url of forestland GeoJSON (or \"ignore\")', 'string', 'https://stable-data.oregonhowl.org/oregon/forestland.json'],
    verbose: ['v', 'Verbose logging', 'boolean', false],
    noelev: ['n', 'Skip elevation data', 'boolean', false],
    help: ['h', 'Display help and usage details']
})

if (options.help) {
  console.log('getNIFC - Get a snapshot of NIFC data in TopoJSON format\n');
  cli.getUsage();
} else {
  console.log('get forestland data')
  axios.get(options.forest).then(f => {
    forestland = turf.flatten(f.data)
    getNIFCData()
  })
}

function getNIFCData() {
  console.log('get NIFC data')
  axios.get(archivedUrl, {params: params}).then(a => {
    //console.log(a.data.features)
    addFireReports(a.data.features, 'archived')
    axios.get(activeUrl, {params: params}).then(arc => {
      addFireReports(arc.data.features, 'active')
      console.log(JSON.stringify(Object.values(fireRecords),null, 2))
    })
  })
}

function addFireReports(features, dataSource) {
  features.forEach(f => {
    if (f.properties.IncidentName) {
      if (!fireRecords[f.properties.IncidentName]) {
        fireRecords[f.properties.IncidentName] = {
          fireYear: 'current_year',
          fireName: f.properties.IncidentName,
          fireFileName: slugify(f.properties.IncidentName, '_'),
          fireMaxAcres: Math.floor(f.properties.GISAcres),
          bbox: turf.bbox(f),
          location: turf.center(f).geometry.coordinates,
          percentForest: 100,
          fireReports: []
        }
      }
      fireRecords[f.properties.IncidentName].fireReports.push(
        {
          dataSource: dataSource,
          fireReportDate: new Date(f.properties.DateCurrent),
          fireReportAcres: Math.floor(f.properties.GISAcres)
        }
      )
    }
  })
}
