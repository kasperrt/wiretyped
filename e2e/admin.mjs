import { safeWrapAsync } from '../dist/utils/wrap.mjs';

export function createRemoteAdmin(baseUrl) {
  return {
    reset: async () => {
      const [err, response] = await safeWrapAsync(() => fetch(new URL('/__reset', baseUrl), { method: 'POST' }));
      if (err) {
        return new Error('failed to reset server counts', { cause: err });
      }

      if (!response.ok) {
        return new Error(`failed to reset server counts: ${response.status}`);
      }

      return null;
    },
    getCounts: async () => {
      const [err, response] = await safeWrapAsync(() => fetch(new URL('/__counts', baseUrl)));
      if (err) {
        return [new Error('failed to read server counts', { cause: err }), null];
      }

      if (!response.ok) {
        return [new Error(`failed to read server counts: ${response.status}`), null];
      }

      const [errJson, json] = await safeWrapAsync(() => response.json());
      if (errJson) {
        return [new Error('failed to parse server counts', { cause: errJson }), null];
      }

      return [null, json];
    },
  };
}
