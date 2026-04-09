import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

type Props = {
  latitude: number
  longitude: number
  dark: boolean
  interactive?: boolean
  centerPin?: boolean
  onMessage?: (event: any) => void
}

const buildLocationMapHtml = ({
  latitude,
  longitude,
  dark,
  interactive,
  centerPin,
}: {
  latitude: number
  longitude: number
  dark: boolean
  interactive: boolean
  centerPin: boolean
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      crossorigin=""
    />
    <style>
      html, body, #map {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: ${dark ? '#111111' : '#eef2f1'};
      }
      .leaflet-container {
        background: ${dark ? '#111111' : '#eef2f1'};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .leaflet-control-attribution {
        display: none !important;
      }
      .leaflet-control-zoom a {
        color: #111 !important;
      }
      .center-pin {
        position: fixed;
        left: 50%;
        top: 50%;
        width: 34px;
        height: 48px;
        margin-left: -17px;
        margin-top: -44px;
        z-index: 9999;
        pointer-events: none;
        transform: translateY(-2px);
      }
      .center-pin .pin-body {
        position: absolute;
        left: 50%;
        top: 2px;
        width: 24px;
        height: 24px;
        margin-left: -12px;
        border-radius: 24px 24px 24px 0;
        background: linear-gradient(180deg, #39e06f 0%, #17a34a 100%);
        transform: rotate(-45deg);
        box-shadow: 0 10px 20px rgba(0,0,0,.24);
      }
      .center-pin .pin-core {
        position: absolute;
        left: 50%;
        top: 7px;
        width: 10px;
        height: 10px;
        margin-left: -5px;
        border-radius: 5px;
        background: white;
      }
      .leaflet-marker-icon.custom-pin,
      .leaflet-marker-shadow.custom-pin-shadow {
        background: transparent;
        border: 0;
      }
      .pin-wrap {
        width: 34px;
        height: 48px;
        position: relative;
      }
      .pin-wrap .pin-body {
        position: absolute;
        left: 50%;
        top: 2px;
        width: 24px;
        height: 24px;
        margin-left: -12px;
        border-radius: 24px 24px 24px 0;
        background: linear-gradient(180deg, #39e06f 0%, #17a34a 100%);
        transform: rotate(-45deg);
        box-shadow: 0 10px 20px rgba(0,0,0,.24);
      }
      .pin-wrap .pin-core {
        position: absolute;
        left: 50%;
        top: 7px;
        width: 10px;
        height: 10px;
        margin-left: -5px;
        border-radius: 5px;
        background: white;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    ${centerPin ? '<div class="center-pin"><div class="pin-body"></div><div class="pin-core"></div></div>' : ''}
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      (function () {
        var interactive = ${interactive ? 'true' : 'false'};
        var map = L.map('map', {
          zoomControl: interactive,
          attributionControl: false,
          dragging: interactive,
          scrollWheelZoom: interactive,
          doubleClickZoom: interactive,
          boxZoom: interactive,
          keyboard: interactive,
          tap: interactive,
          touchZoom: interactive,
        }).setView([${latitude}, ${longitude}], ${interactive ? 16 : 15});

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        var pinIcon = L.divIcon({
          className: 'custom-pin',
          html: '<div class="pin-wrap"><div class="pin-body"></div><div class="pin-core"></div></div>',
          iconSize: [34, 48],
          iconAnchor: [17, 44]
        });

        if (!${centerPin ? 'true' : 'false'}) {
          L.marker([${latitude}, ${longitude}], { icon: pinIcon }).addTo(map);
        }

        function send(type, payload) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
          } catch (e) {}
        }

        function publishCenter() {
          if (!interactive) return;
          var center = map.getCenter();
          send('center', {
            latitude: center.lat,
            longitude: center.lng,
            zoom: map.getZoom()
          });
        }

        map.whenReady(function () {
          if (interactive) publishCenter();
          send('ready', {});
        });

        if (interactive) {
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
        }
      })();
    </script>
  </body>
</html>
`

export function LocationMapSurface({
  latitude,
  longitude,
  dark,
  interactive = false,
  centerPin = false,
  onMessage,
}: Props) {
  const source = useMemo(
    () => ({
      html: buildLocationMapHtml({
        latitude,
        longitude,
        dark,
        interactive,
        centerPin,
      }),
    }),
    [centerPin, dark, interactive, latitude, longitude]
  )

  return (
    <View style={styles.wrap}>
      <WebView
        source={source}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        mixedContentMode="compatibility"
        style={styles.webView}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
})
