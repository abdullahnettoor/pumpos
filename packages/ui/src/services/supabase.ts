/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gpfqiesflrpmndhkfvhg.supabase.co';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_mMyWNusxZtScUxjTOD9fVA_ViTJ5Gvg';

export const supabase = createClient(supabaseUrl, supabaseKey);
