# The Quintessential Tutors

A tutoring page with a small Netlify function that asks Gemini for answers.

## Files
- `public/index.html` - the app (page, portraits, and all its code)
- `netlify/functions/tutor.js` - asks Gemini; reads your key from GEMINI_API_KEY
- `netlify.toml` - tells Netlify where the two above are

## Setup (short version)
1. Get a free key at https://aistudio.google.com/apikey
2. Upload this whole folder to a new GitHub repository (keep the folders)
3. In Netlify: Add new project > Import an existing project > pick the repo > Deploy
4. In the Netlify project, add an environment variable named GEMINI_API_KEY with your key, then redeploy
5. Open your netlify.app address and ask a question

## Notes
- Never put your key in any file. Only in Netlify's environment variables.
- To use a different Gemini model, add an environment variable GEMINI_MODEL.
- The function allows 8 questions per minute per visitor, and Google's free tier has its own shared limits.
- The portraits are official artwork. Fine for a private project, but get permission or use your own art before making the site public.
