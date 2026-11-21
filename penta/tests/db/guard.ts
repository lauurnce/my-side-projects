import { assertLocalSupabase } from "../../src/lib/supabase/local";

assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
