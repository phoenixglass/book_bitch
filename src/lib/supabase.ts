import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jclqocmlmgzrjolyvgca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OiPyh0WFccLy61hyilXm-w_A07ByWI5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
