const cli = require('cli')
const log = require('simple-node-logger').createSimpleLogger()
const axios = require('axios')
const fs = require('fs')
const turf = require('@turf/turf')
const slugify = require('slugify')
const topojson = require('topojson-server')
const Cesium = require('cesium')
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwMzE3NzI4MC1kM2QxLTQ4OGItOTRmMy1jZjNiMzgyZWNjMTEiLCJpZCI6ODMxLCJpYXQiOjE1MjU5Nzg4MDN9.Aw5ul-R15-PWF1eziTS9fOffIMjm02TL0eRtOD59v2s'

const year = 'current_year'

let dest

let forestland
let forestlandArea
let stateBoundary
let fireRecords = {}

let stateBoundaryUrl = 'https://stable-data.oregonhowl.org/oregon/oregon.json'
let activeUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Public_Wildfire_Perimeters_View/FeatureServer/0/query'
let archivedUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Archived_Wildfire_Perimeters2/FeatureServer/0/query'
let params = {
  where: '1=1',
  outFields: 'DateCurrent,IncidentName',
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
    help: ['h', 'Display help and usage details']
})

if (options.help) {
  console.log('getNIFC - Get a snapshot of NIFC data in TopoJSON format\n');
  cli.getUsage();
} else {
  dest = options.dest
  log.info('Get forestland data')
  axios.get(options.forest).then(f => {
    forestland = turf.flatten(f.data)
    log.info('Get state boundary')
    axios.get(stateBoundaryUrl).then(s => {
      stateBoundary = s.data
      try {fs.mkdirSync(dest + '/')} catch(err) {if (err.code !== 'EEXIST') {throw(err)}}
      try {fs.mkdirSync(dest + '/' + year)} catch (err) {if (err.code !== 'EEXIST') {throw(err)}}
      getNIFCData()
    })
  })
}

function getNIFCData() {
  log.info('Get NIFC data')
  axios.get(archivedUrl, {params: params}).then(a => {
    //console.log(a.data.features)
    addFireReports(a.data.features, 'archived')
    axios.get(activeUrl, {params: params}).then(arc => {
      addFireReports(arc.data.features, 'active')
      fireRecords = Object.values(fireRecords)
      //console.log(JSON.stringify(fireRecords,null, 2))
      //console.log(fireRecords)
      log.info('Update location elevations and forest land percentages')
      updateElevations().then(() => {
        //console.log('Update forest land percentage')
        updateForestPercent()
        log.info('Write fire records file')
        fs.writeFileSync(dest + '/current_yearfireRecords.json', JSON.stringify(fireRecords.map(fr => fr.fireRecord), null, 2))
        log.info('Write fire report files')
        fireRecords.forEach(fr => {
          fs.writeFileSync(dest + '/' + year + '/' + fr.fireRecord.fireFileName + '.json', JSON.stringify(topojson.topology({collection:{type: 'FeatureCollection', features: fr.features}})))
        })
      })
    })
  })
}

function addFireReports(features, dataSource) {
  features.forEach(f => {
    if (f.properties.IncidentName) {
      let GA = Math.floor(turf.area(f)/4046.86)
      if (GA >= 1000) {
        let bbox = turf.bbox(f)
        if (!turf.booleanDisjoint(turf.bboxPolygon(bbox), stateBoundary.features[0])) {
          if (!fireRecords[f.properties.IncidentName]) {
            fireRecords[f.properties.IncidentName] = {
              fireRecord: {
                fireYear: 'current_year',
                fireName: f.properties.IncidentName,
                fireFileName: slugify(f.properties.IncidentName, '_'),
                fireMaxAcres: Math.floor(turf.area(f)/4046.86),
                bbox: bbox,
                location: turf.center(f).geometry.coordinates,
                percentForest: 100,
                fireReports: []
              },
              features: []
            }
          } else {
            // Use max area's bbox and center
            if (GA > fireRecords[f.properties.IncidentName].fireRecord.fireMaxAcres) {
              fireRecords[f.properties.IncidentName].fireRecord.fireMaxAcres = GA
              fireRecords[f.properties.IncidentName].fireRecord.bbox = bbox
              fireRecords[f.properties.IncidentName].fireRecord.location = turf.center(f).geometry.coordinates
            }
          }
          fireRecords[f.properties.IncidentName].fireRecord.fireReports.push(
            {
              dataSource: dataSource,
              fireReportDate: new Date(f.properties.DateCurrent),
              fireReportAcres: GA
            }
          )
          fireRecords[f.properties.IncidentName].features.push(
            {
              type: 'Feature',
              geometry: f.geometry,
              properties: {
                fireReportDate: new Date(f.properties.DateCurrent),
                fireName: f.properties.IncidentName,
                fireYear: 'current_year',
                GISACRES: GA
              }
            }
          )
        }
      }
    }
  })
}

function updateElevations() {

  let pos = []
  fireRecords.forEach(f => {
    pos.push(Cesium.Cartographic.fromDegrees(f.fireRecord.location[0], f.fireRecord.location[1]))
  })

  let tp = Cesium.createWorldTerrain()

  return new Promise ((resolve, reject) => {
    tp.readyPromise.then(() => {
      Cesium.sampleTerrainMostDetailed(tp, pos).then(function(updPos) {
        updPos.forEach((p, i) => {
          fireRecords[i].fireRecord.location.push(Number(p.height.toFixed(2)))
        })
        return resolve()
      })
    }).otherwise((err) => {
      log.error('Error getting elevation data ', err)
      return reject(err)
    })
  })
}

function updateForestPercent() {
  fireRecords.forEach(f => {
    f.fireRecord.percentForest = computeForestLandPercent(f.features[f.features.length - 1])
  })
}

function computeForestLandPercent(shape) {

  let area = turf.area(shape)
  let iArea = 0

  if (area > 0) {
    let fShape = turf.flatten(shape)
    fShape.features.forEach((feature) => {
      if (turf.area(feature)) {
        forestland.features.forEach((forest) => {
          if (turf.area(forest)) {
            let intersection
            // Sometimes shapes are crappy, so ignore those
            try {
              intersection = turf.intersect(turf.simplify(feature, {tolerance: 0.0001}), forest)
            } catch (e) {
            }
            if (intersection) {
                iArea += turf.area(intersection)
            }
          }
        })
      }
    })
    return Math.round(100*(iArea/area))
  }
  return 0
}
