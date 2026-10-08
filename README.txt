TIRLA VENTURES WEBSITE

FILES
  index.html          The main site. Self-contained (3D, fonts, animations inside).
  apply.html          The Tirla Open application. Needs Supabase keys — see below.
  supabase-config.js  Your Supabase URL and public key. Edit this one file.
  privacy.html        Privacy policy.
  fonts.css           Brand fonts, shared by apply.html and privacy.html.
  supabase-setup.sql  Run once in Supabase to create the applications table.

HOW TO OPEN LOCALLY
  Right-click index.html > Open With > Google Chrome (or Safari / Edge).
  Do NOT use a preview window (Mac spacebar Quick Look, email/WhatsApp previews,
  or the Claude app preview) - those do not run animations or 3D.

BEFORE THE APPLICATION FORM WORKS
  1. Create a Supabase project. Choose the MUMBAI (ap-south-1) region - this
     cannot be changed later, and it is what keeps applicant data in India.
  2. Open supabase-setup.sql, paste it into Supabase > SQL Editor, run it.
  3. In Supabase > Settings > API, copy the Project URL and the public
     (anon / publishable) key. Never the service_role key.
  4. Open supabase-config.js and paste both values in. That is the only
     file you need to edit — leave apply.html alone.
  Until that is done the form will show a message instead of submitting.

  You read applications in Supabase > Table Editor > applications.

TO PUT IT ONLINE
  Upload the WHOLE FOLDER (not just index.html) to Netlify Drop
  (app.netlify.com/drop), Vercel, or any web host.
