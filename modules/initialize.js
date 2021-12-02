import proj4 from 'proj4'
import { register } from 'ol/proj/proj4'
import { get as getProjection, transform, transformExtent, getPointResolution } from 'ol/proj'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Vector as VectorLayer, Tile } from 'ol/layer' 

proj4.defs(
  "EPSG:3826",
  "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
)
register(proj4)

const projection3857 = getProjection("EPSG:3857")
const projection3826 = getProjection("EPSG:3826")

//顯示滑鼠位置TWD97座標
const readMousePosition = (ev) => {
  const coordinate = transform(ev.coordinate, projection3857, projection3826)
  const coordinateReduced = coordinate.map(val => parseInt(val))
  //console.log(coordinateReduced)
  const mousePositionDiv = document.getElementById('mousePosition')
  mousePositionDiv.innerHTML = `<span>&nbsp;TWD97座標:&nbsp;&nbsp;</span><span>${coordinateReduced[0]},&nbsp;&nbsp;${coordinateReduced[1]}</span>`

}

//使控制面板可拖動
const dragElement = (elmnt) => {

  const elementDrag = (e) => {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }

  const dragMouseDown = (e) => {
    e = e || window.event;
    e.preventDefault();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  const closeDragElement = () => {
    // stop moving when mouse button is released:
    document.onmouseup = null;
    document.onmousemove = null;
  }

  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  if (document.getElementById(elmnt.id + "Header")) {
    // if present, the header is where you move the DIV from:
    document.getElementById(elmnt.id + "Header").onmousedown = dragMouseDown;
  } else {
    // otherwise, move the DIV from anywhere inside the DIV:
    elmnt.onmousedown = dragMouseDown;
  }
}


//更換底圖
const switchBasemap = (baseLayers) => {
  const checked = document.querySelector('[name=basemap]:checked')
  baseLayers.forEach(layer => {
    if (layer.get('name') === checked.value) {
      layer.setVisible(true)
    } else {
      layer.setVisible(false)
    }
  })
}

//載入底圖設定選項
const loadBaseSettings = (map) => {
  const baseGroup = map.getLayerGroup().getLayers().getArray()[0]
  const baseLayers = baseGroup.getLayersArray()
  baseLayers.forEach(layer => {
    const title = layer.get('title')
    const name = layer.get('name')
    const basemapSelection = document.getElementById('basemapSelection')
    const el = document.createElement('div')
    el.className = 'layer-item base'


    const inputbox = document.createElement('input')
    inputbox.type = 'radio'
    inputbox.className = 'inputbox'
    inputbox.id = name
    inputbox.name = 'basemap'
    inputbox.value = name
    if (layer.getVisible()) {
      inputbox.checked = true
    }
    inputbox.onchange = () => {
      switchBasemap(baseLayers)
    }
    el.appendChild(inputbox)


    const label = document.createElement('label')
    label.for = name
    label.className = 'layer-name'
    label.appendChild(document.createTextNode(title))
    el.appendChild(label)

    basemapSelection.appendChild(el)
  })

}

//載入地形特徵圖設定選項
const loadLayerSettings = (map) => {
  const featureGroups = map.getLayerGroup().getLayers().getArray().filter(layer => layer.get('name') !== 'basemap')



  featureGroups.forEach(group => {
    const groupName = group.get('name')

    group.getLayersArray().forEach(layer => {
      const title = layer.get('title')
      const name = layer.get('name')
      //console.log(layer.get('legendSrc'))
      const featuremapSelection = document.getElementById('featuremapSelection')
      const el = document.createElement('div')
      

      const inputbox = document.createElement('input')
      inputbox.type = 'checkbox'
      inputbox.id = name
      inputbox.className = 'inputbox'
      inputbox.checked = true
      inputbox.onchange = () => {
        layer.setVisible(inputbox.checked)
      }
      el.appendChild(inputbox)


      const label = document.createElement('label')
      label.for = name
      label.title = '縮放至圖層範圍'
      label.className = 'layer-name'
      label.appendChild(document.createTextNode(title))
      label.style.cursor = 'pointer'
      label.onclick = () => {
        let extent3826, extent3857
        if (layer instanceof VectorLayer) {
          extent3857 = layer.getSource().getExtent()
        }
        else {
          extent3826 = layer.getSource().getTileGrid().getExtent()
          extent3857 = transformExtent(extent3826, projection3826, projection3857)
        }

        map.getView().fit(extent3857, map.getSize())
      }
      el.appendChild(label)


      const scrollBar = document.createElement('input')
      scrollBar.className = 'opacity'
      scrollBar.title = '透明度'
      scrollBar.type = 'range'
      scrollBar.min = 0
      scrollBar.max = 1
      scrollBar.step = 0.01
      scrollBar.oninput = () => {
        layer.setOpacity(parseFloat(scrollBar.value))
      }
      el.appendChild(scrollBar)


      if (layer instanceof Tile) {
        el.className = 'layer-item feature'
        const collapseButton = document.createElement('div')
        collapseButton.className = 'collapse-button'
        collapseButton.appendChild(document.createTextNode('\u23F7'))
        collapseButton.title = '展開圖層選項'
        collapseButton.onclick = () => {
          const items = document.querySelectorAll(`.layer-item.feature.${groupName}`)
          //console.log(items)
          items.forEach(item => {
            item.classList.toggle('active')
            if(item.style.display === "flex") {
              item.style.display = "none"
              collapseButton.replaceChild(document.createTextNode('\u23F7'), collapseButton.firstChild)
            } else {
              item.style.display = "flex"
              collapseButton.replaceChild(document.createTextNode('\u23F6'), collapseButton.firstChild)
            }
            
          })
        }
        el.appendChild(collapseButton)
        
      } else {
        el.className = `layer-item feature ${groupName}`
        el.style.display = "none"
        const collapseButton = document.createElement('div')
        collapseButton.className = 'collapse-button'
        collapseButton.appendChild(document.createTextNode('\u23F7'))
        collapseButton.style.visibility = 'hidden'
        el.appendChild(collapseButton)
      }


      featuremapSelection.appendChild(el)
    })
  })

}

//輸出成pdf目前有問題待解決
const exportToPdf = (map) => {
  //const loadingPage = document.getElementById("loading-page")
  //loadingPage.style.display = 'flex'
  const exportButton = document.getElementById('export')
  exportButton.disabled = true
  document.body.style.cursor = 'progress'
  const dims = {
    a0: [1189, 841],
    a1: [841, 594],
    a2: [594, 420],
    a3: [420, 297],
    a4: [297, 210],
    a5: [210, 148],
  }
  //const format = document.getElementById('format').value;
  //const resolution = document.getElementById('resolution').value;
    //const scale = document.getElementById('scale').value;
  //const dim = dims[format];
  const format = 'a4'
  const resolution = 300
  const scale = 10
  const dim = dims[format]
  const width = Math.round((dim[0] * resolution) / 25.4)
  const height = Math.round((dim[1] * resolution) / 25.4)
  const viewResolution = map.getView().getResolution()
  const size = map.getSize();
  const scaleResolution =
    scale /
    getPointResolution(
      map.getView().getProjection(),
      resolution / 25.4,
      map.getView().getCenter()
    )
  const exportOptions = {
    useCORS: true,
  }

  map.once('rendercomplete', () => {
    exportOptions.width = width
    exportOptions.height = height
    html2canvas(map.getViewport(), exportOptions).then((canvas) => {
      const pdf = new jsPDF('landscape', undefined, format);
      pdf.addImage(
        canvas.toDataURL('image/jpeg'),
        'PNG',
        0,
        0,
        dim[0],
        dim[1]
      )
      pdf.save('map.pdf')
      // Reset original map size
      //scaleLine.setDpi()
      //map.getTargetElement().style.width = ''
      //map.getTargetElement().style.height = ''
      //map.updateSize()
      map.setSize(size);
      map.getView().setResolution(viewResolution);
      exportButton.disabled = false
      document.body.style.cursor = 'auto'
      //const loadingPage = document.getElementById("loading-page")
      //loadingPage.style.display = 'none'
    })
  })
  //scaleLine.setDpi(resolution);
  map.getTargetElement().style.width = width + 'px';
  map.getTargetElement().style.height = height + 'px';
  map.updateSize();


  const printSize = [width, height];
  //map.setSize(printSize);
  const scaling = Math.min(width / size[0], height / size[1]);
  console.log(`width: ${width} height: ${height} viewResolution: ${viewResolution} scaleResolution: ${scaleResolution} size: ${size} printSize: ${printSize}`)

  map.getView().setResolution(viewResolution / scaling);
  //map.getView().setResolution(scaleResolution);
}

const collapsePanel = () => {
  const restItems = document.querySelectorAll('#controlPanelHeader~div')
  const collapsePanelButton = document.getElementById('collapsePanelButton')
  restItems.forEach(item => {
    item.classList.toggle('active')
    if(item.style.display !== "none") {
      item.style.display = "none"
      collapsePanelButton.replaceChild(document.createTextNode('\u23F7'), collapsePanelButton.firstChild)
    } else {
      item.style.display = ""
      collapsePanelButton.replaceChild(document.createTextNode('\u23F6'), collapsePanelButton.firstChild)
    }
  })
}


//呼叫上面函式初始化控制面板
const setupPanel = (map) => {
  loadBaseSettings(map)
  loadLayerSettings(map)
  dragElement(document.getElementById('controlPanel'))
  //const exportButton = document.getElementById('export')
  //exportButton.onclick = () => exportToPdf(map)
  map.on('pointermove', (ev) => {
    readMousePosition(ev)
  })
  const collapsePanelButton = document.getElementById('collapsePanelButton')
  collapsePanelButton.onclick = collapsePanel
}

export { setupPanel, projection3826, projection3857 }