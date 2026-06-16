/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sniubtppskopxkpznfkh.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_4qh9e2uY02O81ph_1Z31EA_McoeuVjq';

export const supabase = createClient(supabaseUrl, supabaseKey);
