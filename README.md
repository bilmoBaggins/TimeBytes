# TimeBytes Clock-In/Out System

A tablet/mobile app for TimeBytes employees to clock in/out with face recognition and for administrators to manage employees and payroll.

## Tech Stack

- **Expo SDK 57** — React Native framework, native module configuration, and development tooling
- **React 19.2 + React Native 0.86** — Mobile user interface and runtime
- **TypeScript 6.0** — Type-safe application code
- **React Navigation 6** — Clock and Payroll tab navigation
- **Expo Camera** — Front-camera capture for employee and administrator face enrollment and recognition
- **Expo SQLite** — Local tablet storage for employees, shifts, and administrator face records
- **Expo Haptics** — Clock action feedback
- **Expo FileSystem + Expo Sharing** — CSV payroll report creation and sharing
- **Supabase** — Anonymous device authentication and cloud synchronization
- **Supabase Edge Functions** — Server-side face enrollment, recognition, and deletion requests
- **AWS Rekognition** — Managed face indexing, matching, and deletion
- **Expo EAS Build** — Signed Android APK builds for tablet installation

## Features

- **Face Clock In/Out** — Employees tap their name tile and scan their enrolled face to toggle status.
- **Face-protected Payroll tab** — The Payroll/Admin tab is unlocked only by an enrolled administrator face.
- **Employee Management** — Add employees, edit hourly rates, enroll or remove faces, and delete employees.
- **Compact Employee Actions** — Edit, view history, and delete actions use accessible icons to keep employee rows uncluttered.
- **Administrator Management** — Add, rename, and remove multiple administrator faces from Security.
- **Payroll Dashboard** — Completed shifts (today) and monthly payroll totals per employee, plus an overall summary.
- **Pull-to-refresh** — Swipe down on either tab to reload data instead of a manual refresh button.
- **Tap-outside-to-close pop-ups** — Forms and history pop-ups close when tapping outside the card.
- **Local Database** — SQLite stores employees, shifts, and administrator faces on the tablet.
- **Cloud Backup** — Supabase keeps a one-tablet backup of employee, shift, and administrator records.

## Project Structure

```
src/
  database/
    database.ts      — SQLite setup, table creation & migrations
    employees.ts      — Employee CRUD and face enrollment state
    shifts.ts         — Clock in/out logic & shift calculations
    adminFaces.ts     — Administrator face management
  screens/
    ClockScreen.tsx   — Employee tile grid + face scanner
    AdminScreen.tsx   — Face-gated payroll dashboard & employee management
  types/
    index.ts          — TypeScript interfaces
  utils/
    payroll.ts         — Payroll calculations
  cloud/
    supabase.ts          — Optional Supabase client configuration
    sync.ts              — Offline-first cloud backup
App.tsx               — Root component, DB init & tab navigation setup
index.ts              — Entry point
```

## Database Schema

### employees
- `id` (INTEGER PRIMARY KEY)
- `name` (TEXT UNIQUE NOT NULL)
- `hourly_rate` (REAL, default: £12.00)
- `face_id` (TEXT, nullable) — AWS Rekognition face identifier
- `is_clocked_in` (INTEGER, 0/1) — current clock status, source of truth for the tile color

### shifts
- `id` (INTEGER PRIMARY KEY)
- `employee_id` (INTEGER FOREIGN KEY)
- `employee_name` (TEXT)
- `date` (TEXT, YYYY-MM-DD)
- `clock_in_time` (TEXT, HH:mm)
- `clock_out_time` (TEXT, HH:mm, nullable)
- `hourly_pay` (REAL, nullable) — calculated once clocked out

### admin_faces
- `id` (INTEGER PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `face_id` (TEXT, nullable) — AWS Rekognition administrator face identifier

## Setup & Running

### Prerequisites
- Node.js 22.13+
- npm
- Expo Go app on phone/tablet (iOS/Android)
- Laptop and phone/tablet connected to the **same Wi-Fi network**
- Windows Firewall allowing inbound connections on port 8081 (see below)

### Install & Run
```bash
npm install
npx expo start --port 8081 --lan
```

Scan the QR code in Expo Go on your device to load the app. Opening Payroll for the first time prompts you to enroll an administrator face.

### Windows Firewall (one-time setup)
Windows Firewall blocks inbound connections on the Metro bundler's port by default, which stops the phone/tablet from downloading the app bundle even when on the same Wi-Fi. Run this once in an **administrator** PowerShell terminal:
```powershell
New-NetFirewallRule -DisplayName "Expo 8081" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081
```

## Deploying to a Tablet (Standalone, No Dev Server)

Expo Go requires a computer running `npx expo start` on the same Wi-Fi network, which isn't practical for a permanently installed kiosk tablet. For a standalone install:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

This builds an installable `.apk` in the cloud (no local Android SDK needed). Transfer it to the tablet and install it directly — no dev server or same-network requirement. The tablet needs internet access for face enrollment, recognition, and face removal.

Alternatively, with Android Studio installed locally:
```bash
npx expo prebuild
npx expo run:android
```

## Development

### Add Dependencies
```bash
npx expo install [package-name]
```

### Debug
Check the Metro Bundler output in the terminal for compilation errors. Use `console.log` / `Alert.alert()` for debugging on device.

### Optional Cloud Backup

TimeBytes uses one anonymous, device-specific Supabase account. The tablet does not need employee cloud accounts. Face recognition requires this Supabase connection and internet access.

1. In Supabase, enable **Authentication → Providers → Anonymous Sign-Ins**.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Copy `.env.example` to `.env` and add the project URL and publishable key.
4. Restart Expo after changing `.env`; for EAS builds, add the same public variables to the selected EAS environment.

The database remains on the tablet, but face enrollment, recognition, and face removal require the cloud service.

### Face Recognition Setup

Face recognition uses the tablet camera plus an AWS Rekognition collection through a Supabase Edge Function. AWS credentials are kept in Supabase; never add them to `.env` or the Expo app.

1. For a new Supabase project, run `supabase/schema.sql` in the SQL Editor. For an existing linked project, apply the migrations instead:
  ```bash
  npx supabase db push
  ```
2. Create an AWS Rekognition collection in the same region used by the function:
  ```bash
  aws rekognition create-collection --collection-id biryani-bytes-employees --region eu-west-2
  ```
3. Give the function's AWS user permission for `rekognition:IndexFaces`, `rekognition:SearchFacesByImage`, and `rekognition:DeleteFaces`.
4. From the project root, configure and deploy the function. Use your Supabase project URL and publishable key for `PROJECT_URL` and `PROJECT_ANON_KEY`:
  ```bash
  npx supabase secrets set PROJECT_URL=https://your-project-ref.supabase.co PROJECT_ANON_KEY=your_publishable_key AWS_REGION=eu-west-2 AWS_ACCESS_KEY_ID=your_access_key AWS_SECRET_ACCESS_KEY=your_secret_key AWS_REKOGNITION_COLLECTION_ID=biryani-bytes-employees
  npx supabase functions deploy face-recognition
  ```
5. Open Payroll after installation to create and enroll the first administrator face. In Security, add, rename, or remove additional administrator faces. Use the gray face button beside an employee to enroll a face; it turns red when it can remove that face.

Face scanning requires internet access and employee consent. Clocking and Payroll access are unavailable when face recognition cannot be reached.

## License

MIT

