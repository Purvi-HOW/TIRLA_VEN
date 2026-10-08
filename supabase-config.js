/* Tirla Ventures — Supabase connection
 * ---------------------------------------------------------------
 * Fill in both values from your Supabase dashboard:
 *   Settings -> API -> Project URL, and the public anon/publishable key.
 *
 * Both are safe to publish. Row-level security on the applications
 * table lets this key add an application and nothing else — it cannot
 * read a single existing record back.
 *
 * NEVER put the service_role key here. It bypasses row-level security
 * and this file is public on GitHub.
 * --------------------------------------------------------------- */

const SUPABASE_URL             = 'PASTE_YOUR_PROJECT_URL';        /* e.g. https://abcdefgh.supabase.co */
const SUPABASE_PUBLISHABLE_KEY = 'PASTE_YOUR_PUBLISHABLE_KEY';
