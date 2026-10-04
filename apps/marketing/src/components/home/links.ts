import { WHATSAPP_NUMBER, WHATSAPP_URL } from '../../config';

export const DEMO_PATH = '/demo';
export const WA_URL = WHATSAPP_URL;
const waBase = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}`;
export const waAsk = (question: string) => `${waBase}?text=${encodeURIComponent(`Question about PumpOS: ${question}`)}`;
