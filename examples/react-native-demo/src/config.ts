import { Platform } from 'react-native';

declare const process: { env: { KYC_MODE?: string } };

const BACKEND_PORT = 4000;

export const getDevBackendHost = (platformOs: string): string =>
  platformOs === 'android' ? '10.0.2.2' : 'localhost';

const backendOrigin = `http://${getDevBackendHost(Platform.OS)}:${BACKEND_PORT}`;

export const GRAPHQL_URL = `${backendOrigin}/graphql`;

export type KycMode = 'native' | 'hosted' | 'proxy' | 'fake-native';

const MODE = process.env.KYC_MODE;
export const KYC_MODE: KycMode =
  MODE === 'hosted' || MODE === 'proxy' || MODE === 'fake-native'
    ? MODE
    : 'native';
