# Commis

**Community-Driven Commission Marketplace**

Commis is a mobile-first commission marketplace where users can discover creators, publish requests, place bids, and manage commissions.

## Features
- Client and Hunter roles
- Authentication and profiles
- Posts, communities, votes, and comments
- Creator portfolios
- Service requests, bids, and Hunter invitations
- Commission tracking and delivery
- Mock funds, escrow, disputes, and reviews
- Notifications and messaging
- Search and saved/liked content

## Technology
- Expo + React Native
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase Realtime

## Demo
**Android APK:**  
https://expo.dev/accounts/davidajon/projects/commis/builds/e67baffd-a76c-4de5-b4ce-2074e4961d5d

**Web:**  
https://commis--ihi797gieb.expo.app

## Running Locally
```bash
npm install
npx expo start
```

Configure the Supabase environment variables and apply the provided SQL files to your Supabase project.

## Main Workflow
Client creates a request → Hunter bids or is invited → Client accepts → Commission begins → Funds/escrow are managed → Hunter delivers → Commission is completed or disputed.

## Note
This is an academic prototype. Payments are simulated, and the web version uses the same mobile-first interface rather than a separate desktop design.
