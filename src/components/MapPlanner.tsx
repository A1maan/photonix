import L from "leaflet";
import { useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import type { DemandCategory, DemandPoint, MissionGoal, Priority, Satellite, SatelliteType } from "../types";
import { getSatelliteType, demandWeight } from "../lib/coverage";

type MapPlannerProps = {
  demandPoints: DemandPoint[];
  satellites: Satellite[];
  satelliteTypes: SatelliteType[];
  coveredIds: Set<string>;
  missionGoal: MissionGoal;
  newPointCategory: DemandCategory;
  newPointPriority: Priority;
  onAddDemandPoint: (lat: number, lng: number) => void;
  onMoveSatellite: (id: string, lat: number, lng: number) => void;
};

function ClickHandler({
  onAddDemandPoint,
}: {
  onAddDemandPoint: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onAddDemandPoint(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function satelliteIcon(type: SatelliteType, suggested?: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="satellite-marker ${suggested ? "suggested" : ""}" style="--sat-color:${type.color}"></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function demandColor(point: DemandPoint, covered: boolean) {
  if (!covered) {
    return point.priority === "critical" ? "#ff6b5f" : "#ffb84d";
  }
  if (point.category === "clinic" || point.category === "school") {
    return "#6ea8ff";
  }
  if (point.category === "emergency") {
    return "#ffb84d";
  }
  return "#36f2c0";
}

export function MapPlanner({
  demandPoints,
  satellites,
  satelliteTypes,
  coveredIds,
  missionGoal,
  newPointCategory,
  newPointPriority,
  onAddDemandPoint,
  onMoveSatellite,
}: MapPlannerProps) {
  const bounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [16.0, 34.3],
      [32.8, 56.2],
    ],
    [],
  );

  return (
    <div className="map-shell relative h-full min-h-[560px] overflow-hidden">
      <MapContainer bounds={bounds} minZoom={4} maxZoom={9} maxBounds={bounds}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ClickHandler onAddDemandPoint={onAddDemandPoint} />

        {satellites
          .filter((satellite) => satellite.enabled)
          .map((satellite) => {
            const type = getSatelliteType(satellite.typeId, satelliteTypes);
            return (
              <div key={satellite.id}>
                <Circle
                  center={[satellite.lat, satellite.lng]}
                  radius={type.radiusKm * 1000}
                  pathOptions={{
                    color: type.color,
                    fillColor: type.color,
                    fillOpacity: satellite.suggested ? 0.18 : 0.11,
                    opacity: satellite.suggested ? 0.85 : 0.48,
                    weight: satellite.suggested ? 2 : 1,
                  }}
                />
                <Marker
                  position={[satellite.lat, satellite.lng]}
                  icon={satelliteIcon(type, satellite.suggested)}
                  draggable
                  eventHandlers={{
                    dragend(event) {
                      const marker = event.target as L.Marker;
                      const latLng = marker.getLatLng();
                      onMoveSatellite(satellite.id, latLng.lat, latLng.lng);
                    },
                  }}
                >
                  <Popup>
                    <strong>{satellite.name}</strong>
                    <br />
                    {type.name} - {type.radiusKm} km footprint
                  </Popup>
                </Marker>
              </div>
            );
          })}

        {demandPoints.map((point) => {
          const covered = coveredIds.has(point.id);
          const color = demandColor(point, covered);
          return (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lng]}
              radius={point.priority === "critical" ? 8 : 6}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: covered ? 0.82 : 0.95,
                opacity: 0.95,
                weight: covered ? 1 : 3,
              }}
            >
              <Popup>
                <strong>{point.name}</strong>
                <br />
                {point.category} - {point.priority}
                <br />
                Mission weight: {Math.round(demandWeight(point, missionGoal))}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="map-hud pointer-events-none absolute left-16 top-4 px-3 py-2 text-xs text-slate-300">
        Click map to add a {newPointPriority} {newPointCategory} point
      </div>
      <div className="map-hud pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-2 px-3 py-2 text-xs text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-signal" /> Covered
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Uncovered critical
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" /> Uncovered
        </span>
      </div>
    </div>
  );
}
