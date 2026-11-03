import L from "leaflet";

(globalThis as { L?: typeof L }).L = L;
