// The one module that talks to the Firebase SDK. Everything else receives the
// small `sdk` object returned here, which keeps the router testable.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseConfig, recaptchaEnterpriseSiteKey, isCloudConfigured } from '../config/firebase-config.js';

// Until a Firebase project is connected the app still runs its on-device
// routes. The SDK only requires these three fields to be non-empty; an
// ONLY_ON_DEVICE request never builds a network call, and the router does not
// send cloud requests while isCloudConfigured() is false.
const LOCAL_ONLY_OPTIONS = { apiKey: 'local-only', projectId: 'local-only', appId: 'local-only' };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

let ai = null;

function startAppCheck(app) {
  if (LOCAL_HOSTS.has(globalThis.location?.hostname)) {
    // Local development uses an App Check debug token. `npm run build:local`
    // reads one registered token from the git-ignored .env.development.local, so
    // every local browser shares it. A plain `npm run build` (production mode,
    // the build that gets deployed) never loads that file; the SDK then makes a
    // token for this browser and prints it once, to be registered under
    // App Check > Apps > Manage debug tokens. Tokens must never be committed.
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  const provider = recaptchaEnterpriseSiteKey
    ? new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey)
    : new CustomProvider({
        getToken: () => Promise.reject(new Error('No App Check provider is configured for this host.')),
      });
  initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
}

export function getSdk() {
  if (!ai) {
    const configured = isCloudConfigured();
    const app = initializeApp(configured ? firebaseConfig : LOCAL_ONLY_OPTIONS);
    if (configured) startAppCheck(app);
    ai = getAI(app, { backend: new GoogleAIBackend() });
  }
  return {
    /** @param {import('firebase/ai').HybridParams} params */
    getModel: (params) => getGenerativeModel(ai, params),
  };
}
