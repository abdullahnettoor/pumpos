import { WHATSAPP_URL } from '../../config';

export const DEMO_PATH = '/demo';
export const WA_URL = WHATSAPP_URL;
export const waAsk = (question: string) => `${WHATSAPP_URL}?q=${encodeURIComponent(question)}`;
