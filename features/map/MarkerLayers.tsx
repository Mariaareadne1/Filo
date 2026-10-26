import { forwardRef, memo } from 'react';
import Mapbox from '@rnmapbox/maps';
import type { OnPressEvent } from './mapTypes';
import { useTheme } from '../../design/theme';
import type { MarkerCollection } from './mapModel';

interface Props {
  shape: MarkerCollection;
  selectedPlaceId: string | null;
  onPress: (e: OnPressEvent) => void;
}

const EMPTY: MarkerCollection = { type: 'FeatureCollection', features: [] };

/**
 * All markers are GPU-drawn Mapbox layers over ONE clustered GeoJSON source:
 * no React view per pin, so panning stays smooth with hundreds of places and
 * marker identity never churns. Selection is a filter on two extra layers,
 * so selecting a place doesn't rebuild the source.
 */
export const MarkerLayers = memo(
  forwardRef<Mapbox.ShapeSource, Props>(function MarkerLayers({ shape, selectedPlaceId, onPress }, ref) {
    const { colors, dark } = useTheme();
    const selected = selectedPlaceId ?? '__none__';
    const ring = dark ? '#0E0F11' : '#FFFFFF';

    return (
      <Mapbox.ShapeSource
        id="filo-places"
        ref={ref}
        shape={shape as GeoJSON.FeatureCollection}
        cluster
        clusterRadius={44}
        clusterMaxZoomLevel={16}
        clusterProperties={{
          mine: ['+', ['case', ['==', ['get', 'kind'], 'friend'], 0, 1]],
        }}
        onPress={onPress}
        hitbox={{ width: 28, height: 28 }}
      >
        {/* Clusters: ink discs; a thread ring when they contain your places. */}
        <Mapbox.CircleLayer
          id="filo-clusters"
          filter={['has', 'point_count']}
          style={{
            circleColor: colors.pinCluster,
            circleOpacity: 0.92,
            circleRadius: ['step', ['get', 'point_count'], 15, 8, 18, 25, 22],
            circleStrokeWidth: ['case', ['>', ['get', 'mine'], 0], 2.5, 1.5],
            circleStrokeColor: ['case', ['>', ['get', 'mine'], 0], colors.thread, ring],
          }}
        />
        <Mapbox.SymbolLayer
          id="filo-cluster-count"
          filter={['has', 'point_count']}
          style={{
            textField: ['get', 'point_count_abbreviated'],
            textSize: 12,
            textColor: dark ? '#0E0F11' : '#FFFFFF',
            textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            textAllowOverlap: true,
          }}
        />

        {/* Places: three kinds only (see mapModel.MarkerKind). */}
        <Mapbox.CircleLayer
          id="filo-points"
          filter={['!', ['has', 'point_count']]}
          style={{
            circleRadius: [
              'case',
              ['==', ['get', 'placeId'], selected], 9,
              ['==', ['get', 'kind'], 'friend'], ['step', ['get', 'friendCount'], 5.5, 2, 6.5, 4, 7.5],
              7,
            ],
            circleColor: [
              'match', ['get', 'kind'],
              'mine_visited', colors.thread,
              'mine_saved', ring,
              colors.pinFriend,
            ],
            circleStrokeColor: ['match', ['get', 'kind'], 'mine_saved', colors.thread, ring],
            circleStrokeWidth: ['match', ['get', 'kind'], 'mine_saved', 3, 'mine_visited', 2, 1.5],
            circlePitchAlignment: 'map',
          }}
        />

        {/* Names appear once you're close enough to read them. */}
        <Mapbox.SymbolLayer
          id="filo-labels"
          minZoomLevel={15.2}
          filter={['!', ['has', 'point_count']]}
          style={{
            textField: ['get', 'name'],
            textSize: 11.5,
            textOffset: [0, 1.25],
            textAnchor: 'top',
            textMaxWidth: 9,
            textColor: colors.ink,
            textHaloColor: dark ? 'rgba(14,15,17,0.9)' : 'rgba(255,255,255,0.95)',
            textHaloWidth: 1.4,
            textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            textOptional: true,
          }}
        />
      </Mapbox.ShapeSource>
    );
  }),
);

/**
 * The selected place drawn from its own UNclustered source above
 * everything, so selection stays visible even when its neighbours (e.g.
 * three Joe Coffees on one block) are still clustered.
 */
export const SelectedMarker = memo(function SelectedMarker({ shape, selectedPlaceId }: { shape: MarkerCollection; selectedPlaceId: string | null }) {
  const { colors, dark } = useTheme();
  const feature = selectedPlaceId ? shape.features.find((f) => f.properties.placeId === selectedPlaceId) : undefined;
  const ring = dark ? '#0E0F11' : '#FFFFFF';
  return (
    <Mapbox.ShapeSource id="filo-selected" shape={(feature ? { type: 'FeatureCollection', features: [feature] } : EMPTY) as GeoJSON.FeatureCollection}>
      <Mapbox.CircleLayer id="filo-selected-halo" style={{ circleRadius: 18, circleColor: colors.threadSoft, circleStrokeWidth: 1.5, circleStrokeColor: colors.thread }} />
      <Mapbox.CircleLayer
        id="filo-selected-point"
        aboveLayerID="filo-selected-halo"
        style={{
          circleRadius: 9,
          circleColor: ['match', ['get', 'kind'], 'mine_visited', colors.thread, 'mine_saved', ring, colors.pinFriend],
          circleStrokeColor: ['match', ['get', 'kind'], 'mine_saved', colors.thread, ring],
          circleStrokeWidth: ['match', ['get', 'kind'], 'mine_saved', 3, 2],
        }}
      />
    </Mapbox.ShapeSource>
  );
});
