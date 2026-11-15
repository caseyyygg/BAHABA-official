import { useEffect, useRef } from 'react'
import { Map, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

export default function ReportLocationMap({ latitude, longitude }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || latitude == null || longitude == null) return undefined
    const map = new Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [longitude, latitude],
      zoom: 15,
      interactive: false,
      attributionControl: false,
    })
    new Marker({ color: '#0e7fe7' }).setLngLat([longitude, latitude]).addTo(map)
    return () => map.remove()
  }, [latitude, longitude])

  return (
    <div className="report-fab-map-wrap">
      {latitude != null && longitude != null
        ? <div ref={containerRef} className="report-fab-map-preview" aria-label="Map preview of detected GPS location" />
        : <div className="report-fab-map-preview report-fab-map-placeholder" role="img" aria-label="Map preview will appear after GPS is detected"><span>Waiting for GPS</span></div>}
      <small>© OpenStreetMap</small>
    </div>
  )
}
