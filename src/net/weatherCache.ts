/** The most recent real space-weather reading, shared between the Headquarters card and the flight simulation. */
export interface SpaceWeatherContext {
  solarActivity?: number;
  latestFlare?: string;
}

let cached: SpaceWeatherContext = {};

export function setSpaceWeather(w: SpaceWeatherContext): void {
  cached = w;
}

export function currentSpaceWeather(): SpaceWeatherContext {
  return cached;
}
