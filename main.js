import { Map, View } from 'ol'
import { Group, Vector as VectorLayer, Tile } from 'ol/layer'
import WMTSTileGrid from 'ol/tilegrid/WMTS'
import { Fill, Stroke, Style, Text, Icon, Circle } from 'ol/style'
import { getWidth, getTopLeft, getHeight, getBottomLeft } from 'ol/extent'
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS'
import WMTSCapabilities from 'ol/format/WMTSCapabilities'
import { setupPanel, projection3826, projection3857 } from './modules/initialize'
import { ScaleLine, defaults as defaultControls } from 'ol/control'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import Overlay from 'ol/Overlay'
import { DEVICE_PIXEL_RATIO } from 'ol/has';

const serverUrl = 'https://atlas.geo.ntnu.edu.tw'

const container = document.getElementById('popup')
const content = document.getElementById('popup-content')
const closer = document.getElementById('popup-closer')


const overlay = new Overlay({
    element: container,
    autoPan: true,
    autoPanAnimation: {
        duration: 250,
    },
});

closer.onclick = () => {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
};


const levelsEMAP = 20
const levelsCaotun = 12

const tileMatrixesEMAP = {
    resolutions: new Array(levelsEMAP),
    matrixIds: new Array(levelsEMAP),
}

const tileMatrixesCaotun = {
    resolutions: new Array(levelsCaotun),
    matrixIds: new Array(levelsCaotun),
}

const parser = new WMTSCapabilities()


const projectionExtent3857 = projection3857.getExtent()
const projectionExtent3826 = [
    145633.028131307, 2257847.93310604, 349492.616446144, 2956700.67571342,
]
const sizeEMAP = getWidth(projectionExtent3857) / 256
const sizeCaotun = getWidth(projectionExtent3826) / 256

for (let z = 0; z < levelsEMAP; z++) {
    // generate resolutions and matrixIds arrays for this WMTS
    tileMatrixesEMAP.resolutions[z] = sizeEMAP / Math.pow(2, z)
    tileMatrixesEMAP.matrixIds[z] = z
}

for (let z = 0; z < levelsCaotun; z++) {
    // generate resolutions and matrixIds arrays for this WMTS
    tileMatrixesCaotun.resolutions[z] = sizeCaotun / Math.pow(2, z)
    tileMatrixesCaotun.matrixIds[z] = z
}

const commonOptions = {
    matrixSet: "EPSG:3826",
    format: "image/png",
    projection: projection3826,
    tileGrid: new WMTSTileGrid({
        origin: getTopLeft(projectionExtent3826),
        resolutions: tileMatrixesCaotun.resolutions,
        matrixIds: tileMatrixesCaotun.matrixIds,
    }),
    serverType: "geoserver",
    style: "default",
}

//讀取影像建立圖例樣式
const getPattern = async (url) => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')


    const img = new Image(128, 128)
    img.crossOrigin = "anonymous"
    img.src = url
    await img.decode()
    canvas.width = 128
    canvas.height = 128
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    return context.createPattern(canvas, "repeat")
}

//將JSON轉換成樣式物件
const getTextStyleFromJSON = (obj) => {

    const textStyle = {}
    const font = obj['font'] || '12px Calibri,sans-serif'
    const fillOption = obj['fill'] || {
        color: '#000'
    }
    const strokeOption = obj['stroke'] || {
        color: '#fff',
        width: 3
    }

    textStyle['font'] = font
    textStyle['fill'] = new Fill(fillOption)
    textStyle['stroke'] = new Stroke(strokeOption)

    return textStyle
}

//從JSON建立樣式物件
const getStyleFromJSON = async (styleJSON) => {
    let pat = 'rgba(200, 200, 200, 0.8)'
    let fillSrc = ''
    if (styleJSON.hasOwnProperty('fill')) {
        if (styleJSON.fill.hasOwnProperty('src')) {
            pat = await getPattern(styleJSON.fill.src)
            fillSrc = styleJSON.fill.src
        } else if (styleJSON.fill.hasOwnProperty('color')) {
            console.log('shit')
            pat = styleJSON.fill.color
        }
    }
    const fillOption = { color: pat }
    const strokeOption = styleJSON.hasOwnProperty('stroke') ? styleJSON.stroke : {
        color: '#644889',
        width: 5,
        lineJoin: 'bevel',
        lineDash: [5, 10],
    }

    let iconOption = {}
    let iconSrc = ''
    if (styleJSON.hasOwnProperty('image')) {
        iconOption = styleJSON.image
        iconSrc = styleJSON.image.src
    } else {
        iconOption = {
            crossOrigin: 'anonymous',
            src: `${serverUrl}/api/legend/default_dot.png`,
            scale: 0.05


        }
        iconSrc = `${serverUrl}/api/legend/default_dot.png`
    }
    const textOption = styleJSON.hasOwnProperty('text') ? getTextStyleFromJSON(styleJSON['text']) : getTextStyleFromJSON({})



    const style = new Style({
        fill: new Fill(fillOption),
        stroke: new Stroke(strokeOption),
        image: new Icon(iconOption),
        text: new Text(textOption),
    })
    style.legendSrc = fillSrc || iconSrc

    return style
}

(async () => {
    try {
        console.time('Loading')

        //載入向量圖層設定
        const layerCollecttion = await fetch(`${serverUrl}/api/layers`).then(res => res.json())
        const availableLayers = layerCollecttion.layers
        const vectorLayers = []
        const fetchPromises = availableLayers.map(async (layer) => {
            const geojson = await fetch(`${serverUrl}/api/geojson/${layer.name}`).then(res => res.json())
            const style = await getStyleFromJSON(layer.style)
            geojson.style = style
            return geojson
        })

        //載入向量圖層
        const geojsons = await Promise.all(fetchPromises)

        //初始化載入的圖層
        for (const geojson of geojsons) {
            let vectorLayer = new VectorLayer({
                title: geojson.title,
                name: geojson.name,
                source: new VectorSource({
                    features: new GeoJSON().readFeatures(geojson),
                }),
                style: geojson.style,
                legendSrc: geojson.style.legendSrc,
            })
            vectorLayers.push(vectorLayer)


        }

        //載入WMTS服務XML
        const wmtsHeader = await fetch(`${serverUrl}/geoserver/gwc/service/wmts?REQUEST=GetCapabilities`).then(res => res.text())
        const result = parser.read(wmtsHeader)

        const optionsCaotun = optionsFromCapabilities(result, {
            layer: "mdgil:caotun",
            crossOrigin: "anonymous",
        })
        const optionsChenggong = optionsFromCapabilities(result, {
            layer: "mdgil:chunggong",
            crossOrigin: "anonymous",
        })

        const optionsMuzha = optionsFromCapabilities(result, {
            layer: "mdgil:muzha",
            crossOrigin: "anonymous",
        })

        const caotun = new Tile({
            source: new WMTS(optionsCaotun, commonOptions),
            title: "草屯",
            name: "caotun",
        })

        const chenggong = new Tile({
            source: new WMTS(optionsChenggong, commonOptions),
            title: "成功",
            name: "chenggong",
        })

        const muzha = new Tile({
            source: new WMTS(optionsMuzha, commonOptions),
            title: "木柵",
            name: "muzha",
        })

        const orthophoto = new Tile({
            source: new WMTS({
                url: "https://wmts.nlsc.gov.tw/wmts",
                crossOrigin: "anonymous",
                layer: "PHOTO2",
                matrixSet: "EPSG:3857",
                format: "image/png",
                projection: projection3857,
                tileGrid: new WMTSTileGrid({
                    origin: getTopLeft(projectionExtent3857),
                    resolutions: tileMatrixesEMAP.resolutions,
                    matrixIds: tileMatrixesEMAP.matrixIds,
                }),
                style: "default",
            }),
            type: "base",
            title: "通用版電子地圖正射影像",
            visible: true,
            name: 'orthophoto',
        })

        const emap = new Tile({
            source: new WMTS({
                url: "https://wmts.nlsc.gov.tw/wmts",
                crossOrigin: "anonymous",
                layer: "EMAP16",
                matrixSet: "EPSG:3857",
                format: "image/png",
                projection: projection3857,
                tileGrid: new WMTSTileGrid({
                    origin: getTopLeft(projectionExtent3857),
                    resolutions: tileMatrixesEMAP.resolutions,
                    matrixIds: tileMatrixesEMAP.matrixIds,
                }),
                style: "default",
            }),
            type: "base",
            title: "通用版電子地圖",
            visible: false,
            name: 'emap',
        })

        //建立地圖
        const map = new Map({
            controls: defaultControls().extend([new ScaleLine({
                units: 'metric'
            })]),
            target: "mapWindow",
            layers: [
                new Group({
                    name: 'basemap',
                    title: "底圖",
                    fold: "open",
                    layers: [orthophoto, emap],
                }),
                new Group({
                    title: "木柵",
                    name: "muzha",
                    fold: "open",
                    layers: [muzha],
                }),
                new Group({
                    title: "草屯",
                    name: "caotun",
                    fold: "open",
                    layers: [caotun, ...vectorLayers],
                }),
                new Group({
                    title: "成功",
                    name: "changgong",
                    fold: "open",
                    layers: [chenggong],
                }),
            ],
            overlays: [overlay],
            view: new View({
                center: [13464591, 2704238],
                zoom: 8,
                extent: [13000886, 2391185, 13864728, 2999458],
            }),
        })

        //設定POP-UP視窗功能
        map.on('click', (ev) => {

            const feature = map.forEachFeatureAtPixel(ev.pixel,
                (feature) => {
                    return feature
                }, {
                hitTolerance: 7
            })
            console.log(feature)
            if (feature) {
                const rowInfo = {
                    topo_name: 0,
                    text: 1,
                    image: 2
                }
                const properties = feature.getProperties()
                delete properties['geometry']

                const table = document.createElement('table')
                let r, c
                const keys = Object.keys(properties)
                keys.forEach((k) => {
                    r = table.insertRow(rowInfo[k])
                    c = r.insertCell(0)
                    switch (k) {
                        case 'geometry':
                            c.innerHTML = properties[k].getType()
                            break
                        case 'image':
                            const img = document.createElement('img')
                            img.src = `${serverUrl}/api/img/${properties[k]}`
                            img.className = 'feature-img'
                            c.appendChild(img)
                            break
                        default:
                            c.innerHTML = properties[k]
                    }


                })

                if (content.firstElementChild) {
                    content.replaceChild(table, content.firstElementChild)
                }
                else {
                    content.appendChild(table)
                }
                const coordinate = ev.coordinate
                overlay.setPosition(coordinate)
            }
        })

        //初始化控制面板
        setupPanel(map)

        //停止載入畫面
        map.once('postcompose', () => {
            console.timeEnd('Loading')
            const loadingPage = document.getElementById("loading-page")
            loadingPage.style.display = 'none'
        })

    }
    catch (err) {
        const loadingPage = document.getElementById("loading-page")
        loadingPage.style.display = 'none'
        const infoDiv = document.getElementById("info")
        infoDiv.innerHTML = `<p>Error: ${err}</p>`
        console.log("Error:", err)
    }


})()
