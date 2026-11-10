import type { PushState } from "@/lib/push-registration";

// F-Droid excludes the native push SDK and does not register device tokens.
export const getPushState = (): PushState => "unavailable";
export const subscribePushState = (_listener: () => void) => () => {};
export const retryPushRegistration = () => {};
export const setPushRetry = (_callback: (() => void) | null) => {};
export const getNotificationsModule = async () => null;
export const cancelPushRegistration = () => {};
export const registerCurrentDevice = async (_userId: string, _locale: string, _requestPermission = false) => {};
export const revokeCurrentDevice = async () => {};
