# Building Student ERP APK

This guide explains how to build and deploy the Student ERP app as an Android APK.

## Prerequisites

### Required Software
- **Node.js** (v14+) — [Download](https://nodejs.org)
- **Android Studio** — [Download](https://developer.android.com/studio)
  - Or Android Command-line Tools (minimal setup)
- **Java JDK 11+** — Usually installed with Android Studio

### Android SDK Setup
- Android Studio installs the SDK automatically.
- If you use command-line tools only, install the SDK and set `ANDROID_HOME` or `ANDROID_SDK_ROOT`.
- For Capacitor builds, Android Studio must be able to find the SDK or you must create `android/local.properties` with the SDK path.

### Environment Setup

1. **Install Android SDK** (if using command-line tools):
   ```powershell
   # Add to system PATH:
   $ANDROID_HOME = "$env:USERPROFILE\AppData\Local\Android\Sdk"
   ```

2. **Configure Gradle** (installed by Android Studio automatically)

3. **Accept Android SDK licenses**:
   ```powershell
   # From Android SDK location
   ./cmdline-tools/latest/bin/sdkmanager --licenses
   # Type 'y' and Enter for each license
   ```

## Configure Remote Server URL

Before building, edit `src/config.js` to set your backend server URL:

```javascript
const CONFIG = {
  // Local development (for testing)
  // API_BASE_URL: 'http://localhost:3000',
  
  // Remote server (replace with your server IP or domain)
  API_BASE_URL: 'http://your-server-ip:3000',
  
  // Or production with domain
  // API_BASE_URL: 'https://api.yourdomain.com',
};
```

## Build Steps

### 1. Prepare Web Assets
```powershell
cd student-erp-app

# Install dependencies
npm install

# Copy web files to Android (if not done automatically)
npx cap copy android
```

### 2. Build Debug APK (for testing)

```powershell
cd android

# Build debug APK on Windows
gradlew.bat assembleDebug

# APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

### 3. Build Release APK (for distribution)

```powershell
cd android

# Build release APK on Windows
gradlew.bat assembleRelease

# APK output: android/app/build/outputs/apk/release/app-release.apk
```

**Note:** Release APKs require signing. See "Signing Release APK" section below.

## Signing Release APK

For distribution on Google Play or direct sharing:

### 1. Create Keystore (one-time)
```powershell
keytool -genkey -v -keystore my-release-key.jks `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -alias student-erp-key
```

This will prompt you for credentials. Keep this file **safe and private**.

### 2. Update Gradle Config

Edit `android/app/build.gradle`:

```gradle
signingConfigs {
  release {
    storeFile file('path/to/my-release-key.jks')
    storePassword 'your-store-password'
    keyAlias 'student-erp-key'
    keyPassword 'your-key-password'
  }
}

buildTypes {
  release {
    signingConfig signingConfigs.release
  }
}
```

### 3. Build Signed Release APK
```powershell
gradlew.bat assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

## Deploy & Distribute

### Option 1: Direct Installation (Testing)
1. Copy `app-debug.apk` to your Android phone
2. Enable "Unknown Sources" in Settings → Security
3. Open the APK file to install

### Option 2: Google Play Store
1. Create a [Google Play Developer Account](https://play.google.com/console) ($25 one-time fee)
2. Upload signed APK
3. Fill in app details and submit for review

### Option 3: Self-Hosted Distribution
Host the APK on your web server and share the link:
```
https://your-server.com/student-erp-app.apk
```

## Backend Deployment

The APK points to the backend URL in `config.js`. Deploy your Express server:

### On Linux/Cloud Server (e.g., AWS, DigitalOcean)
```bash
# SSH into server
ssh user@your-server

# Clone repo
git clone https://github.com/ayushi-codes/ERPClone.git
cd ERPClone/student-erp-app

# Install & run
npm install
npm run server

# For persistent running (use PM2)
npm install -g pm2
pm2 start server/index.js --name "student-erp"
pm2 startup
pm2 save
```

### Update APK Config After Deployment
Change `CONFIG.API_BASE_URL` in `src/config.js`:
```javascript
API_BASE_URL: 'http://your-server-ip:3000'  // or 'https://yourdomain.com'
```

Then rebuild and redeploy the APK.

## Testing

### Test App Locally
```powershell
npm run server
# Open http://localhost:3000 in browser
```

### Test APK on Emulator
```powershell
# Start Android emulator (from Android Studio)
# Then:
gradlew.bat installDebug
```

### Test on Physical Device
```powershell
# Connect via USB with USB debugging enabled
gradlew.bat installDebug
```

## Troubleshooting

### Gradle Not Found
```
Error: Could not find gradle.properties

Solution: Make sure you're in the android/ directory
```

### API Connection Fails
- Check `CONFIG.API_BASE_URL` in `src/config.js`
- Ensure backend server is running and accessible
- Check phone's internet connection (WiFi or mobile data)
- On emulator, use `10.0.2.2` instead of `localhost`

### Build Fails
```powershell
# Clean and rebuild
gradlew.bat clean
gradlew.bat assembleDebug
```

### ANDROID_HOME Not Set
```powershell
# Add to PATH permanently:
[Environment]::SetEnvironmentVariable('ANDROID_HOME', '$env:USERPROFILE\AppData\Local\Android\Sdk', 'User')
```

## Next Steps

1. **Customize branding**: Edit app name, icon, and splash screen in `android/app/src/main/AndroidManifest.xml`
2. **Add features**: Use Capacitor plugins for camera, notifications, etc.
3. **Monitor analytics**: Add Firebase or analytics SDK
4. **Push updates**: Rebuild APK and redeploy whenever you modify code

For more info, see [Capacitor docs](https://capacitorjs.com/docs/android/build).
