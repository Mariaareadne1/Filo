import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { queryClient, qk } from '../lib/queryClient';

/**
 * Single-session photo upload queue. Lives at the (app) layout level so
 * uploads survive tab/route navigation but not app kill. If the app is
 * killed mid-upload, the local URI is lost and the user re-picks via
 * editing the pin — see plan §5.
 *
 * Each upload represents a single pin's photo: compressed locally (long
 * edge ≤ 1600px, JPEG 0.8), pushed to Supabase Storage at the path
 * `pin-photos/{user_id}/{pin_id}.jpg`, then the corresponding pins row
 * is patched with the resulting public URL.
 */

export type UploadStatus = 'uploading' | 'success' | 'failed';

export interface UploadState {
  pinId:     string;
  userId:    string;
  /** Local cache URI from the image picker, kept in memory for retry. */
  uri:       string;
  status:    UploadStatus;
  error?:    string;
  startedAt: number;
}

interface Ctx {
  uploads: Map<string, UploadState>;
  /** Begin (or replay) an upload. Returns immediately; runs in background. */
  startUpload: (pinId: string, userId: string, uri: string) => void;
  /** Retry a previously-failed upload. No-op if no record exists. */
  retryUpload: (pinId: string) => void;
}

const UploadContext = createContext<Ctx>({
  uploads: new Map(),
  startUpload: () => {},
  retryUpload: () => {},
});

export function useUploads(): Ctx {
  return useContext(UploadContext);
}

/** Probe image dimensions so the resize keeps the long edge ≤ 1600px
 *  regardless of orientation. expo-image-manipulator's `resize` accepts
 *  width-or-height (the other auto-scales by aspect), so we pick whichever
 *  is the long edge. */
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export function UploadProvider({ children }: { children: ReactNode }) {
  // Stable Map ref + a version counter; mutating the Map is O(1) and we
  // notify consumers via the counter without allocating a new Map per
  // patch. The Map identity is intentionally preserved across renders.
  const mapRef = useRef<Map<string, UploadState>>(new Map());
  const [, bump] = useState(0);
  const tick = useCallback(() => bump((n) => n + 1), []);

  const patch = useCallback(
    (pinId: string, next: Partial<UploadState> | null) => {
      if (next === null) {
        mapRef.current.delete(pinId);
      } else {
        const cur = mapRef.current.get(pinId);
        mapRef.current.set(pinId, {
          ...(cur ?? ({} as UploadState)),
          ...next,
        } as UploadState);
      }
      tick();
    },
    [tick],
  );

  const performUpload = useCallback(
    async (pinId: string, userId: string, uri: string) => {
      patch(pinId, {
        pinId,
        userId,
        uri,
        status: 'uploading',
        startedAt: Date.now(),
        error: undefined,
      });

      try {
        // 1. Resize to ≤ 1600px on the long edge.
        const { width, height } = await getImageSize(uri);
        const resize = width >= height ? { width: 1600 } : { height: 1600 };
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );

        // 2. URI → Blob. fetch().blob() works for file:// in expo SDK 50+.
        const blob = await (await fetch(compressed.uri)).blob();

        // 3. Upload. `upsert: true` lets retries overwrite the prior
        //    object at the same path; the storage UPDATE policy is what
        //    allows this on RLS.
        const path = `${userId}/${pinId}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('pin-photos')
          .upload(path, blob, {
            contentType: 'image/jpeg',
            upsert: true,
            cacheControl: '3600',
          });
        if (upErr) throw upErr;

        // 4. Public URL.
        const { data } = supabase.storage.from('pin-photos').getPublicUrl(path);

        // 5. Patch the pin row. RLS enforces ownership on UPDATE; the
        //    .eq('user_id') is defense in depth.
        const { error: updErr } = await supabase
          .from('pins')
          .update({ photo_url: data.publicUrl })
          .eq('id', pinId)
          .eq('user_id', userId);
        if (updErr) throw updErr;

        patch(pinId, { status: 'success' });
        // The pin's photo changed: refresh every view that shows it.
        queryClient.invalidateQueries({ queryKey: qk.pinsAll });
        queryClient.invalidateQueries({ queryKey: ['place'] });
        queryClient.invalidateQueries({ queryKey: qk.boardsAll });
        queryClient.invalidateQueries({ queryKey: ['board'] });

        // Auto-clear the success state after 2s so the toast fades.
        setTimeout(() => {
          const cur = mapRef.current.get(pinId);
          if (cur?.status === 'success') patch(pinId, null);
        }, 2000);
      } catch (e: unknown) {
        if (__DEV__) console.warn('[filo] photo upload failed', e);
        patch(pinId, {
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [patch],
  );

  const retryUpload = useCallback(
    (pinId: string) => {
      const cur = mapRef.current.get(pinId);
      if (!cur) return;
      performUpload(cur.pinId, cur.userId, cur.uri);
    },
    [performUpload],
  );

  return (
    <UploadContext.Provider
      value={{
        uploads: mapRef.current,
        startUpload: performUpload,
        retryUpload,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}
