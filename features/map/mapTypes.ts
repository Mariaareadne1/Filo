/** Shape of @rnmapbox/maps ShapeSource press events (not exported publicly). */
export interface OnPressEvent {
  features: GeoJSON.Feature[];
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
}
