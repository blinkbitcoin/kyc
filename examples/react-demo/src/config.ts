export const API_ORIGIN = 'http://localhost:4000';
export const GRAPHQL_URL = `${API_ORIGIN}/graphql`;

export type KycMode = 'hosted' | 'proxy';

const MODE = import.meta.env.VITE_KYC_MODE;
export const KYC_MODE: KycMode = MODE === 'proxy' ? 'proxy' : 'hosted';
