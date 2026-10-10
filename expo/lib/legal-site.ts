import { getSupportEmail } from '@/lib/env';

export const LEGAL_SITE_NAME = '21Life - Tracker & Analytics';
export const LEGAL_BRAND_NAME = 'blackistoostrong';
export const LEGAL_CONTROLLER_NAME = 'Marco Andreani';
export const APP_VERSION = '9.1.1';
export const LEGAL_LAST_UPDATED = '2026-07-29';
export const FAN_CONTENT_NOTICE = `${LEGAL_SITE_NAME} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.`;

export function getLegalContactEmail() {
  return getSupportEmail().trim().toLowerCase();
}

export function getLegalContactLabel(_language: 'it' | 'en') {
  return getLegalContactEmail();
}
