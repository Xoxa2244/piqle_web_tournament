import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { WebView } from 'react-native-webview'

import type { ChatLocationMessagePayload } from '../lib/chatSpecialMessages'
import { spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { AppBottomSheet, AppConfirmActions } from './AppBottomSheet'

const DEFAULT_LOCATION = {
  latitude: 40.7128,
  longitude: -74.006,
}

const buildPickerHtml = (latitude: number, longitude: number, dark: boolean) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      crossorigin=""
    />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${dark ? '#111111' : '#f3f4f6'}; }
      .center-pin {
        position: fixed;
        left: 50%;
        top: 50%;
        width: 28px;
        height: 28px;
        margin-left: -14px;
        margin-top: -28px;
        z-index: 9999;
        pointer-events: none;
        transform: translateY(-6px);
      }
      .pin-dot {
        position: absolute;
        left: 8px;
        top: 0;
        width: 12px;
        height: 12px;
        border-radius: 6px;
        background: #22c55e;
        border: 2px solid white;
        box-shadow: 0 3px 10px rgba(0,0,0,.25);
      }
      .pin-stem {
        position: absolute;
        left: 13px;
        top: 11px;
        width: 2px;
        height: 13px;
        border-radius: 2px;
        background: #22c55e;
      }
      .leaflet-control-attribution { display: none !important; }
      .leaflet-control-zoom a { color: #111 !important; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div class="center-pin">
      <div class="pin-dot"></div>
      <div class="pin-stem"></div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      (function () {
        var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${latitude}, ${longitude}], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        function send(type, payload) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
          } catch (e) {}
        }

        function publishCenter() {
          var center = map.getCenter();
          send('center', {
            latitude: center.lat,
            longitude: center.lng,
            zoom: map.getZoom()
          });
        }

        map.whenReady(function () {
          publishCenter();
          send('ready', {});
        });

        map.on('moveend', publishCenter);
        map.on('zoomend', publishCenter);

        window.addEventListener('message', function (event) {
          try {
            var data = JSON.parse(event.data || '{}');
            if (data.type === 'setCenter') {
              map.setView([data.latitude, data.longitude], data.zoom || 16, { animate: true });
            }
          } catch (e) {}
        });
      })();
    </script>
  </body>
</html>
`

export function LocationPickerSheet({
  open,
  onClose,
  onShare,
}: {
  open: boolean
  onClose: () => void
  onShare: (payload: ChatLocationMessagePayload) => void
}) {
  const { colors, theme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [initialCenter, setInitialCenter] = useState(DEFAULT_LOCATION)
  const [selectedCenter, setSelectedCenter] = useState(DEFAULT_LOCATION)
  const [mapReady, setMapReady] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [placeTitle, setPlaceTitle] = useState('Pinned location')
  const [placeAddress, setPlaceAddress] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMapReady(false)
    setPermissionDenied(false)
    setPlaceTitle('Pinned location')
    setPlaceAddress(null)
    setSelectedCenter(DEFAULT_LOCATION)
    setInitialCenter(DEFAULT_LOCATION)

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (cancelled) return
        const granted = permission.status === Location.PermissionStatus.GRANTED
        setPermissionDenied(!granted)
        if (!granted) {
          Alert.alert(
            'Location access unavailable',
            'Piqle does not have access to your current location. You can open Settings, or still pick any place manually on the map.',
            [
              { text: 'Continue', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  void Linking.openSettings().catch(() => undefined)
                },
              },
            ]
          )
          return
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (cancelled) return
        const next = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        }
        setInitialCenter(next)
        setSelectedCenter(next)
      } catch {
        if (!cancelled) {
          setPermissionDenied(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timeout = setTimeout(() => {
      setResolving(true)
      void (async () => {
        try {
          const result = await Location.reverseGeocodeAsync(selectedCenter)
          if (cancelled) return
          const first = result?.[0]
          const title =
            [first?.name, first?.street].filter(Boolean).join(', ') ||
            first?.district ||
            first?.city ||
            first?.region ||
            'Pinned location'
          const address =
            [
              first?.street,
              first?.city,
              first?.region,
              first?.postalCode,
              first?.country,
            ]
              .filter(Boolean)
              .join(', ') || null
          setPlaceTitle(title)
          setPlaceAddress(address)
        } catch {
          if (!cancelled) {
            setPlaceTitle('Pinned location')
            setPlaceAddress(
              `${selectedCenter.latitude.toFixed(5)}, ${selectedCenter.longitude.toFixed(5)}`
            )
          }
        } finally {
          if (!cancelled) setResolving(false)
        }
      })()
    }, 240)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [open, selectedCenter.latitude, selectedCenter.longitude])

  const handleWebMessage = useCallback((event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string
        payload?: { latitude?: number; longitude?: number }
      }
      if (payload.type === 'ready') {
        setMapReady(true)
        return
      }
      if (payload.type === 'center' && payload.payload) {
        const latitude = Number(payload.payload.latitude)
        const longitude = Number(payload.payload.longitude)
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setSelectedCenter({ latitude, longitude })
        }
      }
    } catch {
      // ignore malformed web messages
    }
  }, [])

  const webSource = useMemo(
    () => ({
      html: buildPickerHtml(initialCenter.latitude, initialCenter.longitude, theme === 'dark'),
    }),
    [initialCenter.latitude, initialCenter.longitude, theme]
  )

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      title="Share location"
      subtitle={
        permissionDenied
          ? 'Location access is off. You can still move the map and share any place manually.'
          : 'Move the map so the pin points to the place you want to share.'
      }
      bottomPaddingExtra={8}
      footer={
        <AppConfirmActions
          intent="positive"
          cancelLabel="Cancel"
          confirmLabel="Share"
          onCancel={onClose}
          onConfirm={() =>
            onShare({
              latitude: selectedCenter.latitude,
              longitude: selectedCenter.longitude,
              title: placeTitle,
              address: placeAddress,
            })
          }
        />
      }
    >
      <View style={styles.mapWrap}>
        <WebView
          key={`${initialCenter.latitude}-${initialCenter.longitude}-${theme}`}
          source={webSource}
          originWhitelist={['*']}
          onMessage={handleWebMessage}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          mixedContentMode="compatibility"
          style={styles.webView}
        />
        {!mapReady ? (
          <View style={styles.loadingCover}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {placeTitle}
          </Text>
          {resolving ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        </View>
        <Text style={styles.previewAddress} numberOfLines={2}>
          {placeAddress || `${selectedCenter.latitude.toFixed(5)}, ${selectedCenter.longitude.toFixed(5)}`}
        </Text>
        <View style={styles.coordRow}>
          <Text style={styles.coordText}>
            {selectedCenter.latitude.toFixed(5)}, {selectedCenter.longitude.toFixed(5)}
          </Text>
          {permissionDenied ? (
            <Pressable
              onPress={() => {
                void Linking.openSettings().catch(() => undefined)
              }}
              style={({ pressed }) => [styles.settingsChip, pressed && { opacity: 0.82 }]}
            >
              <Text style={styles.settingsChipText}>Settings</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.staticHintText}>
          This place will be sent as a map preview in chat.
        </Text>
      </View>
    </AppBottomSheet>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    mapWrap: {
      height: 340,
      overflow: 'hidden',
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    webView: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    loadingCover: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.surfaceMuted,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '500',
    },
    previewCard: {
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: 18,
      padding: spacing.md,
      backgroundColor: colors.surfaceMuted,
      gap: 6,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    previewTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    previewAddress: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    coordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    coordText: {
      flex: 1,
      minWidth: 0,
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    settingsChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.chip,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    settingsChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    staticHintText: {
      color: colors.textMuted,
      fontSize: 11,
    },
  })
