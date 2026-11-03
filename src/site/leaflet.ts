// leaflet.markercluster is a UMD plugin that augments the global `L`, so Leaflet must be
// on globalThis before the plugin module evaluates. ES modules evaluate in import order.
import "./leaflet-global.ts";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";

export default L;

export const POZNAN: L.LatLngExpression = [52.4064, 16.9252];
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
