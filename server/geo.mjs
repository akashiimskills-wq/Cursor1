const EARTH_METRES = 6_371_000;

export function distanceMetres(fromLat, fromLng, toLat, toLng) {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δφ = ((toLat - fromLat) * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return Math.round(2 * EARTH_METRES * Math.asin(Math.min(1, Math.sqrt(a))));
}
