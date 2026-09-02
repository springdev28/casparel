/**
 * @fileOverview Web domain role: centralizes Auth Locale state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
import { getApiError } from "./api-error";
import { useEffect, useState } from "react";

export const AUTH_LANGUAGE_KEY = "schoolar_language";

export const AUTH_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
] as const;

export type AuthLanguage = (typeof AUTH_LANGUAGES)[number]["code"];

type AuthCopy = {
  tagline: string;
  language: string;
  loginTitle: string;
  loginDescription: string;
  email: string;
  emailPlaceholder: string;
  password: string;
  passwordPlaceholder: string;
  signingIn: string;
  signIn: string;
  loginFailed: string;
  noAccount: string;
  createOne: string;
  browse: string;
  registerTitle: string;
  registerDescription: string;
  fullName: string;
  namePlaceholder: string;
  newPasswordPlaceholder: string;
  creatingAccount: string;
  createAccount: string;
  registrationFailed: string;
  /** Shown instead of the server's English text, which is not localized. */
  emailTaken: string;
  wrongCredentials: string;
  tooManyAttempts: string;
  offline: string;
  hasAccount: string;
  showPassword: string;
  hidePassword: string;
};

export const AUTH_COPY: Record<AuthLanguage, AuthCopy> = {
  en: {
    tagline: "Your student & teacher productivity platform",
    language: "Language",
    loginTitle: "Sign in",
    loginDescription: "Enter your credentials to access your account",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "Your password",
    signingIn: "Signing in…",
    signIn: "Sign in",
    loginFailed: "Login failed",
    noAccount: "Don’t have an account?",
    createOne: "Create one",
    browse: "Browse resources without an account",
    registerTitle: "Create an account",
    registerDescription: "Join Casparel to start learning and teaching",
    fullName: "Full name",
    namePlaceholder: "Jane Smith",
    newPasswordPlaceholder: "Min. 8 characters",
    creatingAccount: "Creating account…",
    createAccount: "Create account",
    registrationFailed: "Registration failed",
    emailTaken: "That email already has a Casparel account. Try signing in instead.",
    wrongCredentials: "Email or password is incorrect.",
    tooManyAttempts: "Too many attempts. Please wait a few minutes and try again.",
    offline: "Could not reach Casparel. Check your connection and try again.",
    hasAccount: "Already have an account?",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  tr: {
    tagline: "Öğrenciler ve öğretmenler için öğrenme çalışma alanı",
    language: "Dil",
    loginTitle: "Giriş yap",
    loginDescription: "Hesabınıza erişmek için bilgilerinizi girin",
    email: "E-posta",
    emailPlaceholder: "siz@ornek.com",
    password: "Şifre",
    passwordPlaceholder: "Şifreniz",
    signingIn: "Giriş yapılıyor…",
    signIn: "Giriş yap",
    loginFailed: "Giriş başarısız",
    noAccount: "Hesabınız yok mu?",
    createOne: "Hesap oluşturun",
    browse: "Hesap olmadan kaynaklara göz atın",
    registerTitle: "Hesap oluştur",
    registerDescription:
      "Öğrenmeye ve öğretmeye başlamak için Casparel’a katılın",
    fullName: "Ad soyad",
    namePlaceholder: "Ayşe Yılmaz",
    newPasswordPlaceholder: "En az 8 karakter",
    creatingAccount: "Hesap oluşturuluyor…",
    createAccount: "Hesap oluştur",
    registrationFailed: "Kayıt başarısız",
    emailTaken: "Bu e-posta ile zaten bir Casparel hesabı var. Bunun yerine giriş yapmayı deneyin.",
    wrongCredentials: "E-posta veya şifre hatalı.",
    tooManyAttempts: "Çok fazla deneme yapıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.",
    offline: "Casparel’e ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    hasAccount: "Zaten hesabınız var mı?",
    showPassword: "Şifreyi göster",
    hidePassword: "Şifreyi gizle",
  },
};

function browserLanguage(): AuthLanguage {
  const candidates =
    typeof navigator === "undefined"
      ? []
      : [
          navigator.language,
          ...(Array.isArray(navigator.languages) ? navigator.languages : []),
        ];
  for (const candidate of candidates) {
    const code = candidate?.toLowerCase().split("-")[0];
    if (AUTH_LANGUAGES.some((language) => language.code === code))
      return code as AuthLanguage;
  }
  return "en";
}

export function getInitialLanguage(): AuthLanguage {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(AUTH_LANGUAGE_KEY);
  } catch {
    // Storage can be blocked in embedded previews or privacy modes.
  }
  return AUTH_LANGUAGES.some((language) => language.code === saved)
    ? (saved as AuthLanguage)
    : browserLanguage();
}

export function useAuthLanguage() {
  const [language, setLanguageState] = useState<AuthLanguage>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(next: AuthLanguage) {
    try {
      localStorage.setItem(AUTH_LANGUAGE_KEY, next);
    } catch {
      // Keep the in-memory selection working when persistence is unavailable.
    }
    setLanguageState(next);
    document.dispatchEvent(
      new CustomEvent<AuthLanguage>("schoolar-language-change", {
        detail: next,
      }),
    );
    try {
      if (localStorage.getItem("casparel_native_shell") === "true") {
        const bridge = (window as typeof window & {
          ReactNativeWebView?: { postMessage: (value: string) => void };
        }).ReactNativeWebView;
        bridge?.postMessage(JSON.stringify({ type: "language", language: next }));
      }
    } catch {
      // The normal browser has no native bridge.
    }
  }

  return { language, setLanguage, copy: AUTH_COPY[language] };
}

/**
 * Turn a failed sign-in / sign-up into a sentence the user can act on.
 *
 * Both pages used to render the thrown error's `message`, which the generated
 * client formats for logs as "HTTP 400 Bad Request: Email already in use".
 * Users saw the status line; speakers of the other five languages saw English.
 *
 * Server error strings are matched but never displayed: they are hardcoded
 * English in the API, so they select the localized copy rather than becoming
 * it. Anything unrecognised falls back to the generic title with no raw detail,
 * so a new server message can never leak a log string into the UI again.
 */
export function describeAuthError(
  err: unknown,
  copy: AuthCopy,
  fallback: string,
): string {
  const { status, error, offline } = getApiError(err);
  if (offline) return copy.offline;
  if (status === 429) return copy.tooManyAttempts;
  if (status === 401) return copy.wrongCredentials;
  if (status === 400 && error && /already (in use|exists|registered)/i.test(error)) {
    return copy.emailTaken;
  }
  if (status === 409) return copy.emailTaken;
  if (status !== undefined && status >= 500) return copy.offline;
  return fallback;
}
