# Portfolio: structure
```
portfolio/
├── index.html  admin.html  style.css  script.js  admin.js  supabase.js
├── projects.json  testimonials.json
├── netlify.toml  sitemap.xml  robots.txt  supabase.sql
```

## Deploy
1. **Supabase**: create a project. In `supabase.sql`, replace every `ADMIN_EMAIL_HERE` with your admin email, then run the file in SQL Editor.
2. **Admin account**: disable public signups in Authentication settings, then create your user manually under Authentication > Users.
3. **Client config**: in `supabase.js`, replace the project URL, anon key, and admin email in the config block. Never use a service-role key in the site.
4. **GitHub**: create a repo and push this folder.
5. **Netlify**: import the repo, use an empty build command, and publish directory `.`. No Supabase environment variables are needed for this browser-client setup.
6. Replace `YOUR-SITE.netlify.app` in index.html, sitemap.xml and robots.txt with your real URL.
7. Enable Netlify Forms for the `lead` form and add an email notification to `rituldas340@gmail.com`. Test the lead form and visit `/admin.html` to manage projects. Project content is stored in Supabase; `projects.json` is no longer used by the site.
8. Analytics: enable Netlify Analytics (dashboard) or uncomment the Plausible line in index.html.

## Traffic attribution
The admin dashboard counts one visit per browser tab session. Share links tagged with `?utm_source=instagram` or `?utm_source=facebook` for reliable source attribution; social in-app browsers may hide referrer information. No IP address or personal identifier is stored.

## QR codes per place
Use one URL per location: `https://YOUR-SITE/?src=hotel1`, `?src=event1`, `?src=cafe2`.
Generate each at any QR generator (e.g. qr-code-generator.com, or free `qrencode -o hotel1.png "https://YOUR-SITE/?src=hotel1"`). Use short lowercase codes. Check results in Supabase: `select source, count(*) from leads group by source;`. Scan each code with a phone before printing.

## Replace before launch
- [ ] Name/title if needed, email, WhatsApp number (`wa.me/91XXXXXXXXXX`), LinkedIn URL
- [ ] All `[placeholder]` text in projects.json; add live links; only real results
- [ ] `YOUR-SITE.netlify.app` (index.html, sitemap.xml, robots.txt)
- [ ] Add `og.png` (1200x630) for link previews
- [ ] Budget options in index.html
- [ ] Add testimonials.json entries only when you have real ones
- [ ] Configure the Supabase URL, anon key, and admin email in supabase.js
