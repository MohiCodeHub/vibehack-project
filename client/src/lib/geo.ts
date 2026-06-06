// Best-effort geolocation. Resolves to null if denied/unavailable so the
// game falls back to the server's DEFAULT_CITY.

export interface LatLng {
  lat: number;
  lng: number;
}

export function getLocation(timeoutMs = 6000): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 1000 * 60 * 10 },
    );
  });
}
