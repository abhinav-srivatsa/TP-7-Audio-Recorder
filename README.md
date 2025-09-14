# TP-7 Audio Recorder

A React Native Expo app inspired by the Teenage Engineering TP-7 audio recorder.

## Features

- Audio recording with start/stop/pause functionality
- Spinning disk animation that pauses on two-finger gesture
- Real-time stopwatch and date display
- Save functionality for recordings
- Recordings list with playback and progress bars

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Use the Expo Go app on your phone to scan the QR code and run the app.

## Development

This project is built with:
- React Native
- Expo
- expo-av for audio recording/playback
- react-native-reanimated for animations
- react-native-gesture-handler for gestures

## Setup for New Developers

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd tp7-audio-recorder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and add your Groq API key
   EXPO_PUBLIC_GROQ_API_KEY=your-actual-groq-api-key-here
   ```

4. **Start the development server**
   ```bash
   # IMPORTANT: Use -c flag to clear cache and load new env vars
   npx expo start -c
   ```

5. **Get a Groq API Key**
   - Go to [console.groq.com](https://console.groq.com/)
   - Create an account and generate an API key
   - Replace `your-actual-groq-api-key-here` in `.env` with your key

**Note**: If you add or change environment variables, always restart Expo with `npx expo start -c` to reload them.