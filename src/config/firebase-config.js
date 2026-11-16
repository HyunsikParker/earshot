// Public web identifiers for the Firebase project behind the cloud path.
// Copy them from the Firebase console (Project settings > Your apps > SDK setup
// and configuration). They identify the project; they do not grant access by
// themselves. App Check debug tokens and service-account keys are secrets and
// never belong in this file or anywhere else in the repository.
export const firebaseConfig = {
  apiKey: 'AIzaSyDCoZUDeWN9rP73L0UwCvg2MkPGGD79HlA',
  authDomain: 'earshot-ad76d.firebaseapp.com',
  projectId: 'earshot-ad76d',
  appId: '1:543083861505:web:40854ca1efe49d11025200',
};

// Site key of the reCAPTCHA Enterprise key registered for the hosted domain.
// A site key is public by design.
export const recaptchaEnterpriseSiteKey = '6Le7UiMuAAAAAFRoeg3Qyt5mdatb1qkkffeEwqka';

// Cloud models marked "billing not required" in the Firebase AI Logic model
// list (read 2026-11-15). `light` is also the SDK's default hybrid fallback.
export const cloudModels = {
  light: 'gemini-3.5-flash-lite',
  // gemini-3.8-flash is also listed as billing not required, but on 2026-11-16
  // it returned HTTP 500 once and no response within 180 s twice for the
  // report request; gemini-3.5-flash-lite answered the same request in 7 s.
  writing: 'gemini-3.5-flash-lite',
};

export function isCloudConfigured(config = firebaseConfig) {
  return Boolean(config.apiKey && config.projectId && config.appId);
}
