import { useEffect, useState } from "react";

export const AUTH_LANGUAGE_KEY = "schoolar_language";

export const AUTH_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
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
    registerDescription: "Join Schoolar to start learning and teaching",
    fullName: "Full name",
    namePlaceholder: "Jane Smith",
    newPasswordPlaceholder: "Min. 8 characters",
    creatingAccount: "Creating account…",
    createAccount: "Create account",
    registrationFailed: "Registration failed",
    hasAccount: "Already have an account?",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  es: {
    tagline: "Tu plataforma de productividad para estudiantes y docentes",
    language: "Idioma",
    loginTitle: "Iniciar sesión",
    loginDescription: "Introduce tus credenciales para acceder a tu cuenta",
    email: "Correo electrónico",
    emailPlaceholder: "tu@ejemplo.com",
    password: "Contraseña",
    passwordPlaceholder: "Tu contraseña",
    signingIn: "Iniciando sesión…",
    signIn: "Iniciar sesión",
    loginFailed: "Error al iniciar sesión",
    noAccount: "¿No tienes una cuenta?",
    createOne: "Crear una",
    browse: "Explorar recursos sin una cuenta",
    registerTitle: "Crear una cuenta",
    registerDescription: "Únete a Schoolar para empezar a aprender y enseñar",
    fullName: "Nombre completo",
    namePlaceholder: "Ana García",
    newPasswordPlaceholder: "Mín. 8 caracteres",
    creatingAccount: "Creando cuenta…",
    createAccount: "Crear cuenta",
    registrationFailed: "Error al registrarse",
    hasAccount: "¿Ya tienes una cuenta?",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
  },
  fr: {
    tagline: "Votre plateforme de productivité pour élèves et enseignants",
    language: "Langue",
    loginTitle: "Se connecter",
    loginDescription: "Saisissez vos identifiants pour accéder à votre compte",
    email: "E-mail",
    emailPlaceholder: "vous@exemple.com",
    password: "Mot de passe",
    passwordPlaceholder: "Votre mot de passe",
    signingIn: "Connexion…",
    signIn: "Se connecter",
    loginFailed: "Échec de la connexion",
    noAccount: "Vous n’avez pas de compte ?",
    createOne: "Créer un compte",
    browse: "Parcourir les ressources sans compte",
    registerTitle: "Créer un compte",
    registerDescription: "Rejoignez Schoolar pour apprendre et enseigner",
    fullName: "Nom complet",
    namePlaceholder: "Marie Dupont",
    newPasswordPlaceholder: "8 caractères minimum",
    creatingAccount: "Création du compte…",
    createAccount: "Créer le compte",
    registrationFailed: "Échec de l’inscription",
    hasAccount: "Vous avez déjà un compte ?",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
  },
  de: {
    tagline: "Deine Produktivitätsplattform für Lernende und Lehrkräfte",
    language: "Sprache",
    loginTitle: "Anmelden",
    loginDescription:
      "Gib deine Zugangsdaten ein, um auf dein Konto zuzugreifen",
    email: "E-Mail",
    emailPlaceholder: "du@beispiel.de",
    password: "Passwort",
    passwordPlaceholder: "Dein Passwort",
    signingIn: "Anmeldung…",
    signIn: "Anmelden",
    loginFailed: "Anmeldung fehlgeschlagen",
    noAccount: "Noch kein Konto?",
    createOne: "Konto erstellen",
    browse: "Ressourcen ohne Konto durchsuchen",
    registerTitle: "Konto erstellen",
    registerDescription: "Komm zu Schoolar und beginne zu lernen und zu lehren",
    fullName: "Vollständiger Name",
    namePlaceholder: "Anna Schmidt",
    newPasswordPlaceholder: "Mind. 8 Zeichen",
    creatingAccount: "Konto wird erstellt…",
    createAccount: "Konto erstellen",
    registrationFailed: "Registrierung fehlgeschlagen",
    hasAccount: "Du hast bereits ein Konto?",
    showPassword: "Passwort anzeigen",
    hidePassword: "Passwort verbergen",
  },
  pt: {
    tagline: "Sua plataforma de produtividade para estudantes e professores",
    language: "Idioma",
    loginTitle: "Entrar",
    loginDescription: "Insira suas credenciais para acessar sua conta",
    email: "E-mail",
    emailPlaceholder: "voce@exemplo.com",
    password: "Senha",
    passwordPlaceholder: "Sua senha",
    signingIn: "Entrando…",
    signIn: "Entrar",
    loginFailed: "Falha ao entrar",
    noAccount: "Não tem uma conta?",
    createOne: "Criar uma",
    browse: "Explorar recursos sem uma conta",
    registerTitle: "Criar uma conta",
    registerDescription: "Entre no Schoolar para começar a aprender e ensinar",
    fullName: "Nome completo",
    namePlaceholder: "Ana Silva",
    newPasswordPlaceholder: "Mín. 8 caracteres",
    creatingAccount: "Criando conta…",
    createAccount: "Criar conta",
    registrationFailed: "Falha no cadastro",
    hasAccount: "Já tem uma conta?",
    showPassword: "Mostrar senha",
    hidePassword: "Ocultar senha",
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
      "Öğrenmeye ve öğretmeye başlamak için Schoolar’a katılın",
    fullName: "Ad soyad",
    namePlaceholder: "Ayşe Yılmaz",
    newPasswordPlaceholder: "En az 8 karakter",
    creatingAccount: "Hesap oluşturuluyor…",
    createAccount: "Hesap oluştur",
    registrationFailed: "Kayıt başarısız",
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
  }

  return { language, setLanguage, copy: AUTH_COPY[language] };
}
