# Mobile App Expansion Plan

## Executive Summary

This document outlines the strategy for expanding My Whisper from a web-only application to a cross-platform solution supporting iOS, Android, and web. The plan is designed to be **implementable by Claude Code**, favoring code-first, CLI-friendly approaches.

---

## Current State Analysis

### Existing Architecture Strengths

| Aspect | Current State | Mobile Readiness |
|--------|---------------|------------------|
| Backend | AWS Lambda (serverless) | ✅ Ready - No changes needed |
| API | RESTful JSON endpoints | ✅ Ready - Works with any client |
| Authentication | Supabase Auth (Google OAuth) | ✅ Ready - Has mobile SDKs |
| Database | Supabase PostgreSQL with RLS | ✅ Ready - User isolation works |
| File Storage | S3 with presigned URLs | ✅ Ready - Platform-agnostic |
| AI Services | OpenAI Whisper + GPT-4o-mini | ✅ Ready - Backend handles this |

### Key Insight
The backend is already **100% mobile-ready**. The expansion work is purely on the **client side**.

---

## Technology Recommendation

### Recommended Approach: React Native with Expo

After analyzing the requirements and constraints, **React Native with Expo** is the recommended approach.

#### Why React Native + Expo?

| Factor | React Native + Expo | Flutter | PWA |
|--------|---------------------|---------|-----|
| Claude Code Friendly | ✅ Excellent | ✅ Good | ✅ Excellent |
| Native Audio Recording | ✅ Full access | ✅ Full access | ⚠️ Limited |
| Background Recording | ✅ Possible | ✅ Possible | ❌ Not possible |
| App Store Distribution | ✅ Yes | ✅ Yes | ⚠️ Limited |
| Code Sharing with Web | ✅ React concepts | ⚠️ Different paradigm | ✅ Same codebase |
| CLI Tooling | ✅ Expo CLI excellent | ✅ Flutter CLI excellent | ✅ Standard web tools |
| Learning Curve from Current | ✅ JS/TS familiar | ⚠️ Dart is new | ✅ No learning needed |
| Native Feel | ✅ Excellent | ✅ Excellent | ⚠️ Moderate |
| Push Notifications | ✅ Built-in | ✅ Built-in | ⚠️ Limited |
| Offline Support | ✅ Full control | ✅ Full control | ⚠️ Limited |

#### Why Not PWA?

While PWA would require minimal code changes, it has critical limitations for a voice recording app:
- **No background recording** - Recording stops when app is minimized
- **Limited audio API access** on iOS Safari
- **No reliable push notifications** on iOS
- **Cannot access advanced audio features** (noise cancellation, etc.)

#### Why Not Flutter?

Flutter is excellent but introduces a new language (Dart) and paradigm. React Native keeps the JavaScript/TypeScript ecosystem, making it easier for Claude Code to work with existing patterns.

---

## Architecture Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   iOS App       │   Android App   │        Web App              │
│   (React Native)│   (React Native)│   (Existing Vanilla JS)     │
│   via Expo      │   via Expo      │   on Vercel                 │
└────────┬────────┴────────┬────────┴─────────────┬───────────────┘
         │                 │                       │
         └─────────────────┼───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Shared     │
                    │  API Client │  (TypeScript - shared code)
                    └──────┬──────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│                      BACKEND LAYER                               │
│                   (NO CHANGES NEEDED)                            │
├─────────────────────────────────────────────────────────────────┤
│  AWS API Gateway → AWS Lambda → Supabase + S3 + OpenAI         │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile App Structure

```
mobile/
├── app/                          # Expo Router file-based routing
│   ├── (auth)/                   # Auth-required screens
│   │   ├── _layout.tsx           # Auth layout wrapper
│   │   ├── index.tsx             # Home/Record screen
│   │   ├── history.tsx           # Recording history
│   │   ├── history/[id].tsx      # Single recording view
│   │   └── settings.tsx          # User settings
│   ├── (public)/                 # Public screens
│   │   ├── login.tsx             # Login screen
│   │   └── shared/[id].tsx       # View shared recording
│   └── _layout.tsx               # Root layout
├── components/                   # Reusable components
│   ├── AudioRecorder.tsx         # Recording interface
│   ├── AudioPlayer.tsx           # Playback component
│   ├── TranscriptView.tsx        # Display transcript
│   ├── TranscriptEditor.tsx      # Edit transcript
│   ├── RecordingCard.tsx         # History list item
│   ├── WaveformVisualizer.tsx    # Audio visualization
│   └── common/                   # Shared UI components
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Modal.tsx
│       └── LoadingSpinner.tsx
├── services/                     # API and business logic
│   ├── api/
│   │   ├── client.ts             # HTTP client setup
│   │   ├── transcripts.ts        # Transcript endpoints
│   │   ├── upload.ts             # S3 upload logic
│   │   └── share.ts              # Sharing endpoints
│   ├── audio/
│   │   ├── recorder.ts           # Audio recording logic
│   │   └── player.ts             # Audio playback logic
│   └── auth/
│       └── supabase.ts           # Supabase auth setup
├── hooks/                        # Custom React hooks
│   ├── useAuth.ts                # Authentication state
│   ├── useRecorder.ts            # Recording logic
│   ├── useTranscripts.ts         # Transcript data
│   └── useAudioPlayer.ts         # Playback control
├── stores/                       # State management
│   ├── authStore.ts              # Auth state (Zustand)
│   ├── recordingStore.ts         # Recording state
│   └── settingsStore.ts          # App settings
├── utils/                        # Utility functions
│   ├── formatters.ts             # Date/time formatting
│   ├── storage.ts                # AsyncStorage helpers
│   └── permissions.ts            # Permission handling
├── constants/
│   ├── api.ts                    # API URLs
│   ├── theme.ts                  # Colors, typography
│   └── config.ts                 # App configuration
├── assets/                       # Static assets
│   ├── images/
│   └── fonts/
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── package.json
├── tsconfig.json
└── babel.config.js
```

---

## Feature Scope

### Phase 1: Core MVP (Recommended Starting Point)

Essential features for initial release:

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| Voice Recording | P0 | Medium | Core feature |
| Transcription | P0 | Low | Uses existing API |
| View Transcript | P0 | Low | Display with editing |
| Recording History | P0 | Low | List with pagination |
| Google Sign-In | P0 | Medium | Supabase Auth |
| Anonymous Mode | P1 | Low | Match web behavior |
| Audio Playback | P0 | Medium | With seeking |
| Edit Transcript | P1 | Low | Inline editing |
| Delete Recording | P1 | Low | With confirmation |
| Dark/Light Theme | P1 | Low | Match web themes |

### Phase 2: Feature Parity

Match web functionality:

| Feature | Priority | Complexity |
|---------|----------|------------|
| Personalization Display | P1 | Low |
| Share Recording | P1 | Medium |
| View Shared Recordings | P2 | Low |
| "Shared With Me" | P2 | Medium |
| Waveform Visualization | P2 | Medium |

### Phase 3: Mobile-Enhanced Features

Features that benefit from native capabilities:

| Feature | Priority | Complexity |
|---------|----------|------------|
| Background Recording | P2 | High |
| Push Notifications | P2 | Medium |
| Offline Mode | P3 | High |
| Widget (iOS/Android) | P3 | High |
| Apple Watch Support | P3 | High |

### Out of Scope (Initially)

The **Business Analyst (BA) module** is complex and should be excluded from initial mobile release:
- Access code management
- Session management
- Admin features
- Document generation

This can be added in a future phase if needed.

---

## Technical Implementation Details

### 1. Audio Recording

```typescript
// Using expo-av for audio recording
import { Audio } from 'expo-av';

interface RecordingState {
  isRecording: boolean;
  duration: number;
  uri: string | null;
}

async function startRecording(): Promise<Audio.Recording> {
  // Request permissions
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) throw new Error('Microphone permission required');

  // Configure audio mode
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true, // For background recording
  });

  // Start recording
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );

  return recording;
}
```

### 2. Authentication with Supabase

```typescript
// Using @supabase/supabase-js with React Native
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Google OAuth with Expo AuthSession
async function signInWithGoogle() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'mywhisper' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
    },
  });

  return { data, error };
}
```

### 3. S3 Upload with Presigned URLs

```typescript
// Reuse existing presigned URL pattern
async function uploadRecording(uri: string, filename: string): Promise<string> {
  // 1. Get presigned URL from API
  const { uploadUrl, key } = await apiClient.post('/get-upload-url', {
    filename,
    contentType: 'audio/m4a',
  });

  // 2. Read file and upload
  const response = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': 'audio/m4a' },
  });

  // 3. Move to permanent storage
  await apiClient.post('/move-to-shared', { filename });

  return key;
}
```

### 4. API Client

```typescript
// Centralized API client with auth handling
import axios from 'axios';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // Match Lambda timeout
});

// Add auth headers
apiClient.interceptors.request.use(async (config) => {
  const session = await supabase.auth.getSession();

  if (session.data.session?.access_token) {
    config.headers.Authorization = `Bearer ${session.data.session.access_token}`;
  } else {
    // Anonymous mode
    let anonymousId = await AsyncStorage.getItem('anonymousId');
    if (!anonymousId) {
      anonymousId = uuid.v4();
      await AsyncStorage.setItem('anonymousId', anonymousId);
    }
    config.headers['X-Anonymous-ID'] = anonymousId;
  }

  return config;
});
```

### 5. State Management (Zustand)

```typescript
// Lightweight state management
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RecordingStore {
  isRecording: boolean;
  duration: number;
  currentRecording: Audio.Recording | null;

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  pauseRecording: () => Promise<void>;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  isRecording: false,
  duration: 0,
  currentRecording: null,

  startRecording: async () => {
    const recording = await startRecording();
    set({ isRecording: true, currentRecording: recording });
  },

  stopRecording: async () => {
    const { currentRecording } = get();
    if (!currentRecording) throw new Error('No recording in progress');

    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();

    set({ isRecording: false, currentRecording: null, duration: 0 });
    return uri!;
  },
}));
```

---

## Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-av": "~14.0.0",
    "expo-file-system": "~17.0.0",
    "expo-auth-session": "~5.5.0",
    "expo-web-browser": "~13.0.0",
    "expo-router": "~4.0.0",
    "expo-secure-store": "~13.0.0",
    "expo-crypto": "~13.0.0",

    "@supabase/supabase-js": "^2.39.0",
    "@react-native-async-storage/async-storage": "1.23.1",

    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-safe-area-context": "4.12.0",

    "zustand": "^4.5.0",
    "axios": "^1.6.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "~5.3.0",
    "@expo/config-plugins": "~8.0.0"
  }
}
```

---

## Development Workflow

### Local Development

```bash
# Create new Expo project
npx create-expo-app@latest my-whisper-mobile --template expo-template-blank-typescript

# Install dependencies
cd my-whisper-mobile
npx expo install expo-av expo-file-system expo-auth-session expo-router

# Start development server
npx expo start

# Run on iOS Simulator (requires macOS)
npx expo run:ios

# Run on Android Emulator
npx expo run:android
```

### Testing Without Devices

```bash
# Expo Go app (fastest iteration)
npx expo start --tunnel

# Scan QR code with Expo Go app on your phone
```

### Building for Production

```bash
# Configure EAS Build
npx eas-cli init
npx eas-cli build:configure

# Build for App Store (iOS)
eas build --platform ios --profile production

# Build for Play Store (Android)
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

---

## Environment Configuration

### Environment Variables

```bash
# .env (local development)
EXPO_PUBLIC_API_URL=http://localhost:3001/api
EXPO_PUBLIC_SUPABASE_URL=https://vjimmmnexookthrdxrkz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

```bash
# .env.production
EXPO_PUBLIC_API_URL=https://s0ejd5tdzg.execute-api.eu-west-2.amazonaws.com/api
EXPO_PUBLIC_SUPABASE_URL=https://vjimmmnexookthrdxrkz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### app.json Configuration

```json
{
  "expo": {
    "name": "My Whisper",
    "slug": "my-whisper",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "mywhisper",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1a1a2e"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.mywhisper.app",
      "infoPlist": {
        "NSMicrophoneUsageDescription": "My Whisper needs microphone access to record your voice for transcription.",
        "UIBackgroundModes": ["audio"]
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1a1a2e"
      },
      "package": "com.mywhisper.app",
      "permissions": [
        "android.permission.RECORD_AUDIO",
        "android.permission.FOREGROUND_SERVICE"
      ]
    },
    "plugins": [
      [
        "expo-av",
        {
          "microphonePermission": "Allow My Whisper to access your microphone for voice recording."
        }
      ]
    ]
  }
}
```

---

## Backend Considerations

### API Changes Required

**Good news: No backend changes are required for Phase 1.**

The existing API supports mobile clients out of the box:
- RESTful JSON responses ✅
- JWT authentication via Authorization header ✅
- Anonymous ID via X-Anonymous-ID header ✅
- S3 presigned URLs work on mobile ✅
- CORS already configured ✅

### Optional Enhancements

For better mobile experience, consider these optional backend additions:

| Enhancement | Benefit | Priority |
|-------------|---------|----------|
| Push notification endpoint | Alert when transcription complete | P2 |
| Batch sync endpoint | Better offline support | P3 |
| Audio format conversion | Accept m4a from iOS | P2 |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

```
Tasks:
├── Project Setup
│   ├── Create Expo project with TypeScript
│   ├── Configure expo-router for navigation
│   ├── Set up folder structure
│   └── Configure environment variables
├── Authentication
│   ├── Set up Supabase client for React Native
│   ├── Implement Google OAuth flow
│   ├── Handle anonymous mode
│   └── Create auth state management
└── Basic UI
    ├── Create theme system (light/dark)
    ├── Build common components (Button, Card, etc.)
    └── Set up navigation structure
```

### Phase 2: Core Recording (Week 2-3)

```
Tasks:
├── Audio Recording
│   ├── Implement recording with expo-av
│   ├── Build recording UI (timer, controls)
│   ├── Handle permissions
│   └── Test on both platforms
├── File Upload
│   ├── Implement presigned URL upload
│   ├── Show upload progress
│   └── Handle upload errors
└── Transcription
    ├── Call transcription API
    ├── Show loading state
    ├── Display results
    └── Handle errors gracefully
```

### Phase 3: History & Playback (Week 3-4)

```
Tasks:
├── Recording History
│   ├── Fetch transcripts list
│   ├── Build list UI with cards
│   ├── Implement pagination
│   └── Pull-to-refresh
├── Audio Playback
│   ├── Build audio player component
│   ├── Implement seeking
│   ├── Show playback progress
│   └── Handle audio streaming
└── Transcript Management
    ├── View single transcript
    ├── Edit transcript inline
    ├── Delete with confirmation
    └── Show raw vs personalized text
```

### Phase 4: Polish & Release (Week 4-5)

```
Tasks:
├── UI Polish
│   ├── Animations and transitions
│   ├── Loading states
│   ├── Error handling UI
│   └── Empty states
├── Testing
│   ├── Test on physical devices
│   ├── Test various network conditions
│   ├── Test edge cases
│   └── Performance optimization
└── Release Prep
    ├── Create app icons and splash screens
    ├── Write App Store descriptions
    ├── Configure EAS Build
    ├── Build production apps
    └── Prepare store listings
```

---

## Claude Code Implementation Strategy

### What Claude Code Can Do

| Task | Approach |
|------|----------|
| Write all TypeScript/React Native code | Direct file creation and editing |
| Configure project files (JSON, JS configs) | File write operations |
| Run Expo CLI commands | Bash tool |
| Install npm packages | Bash tool |
| Create folder structure | Bash tool |
| Debug build errors | Read logs, fix code |
| Set up Git and commits | Bash tool |

### What Requires Human Assistance

| Task | Why | How Human Helps |
|------|-----|-----------------|
| Visual testing | Claude cannot see UI | User provides screenshots/feedback |
| Physical device testing | No access to devices | User runs on their devices |
| App Store submission | Requires account access | User submits built apps |
| Signing certificates | Requires Apple/Google accounts | User provides or configures |
| OAuth callback setup | Requires Supabase dashboard | User configures in dashboard |

### Recommended Workflow

1. **Claude Code writes code** → User reviews
2. **Claude Code runs build** → Checks for errors
3. **User runs on device** → Provides feedback
4. **Claude Code iterates** → Fixes issues
5. **Repeat until ready**
6. **User submits to stores**

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Audio format incompatibility | Medium | High | Test early, add format conversion if needed |
| Expo limitations | Low | Medium | Use development builds if needed |
| Performance on low-end devices | Medium | Medium | Profile and optimize |
| OAuth redirect issues | Medium | Medium | Test thoroughly on both platforms |

### Project Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Underestimated complexity | Medium | High | Start with MVP, iterate |
| App Store rejection | Low | Medium | Follow guidelines carefully |
| Visual bugs undetected | High | Low | Frequent user testing |

---

## Success Metrics

### Phase 1 Success Criteria

- [ ] User can sign in with Google
- [ ] User can record audio (up to 15 minutes)
- [ ] User can transcribe recording
- [ ] User can view transcript
- [ ] App runs on both iOS and Android
- [ ] Basic dark/light theme works

### Full Release Success Criteria

- [ ] Feature parity with web (core features)
- [ ] App Store approval (iOS)
- [ ] Play Store approval (Android)
- [ ] Less than 5% crash rate
- [ ] Transcription works reliably

---

## Cost Estimate

### Development Tools (All Free)

- Expo: Free (EAS Build has free tier)
- React Native: Free (open source)
- TypeScript: Free

### Distribution

| Platform | Cost |
|----------|------|
| Apple Developer Account | $99/year |
| Google Play Developer Account | $25 one-time |

### Ongoing Costs

Same as current web app (Lambda, S3, OpenAI) - no additional backend costs.

---

## Appendix

### Alternative Approaches Considered

#### 1. Progressive Web App (PWA)

**Pros:**
- Minimal code changes
- Single codebase
- No app store approval needed

**Cons:**
- No background recording (deal-breaker)
- Limited iOS support
- No push notifications on iOS
- Not a "real" app feel

**Verdict:** Rejected due to audio limitations

#### 2. Flutter

**Pros:**
- Excellent performance
- Beautiful UI toolkit
- Single codebase

**Cons:**
- New language (Dart)
- Different paradigm from existing JS code
- Steeper learning curve

**Verdict:** Good option, but React Native is more aligned with existing stack

#### 3. Native Development (Swift + Kotlin)

**Pros:**
- Best performance
- Full platform access
- Native look and feel

**Cons:**
- Two separate codebases
- Double the development work
- Requires platform-specific knowledge

**Verdict:** Rejected due to maintenance overhead

### Useful Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Audio API (expo-av)](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Supabase React Native Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)

---

## Next Steps

1. **Confirm this plan** - Review and approve the approach
2. **Set up development environment** - Create Expo project
3. **Begin Phase 1** - Authentication and basic structure
4. **Iterate with feedback** - User tests, Claude Code fixes

---

*Document created: 2026-02-01*
*Plan Version: 1.0*
