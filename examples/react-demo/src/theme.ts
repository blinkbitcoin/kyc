// What a branded, multilingual host hands the component: Blink's palette
// (orange primary, dark text on it) and Spanish copy. Every key is optional;
// what is left out keeps the component's default.

import type {
  IdentityVerificationLabels,
  IdentityVerificationTheme,
} from '@blinkbitcoin/kyc-react';
import type { KycUi } from './config';

export const BLINK_THEME: IdentityVerificationTheme = {
  primaryColor: '#F7931A',
  primaryTextColor: '#000000',
  textColor: '#1D1D1D',
  mutedTextColor: '#5A5A5A',
  successColor: '#1E7E34',
  errorColor: '#C82333',
};

export const BLINK_LABELS: IdentityVerificationLabels = {
  title: 'Verificar identidad',
  subtitle: 'Ten tu documento a mano y permite el acceso a la cámara.',
  start: 'Verificar identidad',
  cancel: 'Cancelar',
  loading: 'Preparando la verificación...',
  inProgressTitle: 'Verificación en curso',
  inProgressSubtitle: 'Sigue los pasos en la ventana de verificación.',
  pendingTitle: 'Gracias',
  permissionTitle: 'Se necesita acceso a la cámara',
  permissionMessage: 'La cámara es necesaria para verificar tu identidad.',
  permissionHint:
    'Permite el acceso a la cámara para este sitio en tu navegador e inténtalo de nuevo.',
  retry: 'Intentar de nuevo',
  restart: 'Reiniciar',
  offlineTitle: 'Sin conexión',
  offlineMessage: 'Necesitas conexión para verificar tu identidad.',
  checkConnection: 'Comprobar conexión',
  errorTitle: 'La verificación falló',
  outcomeApproved: 'Tu identidad ha sido verificada.',
  outcomeDeclined:
    'No pudimos verificar tu identidad. Inténtalo con documentos más claros.',
  outcomeFinallyRejected: 'No fue posible verificar tu identidad.',
  outcomeIncomplete: 'Tu verificación está incompleta.',
  outcomeReviewing:
    'Estamos revisando tus documentos. Suele tardar unos minutos.',
  errorMessages: {
    NETWORK_ERROR: 'Se perdió la conexión. Revisa tu red e inténtalo de nuevo.',
    TOKEN_EXPIRED: 'Tu sesión de verificación caducó. Empieza de nuevo.',
  },
};

/** The `theme` / `labels` props for a UI variant; nothing for the default. */
export const uiProps = (
  ui: KycUi,
): {
  theme?: IdentityVerificationTheme;
  labels?: IdentityVerificationLabels;
} => (ui === 'themed' ? { theme: BLINK_THEME, labels: BLINK_LABELS } : {});
