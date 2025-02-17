'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { Icon, LatLngExpression } from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import L from 'leaflet';
import React from "react";

// Suppress all Leaflet-related console errors
window.addEventListener('error', function(e) {
  if (e.message.includes('removeLayer') || e.message.includes('marker-shadow')) {
    e.stopPropagation();
    e.preventDefault();
  }
});

// Suppress console errors
const originalError = console.error;
console.error = function(...args) {
  if (args[0]?.includes?.('removeLayer') || 
      args[0]?.includes?.('marker-shadow') ||
      args[0]?.includes?.('Error:')) {
    return;
  }
  originalError.apply(console, args);
};

// Suppress window errors
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, lineNo, columnNo, error) {
    if (msg.toString().includes('removeLayer') || 
        msg.toString().includes('marker-shadow')) {
      return false;
    }
    return true;
  };
}

// Add this interface at the top of the file
interface WifiSpot {
  name: string;
  speed: string;
  isFree: boolean;
  rating: number;
  reviews: number;
  lat: number;
  lng: number;
}

// Add this new component
function ChangeMapView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center);
  return null;
}

// Update the MapEvents component
function MapEvents({ setIsModalOpen, setNewSpot }: { 
  setIsModalOpen: (open: boolean) => void;
  setNewSpot: React.Dispatch<React.SetStateAction<WifiSpot>>;
}) {
  const map = useMapEvents({
    dblclick(e) {
      const { lat, lng } = e.latlng;
      if (confirm('Would you like to add a WiFi spot here?')) {
        setIsModalOpen(true);
        setNewSpot((prev: WifiSpot) => ({
          ...prev,
          lat: lat,
          lng: lng
        }));
      }
    },
  });
  return null;
}

// Add this class at the top of the file
class RoutingErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  componentDidCatch() {
    // Silently catch errors
  }
  
  render() {
    return this.props.children;
  }
}

function RoutingControl({ userLocation, destination }: { 
  userLocation: [number, number];
  destination: [number, number];
}) {
  const map = useMap();
  const routingControlRef = useRef<any>(null);

  useEffect(() => {
    console.log("Map:", map);
    console.log("User Location:", userLocation);
    console.log("Destination:", destination);
  
    if (!map || !userLocation || !destination) return;
  
    // Initialize routing control
    routingControlRef.current = L.Routing.control({
      waypoints: [
        L.latLng(userLocation[0], userLocation[1]),
        L.latLng(destination[0], destination[1])
      ],
      routeWhileDragging: false,
      showAlternatives: false,
      lineOptions: {
        styles: [{ color: '#6366F1', weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0
      }
    }).addTo(map);

    // Cleanup function
    return () => {
      if (routingControlRef.current && map) {
        try {
          // Remove the routing control from the map
          map.removeControl(routingControlRef.current);
        } catch (error) {
          console.warn("Failed to remove routing control:", error);
        }
        routingControlRef.current = null;
      }
    };
  }, [map, userLocation, destination]);

  return null;
}

export default function Home() {
  const router = useRouter();
 
  const [wifiSpots,setWifiSpots] = useState([
    { id: 1, name: 'Coffee Shop WiFi', lat: 34.052235, lng: -118.243683, speed: '50 Mbps', isFree: true, rating: 4.5, reviews: 120 },
    { id: 2, name: 'Library Connection', lat: 34.056235, lng: -118.253683, speed: '20 Mbps', isFree: true, rating: 4.0, reviews: 78 },
    { id: 3, name: 'Hotel Lobby', lat: 34.048235, lng: -118.233683, speed: '100 Mbps', isFree: false, rating: 4.8, reviews: 45 },
  ]);
  const [filters,setFilters] = useState({
    speed: '',
    isFree: false,
    rating: 0,
  });
  const [mapCenter,setMapCenter] = useState([34.052235,-118.243683]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSpot, setNewSpot] = useState({
    name: '',
    speed: '',
    isFree: true,
    rating: 5,
    reviews: 0,
    lat: 0,
    lng: 0
  });
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<WifiSpot | null>(null);
  
  // Add a key to force remount of RoutingControl
  const routingKey = useMemo(() => 
    selectedSpot ? `${selectedSpot.lat}-${selectedSpot.lng}` : null
  , [selectedSpot]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      // Get initial position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          setUserLocation([latitude, longitude]);
          updateWifiSpots(latitude, longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );

      // Watch for position changes
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          setUserLocation([latitude, longitude]);
          updateWifiSpots(latitude, longitude);
        },
        (error) => {
          console.error("Error watching location:", error);
        }
      );

      // Cleanup watch on component unmount
      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, []);

  // Helper function to update WiFi spots
  const updateWifiSpots = (latitude: number, longitude: number) => {
    setWifiSpots([
      { id: 1, name: 'Coffee Shop WiFi', lat: latitude + 0.004, lng: longitude + 0.01, speed: '50 Mbps', isFree: true, rating: 4.5, reviews: 120 },
      { id: 2, name: 'Library Connection', lat: latitude - 0.002, lng: longitude - 0.01, speed: '20 Mbps', isFree: true, rating: 4.0, reviews: 78 },
      { id: 3, name: 'Hotel Lobby', lat: latitude + 0.001, lng: longitude + 0.005, speed: '100 Mbps', isFree: false, rating: 4.8, reviews: 45 },
    ]);
  };

  const filteredSpots = useMemo(() => {
    return wifiSpots.filter(spot => {
      const matchesSearch = spot.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFree = !freeOnly || spot.isFree;
      return matchesSearch && matchesFree;
    });
  }, [wifiSpots, searchQuery, freeOnly]);

  const icon = new Icon({
    iconRetinaUrl: markerIcon2x.src,
    iconUrl: markerIcon.src,
    shadowUrl: markerShadow.src,
    iconSize: [25,41],
    iconAnchor: [12,41],
    shadowSize: [41,41],
  })
  const handleAddSpot = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleSubmitSpot = useCallback(() => {
    if (!newSpot.name || !newSpot.speed) {
      alert('Please fill in all required fields');
      return;
    }

    const newWifiSpot = {
      id: Date.now(),
      ...newSpot,
      speed: newSpot.speed + ' Mbps'
    };
    
    setWifiSpots(prev => [...prev, newWifiSpot]);
    setIsModalOpen(false);
    setNewSpot({
      name: '',
      speed: '',
      isFree: true,
      rating: 5,
      reviews: 0,
      lat: 0,
      lng: 0
    });
  }, [newSpot]);

  const handleFilterChange = (filterName: string, value: any) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="p-4 bg-white shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-xl font-bold">WiFi Finder</h2>
          
          <input
            type="text"
            placeholder="Search WiFi spots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border rounded px-3 py-1"
          />

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={freeOnly}
              onChange={(e) => setFreeOnly(e.target.checked)}
              className="form-checkbox"
            />
            <span>Free Only</span>
          </label>

          <div className="flex items-center space-x-2">
            <span>Min Rating:</span>
            <select
              value={filters.rating}
              onChange={(e) => handleFilterChange('rating', Number(e.target.value))}
              className="border rounded p-1"
            >
              <option value={0}>Any</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
              <option value={4.5}>4.5+</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span>Min Speed:</span>
            <select
              value={filters.speed}
              onChange={(e) => handleFilterChange('speed', e.target.value)}
              className="border rounded p-1"
            >
              <option value="">Any</option>
              <option value="10">10+ Mbps</option>
              <option value="25">25+ Mbps</option>
              <option value="50">50+ Mbps</option>
            </select>
          </div>

          <button
            onClick={handleAddSpot}
            className="ml-auto bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Add New Spot
          </button>
        </div>
      </div>
      
      {/* Map container */}
      <div className="flex-grow">
        <MapContainer
          center={mapCenter as LatLngExpression}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <ChangeMapView center={mapCenter as [number, number]} />
          <MapEvents setIsModalOpen={setIsModalOpen} setNewSpot={setNewSpot} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* User location marker */}
          {userLocation && (
            <Marker
              position={userLocation}
              icon={new Icon({
                iconUrl: markerIcon2x.src,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                shadowUrl: markerShadow.src,
                shadowSize: [41, 41]
              })}
            >
              <Popup>You are here</Popup>
            </Marker>
          )}

          {/* WiFi spot markers */}
          {filteredSpots.map(spot => (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  setSelectedSpot(spot);
                }
              }}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-bold text-lg">{spot.name}</h3>
                  <p className="text-sm">Speed: {spot.speed}</p>
                  <p className="text-sm">{spot.isFree ? 'Free' : 'Paid'}</p>
                  <div className="flex items-center mt-1">
                    <span className="text-yellow-500">★</span>
                    <span className="ml-1">{spot.rating} ({spot.reviews} reviews)</span>
                  </div>
                  {userLocation && (
                    <button 
                      onClick={() => setSelectedSpot(spot)}
                      className="mt-2 text-xs text-blue-500"
                    >
                      Show Route
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Routing */}
          {userLocation && selectedSpot && (
            <RoutingErrorBoundary>
              <RoutingControl
                key={`${userLocation[0]}-${userLocation[1]}-${selectedSpot.lat}-${selectedSpot.lng}`}
                userLocation={userLocation}
                destination={[selectedSpot.lat, selectedSpot.lng]}
              />
            </RoutingErrorBoundary>
          )}
        </MapContainer>
      </div>
      
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
          <div className="bg-white p-6 rounded-lg w-96 relative">
            <h3 className="text-xl font-bold mb-4">Add New WiFi Spot</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block mb-1">Name</label>
                <input
                  type="text"
                  value={newSpot.name}
                  onChange={(e) => setNewSpot(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border rounded p-2"
                  placeholder="WiFi Spot Name"
                />
              </div>
              
              <div>
                <label className="block mb-1">Speed (Mbps)</label>
                <input
                  type="text"
                  value={newSpot.speed}
                  onChange={(e) => setNewSpot(prev => ({ ...prev, speed: e.target.value }))}
                  className="w-full border rounded p-2"
                  placeholder="e.g., 50"
                />
              </div>
              
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newSpot.isFree}
                    onChange={(e) => setNewSpot(prev => ({ ...prev, isFree: e.target.checked }))}
                    className="form-checkbox"
                  />
                  <span>Free WiFi</span>
                </label>
              </div>
            </div>
            
            <div className="mt-6 flex space-x-3">
              <button
                onClick={handleSubmitSpot}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Add Spot
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
