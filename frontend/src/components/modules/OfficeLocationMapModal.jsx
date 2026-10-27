import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MapPin, Navigation, Save, Search, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import { useUpdateCompanyOfficeLocation } from '../../hooks/useQueries';

// Create a modern SVG pin divIcon for Leaflet
const createCustomMarkerIcon = () => {
  return L.divIcon({
    className: 'custom-office-pin-icon',
    html: `
      <div style="position: relative; width: 36px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35));">
          <path d="M18 0C8.05888 0 0 8.05888 0 18C0 27.5 15.5 42.5 17.1 43.8C17.6 44.2 18.4 44.2 18.9 43.8C20.5 42.5 36 27.5 36 18C36 8.05888 27.9411 0 18 0Z" fill="#10B981"/>
          <circle cx="18" cy="18" r="7" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  });
};

export default function OfficeLocationMapModal({
  isOpen,
  onClose,
  companyId,
  companyName = 'Company',
  initialLocation,
  onSaved
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const updateOfficeLocationMutation = useUpdateCompanyOfficeLocation();

  // Selected coordinates & address state
  const [selectedLat, setSelectedLat] = useState(initialLocation?.latitude ?? 11.016844);
  const [selectedLng, setSelectedLng] = useState(initialLocation?.longitude ?? 76.955832);
  const [officeAddress, setOfficeAddress] = useState(initialLocation?.address || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // Sync state when initialLocation changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      if (initialLocation?.latitude != null && initialLocation?.longitude != null) {
        setSelectedLat(Number(initialLocation.latitude));
        setSelectedLng(Number(initialLocation.longitude));
        setOfficeAddress(initialLocation.address || '');
      } else {
        setSelectedLat(11.016844);
        setSelectedLng(76.955832);
      }
    }
  }, [isOpen, initialLocation]);

  // Center map on coordinates with animation and size invalidation
  const panToCoords = (lat, lng, zoom = 19) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.flyTo([lat, lng], zoom, {
        animate: true,
        duration: 0.8,
      });
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    }
  };

  // Initialize Leaflet map when dialog opens and container is available
  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
      return;
    }

    // Delay slightly to ensure Dialog DOM is fully mounted
    const initTimer = setTimeout(() => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const initLat = Number(selectedLat) || 11.016844;
      const initLng = Number(selectedLng) || 76.955832;

      const map = L.map(mapContainerRef.current, {
        center: [initLat, initLng],
        zoom: 18,
        zoomControl: true,
      });

      // OpenStreetMap tile layer (no API keys required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Custom movable marker
      const pinIcon = createCustomMarkerIcon();
      const marker = L.marker([initLat, initLng], {
        draggable: true,
        icon: pinIcon,
        title: 'Office Location',
      }).addTo(map);

      // Fixed 5-metre attendance geofence visual circle
      const circle = L.circle([initLat, initLng], {
        radius: 5, // exactly 5 metres
        color: '#10B981',
        fillColor: '#10B981',
        fillOpacity: 0.22,
        weight: 2,
        dashArray: '4, 4',
      }).addTo(map);

      markerRef.current = marker;
      circleRef.current = circle;
      mapInstanceRef.current = map;

      // Handle marker drag
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setSelectedLat(position.lat);
        setSelectedLng(position.lng);
        circle.setLatLng(position);
      });

      // Handle map click to place/move marker
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        setSelectedLat(lat);
        setSelectedLng(lng);
      });

      // Invalidate size to guarantee full tile rendering inside modal
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }, 120);

    return () => {
      clearTimeout(initTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, [isOpen]);

  // Robust device geolocation with fallback
  const handleLocateCurrentPosition = () => {
    // 1. Check secure context (HTTPS or localhost)
    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      toast.error('Geolocation requires a secure connection (HTTPS or localhost). You are currently connected via an insecure HTTP connection.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    const loadingToast = toast.loading('Detecting your current location...');

    const onPositionSuccess = async (position, isFallback = false) => {
      setIsLocating(false);
      toast.dismiss(loadingToast);
      const { latitude, longitude, accuracy } = position.coords;
      setGpsAccuracy(Math.round(accuracy));

      panToCoords(latitude, longitude, 19);

      toast.success(
        `Location found! Accuracy: ±${Math.round(accuracy)}m${isFallback ? ' (network estimated)' : ''}`
      );

      // Attempt reverse geocoding to auto-fill address if empty
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        if (data && data.display_name) {
          setOfficeAddress((prev) => prev.trim() ? prev : data.display_name);
        }
      } catch (err) {
        console.warn('Reverse geocode failed:', err);
      }
    };

    // Primary attempt: High accuracy GPS
    navigator.geolocation.getCurrentPosition(
      (pos) => onPositionSuccess(pos, false),
      (error) => {
        // If permission is denied, do not fallback; guide user to allow permission
        if (error.code === 1) { // PERMISSION_DENIED
          setIsLocating(false);
          toast.dismiss(loadingToast);
          toast.error(
            'Location permission was denied. Please allow location access for this site in your browser settings (click the lock/tune icon near the address bar) and retry.'
          );
          return;
        }

        // If error is position unavailable (2) or timeout (3), fallback to network/Wi-Fi positioning (just like Google Maps does)
        console.warn('High accuracy geolocation timed out or unavailable, attempting network fallback:', error.message);
        navigator.geolocation.getCurrentPosition(
          (pos) => onPositionSuccess(pos, true),
          (fallbackErr) => {
            setIsLocating(false);
            toast.dismiss(loadingToast);
            if (fallbackErr.code === 2) {
              toast.error(
                'Position unavailable. Your device could not determine its location. Please ensure location services are enabled on your device or click directly on the map to place the marker.'
              );
            } else if (fallbackErr.code === 3) {
              toast.error(
                'Location request timed out. Please click "Use My Current Location" to retry, or tap your office location directly on the map.'
              );
            } else {
              toast.error(`Unable to retrieve your location: ${fallbackErr.message || 'Please retry.'}`);
            }
          },
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Search address using OpenStreetMap Nominatim free geocoding
  const handleSearchAddress = async (e) => {
    e?.preventDefault?.();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.trim())}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        panToCoords(lat, lon, 18);
        setOfficeAddress(data[0].display_name || searchQuery);
        toast.success('Location found on map');
      } else {
        toast.info('No matching location found. Try searching with landmark or street name.');
      }
    } catch {
      toast.error('Address search failed. You can click directly on the map to place the pin.');
    } finally {
      setIsSearching(false);
    }
  };

  // Save confirmed location to MongoDB
  const handleSaveLocation = async () => {
    const compId = typeof companyId === 'string' ? companyId : (companyId?._id || companyId?.id || String(companyId || ''));
    if (!compId) {
      toast.error('Company ID not found');
      return;
    }

    const lat = Number(selectedLat);
    const lon = Number(selectedLng);

    if (isNaN(lat) || isNaN(lon)) {
      toast.error('Invalid coordinates selected');
      return;
    }

    try {
      await updateOfficeLocationMutation.mutateAsync({
        companyId: compId,
        latitude: lat,
        longitude: lon,
        address: officeAddress || '',
      });

      toast.success('Office location and 5-metre attendance geofence saved successfully!');
      if (onSaved) {
        onSaved({
          latitude: lat,
          longitude: lon,
          address: officeAddress || '',
          radius: 5,
        });
      }
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save office location');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] sm:w-full p-0 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-border bg-secondary/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  Set Office Location & 5-Metre Geofence
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {companyName} — Click anywhere on the map or drag the pin to set the exact office center.
                </DialogDescription>
              </div>
            </div>
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-bold px-2.5 py-1 hidden sm:inline-flex">
              5m Radius Locked
            </Badge>
          </div>
        </DialogHeader>

        {/* Map Controls: Search + Use My Current Location */}
        <div className="p-3 sm:p-4 bg-muted/30 border-b border-border flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <form onSubmit={handleSearchAddress} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search landmark, street, city or postal code..."
                className="pl-9 h-9 text-xs rounded-xl bg-background border-border"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={isSearching}
              className="h-9 px-3 text-xs font-semibold rounded-xl shrink-0 cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
            </Button>
          </form>

          {/* Primary Use My Current Location Button */}
          <Button
            type="button"
            size="sm"
            onClick={handleLocateCurrentPosition}
            disabled={isLocating}
            className="h-9 px-3.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5 fill-white" />
            )}
            <span>{isLocating ? 'Detecting Location...' : 'Use My Current Location'}</span>
          </Button>
        </div>

        {/* Leaflet Interactive Map View */}
        <div className="relative w-full h-[360px] sm:h-[420px] bg-muted/60">
          <div ref={mapContainerRef} className="w-full h-full z-10" />

          {/* Floating Radius Overlay Info Card */}
          <div className="absolute top-3 right-3 z-[400] bg-background/95 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-lg text-xs space-y-1 pointer-events-none max-w-[210px]">
            <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>5m Active Geofence</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Green circle shows the exact 5-metre boundary employees must be inside to check-in/out.
            </p>
            {gpsAccuracy != null && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold pt-0.5">
                GPS Accuracy: ±{gpsAccuracy}m
              </p>
            )}
          </div>
        </div>

        {/* Coordinates Display & Address Confirmation */}
        <div className="p-4 sm:p-5 border-t border-border bg-card space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Selected Latitude & Longitude
              </Label>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/50 border border-border text-xs font-mono font-bold text-foreground">
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">
                  {selectedLat?.toFixed(6)}, {selectedLng?.toFixed(6)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Office Label / Address
              </Label>
              <Input
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
                placeholder="e.g. Main Headquarters, Floor 2"
                className="h-8.5 text-xs rounded-xl bg-background border-border"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Tap or drag marker to update location when company moves.</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="rounded-xl text-xs h-9 font-semibold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveLocation}
                disabled={updateOfficeLocationMutation.isPending}
                className="rounded-xl text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md px-4 cursor-pointer"
              >
                {updateOfficeLocationMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Location...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Confirm & Save Location</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
