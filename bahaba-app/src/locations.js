import locationConfig from '../location-config.json'
import registry from '../psgc-registry.json'

export const supportedLocations = registry.locations
export const legacyPsgc = { navotas: '1380900000', marikina: '1380700000', malolos: '0301410000' }
export const locationById = (id) => supportedLocations.find(l => l.id === (legacyPsgc[id] || id)) || locationConfig.locations.find(l => l.id === id) || null
export const searchLocations = (query, { region = '', province = '' } = {}) => {
  const words = query.toLocaleLowerCase().trim().split(/\s+/)
  return supportedLocations.filter(l => (!region || l.region === region) && (!province || l.province === province)
    && words.every(word => `${l.name} ${l.region} ${l.id}`.toLocaleLowerCase().includes(word)))
}
export const completedPreferences = user => Array.isArray(user?.preferred_locations) && user.preferred_locations.length >= 1 && user.preferred_locations.length <= 3 && new Set(user.preferred_locations.filter(id => supportedLocations.some(l => l.id === id))).size === user.preferred_locations.length
