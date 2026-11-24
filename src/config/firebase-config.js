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

// All three are marked "billing not required" in the Firebase AI Logic model
// list in the project requirements. Answer reading uses a different quota
// from report writing. Keep the historically verified Flash-Lite for reports.
export const cloudModels = {
  light: 'gemini-3.8-flash',
  writing: 'gemini-3.5-flash-lite',
  writingFallback: 'gemini-4-hydrogen',
};

export function isCloudConfigured(config = firebaseConfig) {
  return Boolean(config.apiKey && config.projectId && config.appId);
}
