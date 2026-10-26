# Android app (Capacitor) — कोडिङ नजान्नेका लागि गाइड

यो branch (`mobile-app`) मा मात्र Android app छ। `main` / Vercel वेबसाइटलाई केही असर गर्दैन।

## १. एकपटक गर्नुपर्ने: Supabase मा app को लिंक अनुमति दिने
1. https://supabase.com/dashboard → आफ्नो project खोल्ने
2. **Authentication → URL Configuration**
3. **Redirect URLs** मा `com.myapp.app://auth` थपेर **Save**
(नगरे Google/Facebook लगइन र पासवर्ड रिसेट app मा फर्किँदैन।)

## २. app फोन/emulator मा चलाउने
1. कम्प्युटरमा terminal खोली: `npm install` त्यसपछि `npm run mobile:build`
2. Android Studio → **Open** → यो प्रोजेक्टको `android` फोल्डर छान्ने
3. "Gradle sync" सकिन कुर्ने (पहिलोपटक केही मिनेट)
4. device छान्ने: Emulator (Device Manager बाट बनाउने) वा USB ले जोडेको फोन
   (फोनमा Settings → About phone → Build number ७ पटक थिच्ने → Developer options → USB debugging अन)
5. हरियो ▶ **Run** थिच्ने

## ३. कोड फेरिएपछि
`npm run mobile:build` फेरि चलाउने, अनि Android Studio मा ▶ Run।

## ४. APK बनाउने
Android Studio → **Build → Build Bundle(s)/APK(s) → Build APK(s)** → "locate" थिच्ने।

## ५. Play Store
**Build → Generate Signed Bundle / APK → Android App Bundle**, नयाँ keystore बनाउने (फाइल र पासवर्ड सुरक्षित राख्ने)।
नाम/Package ID (अहिले "My App" / `com.myapp.app`) बदल्नुपर्दा `capacitor.config.ts`, `android/app/build.gradle` (applicationId), `lib/vansh/native.ts` को `APP_SCHEME`, AndroidManifest को scheme र Supabase Redirect URL सबै मिलाउनुपर्छ।

## ज्ञात सीमा
- AI semantic search (`/api/search`) app मा छैन; मुख्य वंशावली खोज चल्छ।
- Invitation link वेबसाइट (`https://baraltree.vercel.app`) को हुन्छ; फरक भए `NEXT_PUBLIC_SITE_URL` राख्ने।
