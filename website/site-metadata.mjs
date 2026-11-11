// Public route metadata and verified software facts.
export const pages={
  "/": {
    "title": "21Life — Open Source Commander Life Counter & EDH Tracker",
    "description": "A free, MIT-licensed Commander life counter with game history, pod statistics and Moxfield or Archidekt deck imports. Available on Android and web.",
    "h1": "Commander life counter. Open source. Free."
  },
  "/info/": {
    "title": "Free MTG Pod Analytics & Deck Statistics — 21Life",
    "description": "Track your Commander playgroup, compare deck results and run seasons with awards. Free, open source under the MIT license, with no feature paywalls.",
    "h1": "Your pod, decks and results."
  },
  "/download/": {
    "title": "Download 21Life — Android APK, Obtainium & Web App",
    "description": "Get 21Life from GitHub, keep it updated with Obtainium or use the web app. Free and open source. F-Droid availability is coming soon.",
    "h1": "Get 21Life."
  },
  "/guida/": {
    "title": "Import Moxfield & Archidekt Decks into 21Life — Guide",
    "description": "Add your Moxfield or Archidekt decks to 21Life, set up your Commander playgroup and start recording games. A short guide for Android and web.",
    "h1": "Your first game with 21Life."
  },
  "/supporto/": {
    "title": "21Life FAQ — Open Source, Accounts & F-Droid",
    "description": "Answers about 21Life: MIT license, free features, deck imports, guest players, account requirements, privacy and the upcoming F-Droid release.",
    "h1": "Questions about 21Life?"
  },
  "/confronto/": {
    "title": "21Life vs Playgroup and Lifetap — Open Source EDH Tracker",
    "description": "Compare Commander trackers by license, cost, deck imports and playgroup features. See where 21Life fits alongside Playgroup and Lifetap.",
    "h1": "21Life, Playgroup or Lifetap?"
  }
};
export const schemaBase=[
  {
    "@type": "WebSite",
    "@id": "https://21life.win/#website",
    "name": "21Life",
    "url": "https://21life.win/",
    "inLanguage": [
      "en",
      "it"
    ]
  },
  {
    "@type": "SoftwareApplication",
    "@id": "https://21life.win/#app",
    "name": "21Life",
    "url": "https://21life.win/",
    "description": "A free, open source Commander / EDH life counter with shared game history, deck statistics and playgroup management.",
    "applicationCategory": "GameApplication",
    "applicationSubCategory": "Magic: The Gathering Commander / EDH tracker",
    "operatingSystem": [
      "Android",
      "Web browser"
    ],
    "license": "https://github.com/marco201091-glitch/21life/blob/main/LICENSE",
    "isAccessibleForFree": true,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR"
    },
    "featureList": [
      "Multiplayer Commander life counter",
      "Moxfield and Archidekt deck imports",
      "Player and deck statistics",
      "Private playgroups and shared game history",
      "Seasons and awards without a paid feature tier",
      "No ads",
      "MIT-licensed source code available for inspection"
    ],
    "image": "https://21life.win/assets/emblem.png",
    "downloadUrl": "https://github.com/marco201091-glitch/21life/releases/download/v9.2.0/21life-v9.2.0.apk",
    "installUrl": [
      "https://app.21life.win"
    ],
    "sameAs": [
      "https://github.com/marco201091-glitch/21life"
    ],
    "softwareHelp": "https://21life.win/guida/",
    "subjectOf": {
      "@type": "WebPage",
      "url": "https://app.21life.win/legal/privacy",
      "name": "21Life privacy policy"
    }
  },
  {
    "@type": "SoftwareSourceCode",
    "@id": "https://21life.win/#source",
    "name": "21Life source code",
    "codeRepository": "https://github.com/marco201091-glitch/21life",
    "license": "https://github.com/marco201091-glitch/21life/blob/main/LICENSE",
    "targetProduct": {
      "@id": "https://21life.win/#app"
    }
  }
];
