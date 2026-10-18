/**
 * config.js — optional settings for syncing progress between devices.
 *
 * Leave both values empty and the site works exactly as before: progress stays on each device,
 * and the sign-in box on the Stats page is hidden.
 *
 * To turn sync on, create a free Supabase project and paste its details here
 * (Supabase dashboard -> Project Settings -> API). See "Syncing progress" in README.md.
 *
 * The anon ("publishable") key is MEANT to be public: it only allows what the database's
 * Row Level Security rules allow (supabase/schema.sql), which is "each user can only see their
 * own progress". Never put the service_role / secret key here.
 */
export const SUPABASE_URL = 'https://ijityvofbnrmjlpglfki.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_L3H5yE8GH2FbIam0InGIhQ_QJT8kGap';
