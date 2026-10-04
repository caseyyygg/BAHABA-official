import locationConfig from '../location-config.json'

export const supportedLocations = locationConfig.locations
export const locationById = (locationId) => supportedLocations.find((location) => location.id === locationId) || null
