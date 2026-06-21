# Student ERP App (Prototype)

A pixel-matched mobile UI prototype of the Student ERP Dashboard and Attendance screens, built with plain HTML/CSS/JS so it runs instantly in any browser — no build step required.

## What's inside

- **Dashboard** (scrollable) — profile card, Fee Balance / Academic Calendar pills, Time Table card, CGPA / Percentage / Attendance progress rings, Result Terms bar chart, Placement Drives card.
- **Attendance** (opens when you tap the Attendance ring) — aggregate attendance bar plus a scrollable list of course cards with mini progress rings, matching the uploaded reference screenshots.

The Call Us / Any Query row has been removed, the hamburger icon is gone from the top bar, and the Result Terms bar chart now uses evenly spaced, properly aligned gridlines.

## How to run in VS Code

1. Open this folder in VS Code (`File > Open Folder...`).
2. Install the recommended **Live Server** extension (VS Code will prompt you, or install `ritwickdey.LiveServer` manually from the Extensions tab).
3. Right-click `src/index.html` and choose **"Open with Live Server"**.
   - Or just double-click `src/index.html` to open it directly in your browser — it works with zero server too, since everything is self-contained in one file.

### Alternative: run via npm

If you'd rather use the included npm script:

```bash
npm install
npm start
```

This spins up a local dev server on `http://127.0.0.1:5500` and opens the app automatically.

## Project structure

```
student-erp-app/
├── src/
│   └── index.html      # entire app: markup, styles, and logic in one file
├── .vscode/
│   ├── settings.json   # Live Server config
│   └── extensions.json # recommends the Live Server extension
├── package.json
└── README.md
```

## Mobile App (Android APK)

This project is now configured for building as an **Android APK** using Capacitor. The app works anywhere with remote backend support.

### Quick Start: Build APK

See [BUILD_APK.md](BUILD_APK.md) for detailed instructions.

**Prerequisites**: Android Studio, Node.js, Java 11+

**Basic steps**:
```powershell
# 1. Configure backend URL in src/config.js
# 2. Install dependencies
npm install

# 3. Build APK
cd android
gradlew.bat assembleDebug
# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

You can also run the APK build from the project root on Windows:

```powershell
npm run apk:debug
```

### Features

- ✅ Works offline (caches data)
- ✅ Configurable remote backend (see `src/config.js`)
- ✅ Can be deployed to Google Play or self-hosted
- ✅ Supports local and remote data management

### Change Backend Server

Edit `src/config.js`:
```javascript
const CONFIG = {
  API_BASE_URL: 'http://your-server-ip:3000',  // Change this to your server
};
```

Then rebuild the APK.

## Next steps (if you want to go further)

- Wire up the "Exam Schedule" tab and Time Table content.
- Add push notifications using Capacitor plugins
- Deploy backend to cloud (AWS, DigitalOcean, Heroku)
- Submit APK to Google Play Store for distribution

## Simple backend (added)

This repository now includes a minimal Express backend for remote updates. It serves the static UI and exposes a small JSON-backed API at `/api`.

To install and run the backend:

```powershell
cd student-erp-app
npm install
npm run server
# then open http://localhost:3000
```

Available endpoints (JSON):

- `GET /api/profile` — profile object
- `PUT /api/profile` — update profile
- `GET /api/stats` — stats object (cgpa, percentage, attendance, feeBalance)
- `PUT /api/stats` — update stats
- `GET /api/drives` — placement drives counts
- `PUT /api/drives` — update drives
- `GET /api/courses` — list of courses
- `POST /api/courses` — add course
- `PUT /api/courses/:id` — update course
- `DELETE /api/courses/:id` — remove course

Data is stored in `server/db.json` for easy local editing.
