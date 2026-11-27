# My Budget: put it on your phone

This folder is a complete app. It has no server and no account. Your entries are stored on your own phone, inside the app, and are never sent anywhere.

To use it on a phone you do two things: **put the folder on a web address once**, then **install it from that address**. The address only serves the app. It never sees your numbers.

## 1. Try it on your computer first

Double-click `index.html` and it opens in your browser. Entries you add are kept in that browser. This is fine for trying it out. Installing and offline use need a web address, so for those, serve the folder instead. Open a terminal in this folder and run:

```
python -m http.server 8080
```

Then open http://localhost:8080 in Chrome or Edge. (Data entered at `localhost` and data entered by double-clicking the file are kept separately.)

To look at it on your phone without hosting anything, connect the phone to the same Wi-Fi and open `http://<your computer's IP>:8080`. It works as a normal page, but phones will not offer to install it without HTTPS.

## 2. Put it online (free, about two minutes)

Pick one:

- **Netlify Drop:** go to https://app.netlify.com/drop and drag this whole `my-budget` folder onto the page. You get an `https://` address straight away. **Then claim the site by signing up (free).** A dropped site that nobody claims is deleted after about an hour, and your phone would lose the app.
- **Cloudflare Pages:** sign in (free), go to Workers & Pages, Create application, then Drag and drop your files. Choose a project name, drop the folder and deploy. (Cloudflare's separate "Drop" page only keeps a site for an hour, so use the dashboard route.)
- **GitHub Pages:** upload the folder to a new repository and turn on Pages. You get an `https://` address.
- **A server you already have:** copy the folder to any web server that uses HTTPS.

The address will be public, but it only contains the app and no data. If you prefer, give the site an unguessable name.

**Pick the address once and keep it.** Your data is stored under that address on your phone. If the address changes later (a new site, a renamed project), the installed app on the phone starts empty. Export a backup first and restore it in the app at the new address.

## 3. Install it

- **iPhone:** open the address in **Safari**, tap **Share**, then **Add to Home Screen**.
- **Android:** open the address in Chrome, then menu, then **Install app**. (Or use **Install app** inside Manage.)

**Install before you enter real data.** On an iPhone, the app on your home screen keeps its own storage, separate from Safari. If you typed entries in Safari first, open Manage, choose **Export backup**, then open the installed app and choose **Restore backup**.

After installing, open it from the home screen. It works with no signal.

## Where your data lives

- It is saved in the app's own storage on the phone (IndexedDB), not in a normal web page. Receipt photos are stored the same way.
- Manage, then Your data, shows whether the phone has agreed to protect it from automatic clearing. An installed app is protected on most phones. A tab in the browser may not be.
- Deleting the app, clearing the site's data or erasing the browser can remove it. **Export a backup now and then.** Manage, then **Export backup**, opens your phone's share sheet so you can save the file to Files or send it to yourself. The app reminds you after 30 days.
- **PIN lock:** Manage, then App lock, lets you ask for a PIN when the app opens and after you have been away for a set time. It keeps casual snoopers out and hides the app in your phone's app switcher. It does not encrypt your data, and backup files are not protected by it. A forgotten PIN cannot be recovered: the only way back in is "Forgot PIN?", which erases the app (restore a backup afterwards).
- To move to a new phone, export a backup on the old one and restore it on the new one.
- It does not sync between devices and it cannot read your bank. You type entries in. **Export entries (CSV)** gives you a spreadsheet of everything.

## Changing it

- **Name and colours:** the name is in `index.html` (the title and the `bname` text) and `manifest.webmanifest`. Colours are at the top of `app.css`. The icons are in `icons/`.
- **Updating the app:** after you change any file, open `sw.js` and change `VERSION` (it is `my-budget-v3` now, so use `my-budget-v4` next), then upload the folder again. Phones pick up the new version the next time they are online.
- **Starting categories** are in `js/core.js` (`DEFAULT_CATS`).

## What is in the folder

```
index.html            the app screen
app.css               the look
js/                   the code (data, charts, screens, forms)
manifest.webmanifest  what makes it installable
sw.js                 what makes it work offline
icons/                home screen icons
```
