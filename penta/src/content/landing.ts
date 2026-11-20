export const heroContent = {
  brand: { tag: "Penta", name: "Penta, home", href: "/" },
  meta: ["AY 2026–27 · 1st sem", "BSIT · PUP", "INTE 301 · SIA"],
  login: { label: "Log in", href: "/login" },
  labels: ["Series: Penta 01", "One mountain · three layers"],
  headline: { first: "Learn at", second: "Penta", mark: "™" },
  rows: [
    { name: "Layers", values: ["01 Routes", "02 Decks", "03 Ops"], marked: -1 },
    { name: "Role", values: ["Student", "Teacher"], marked: 0 },
  ],
  cta: { eyebrow: "Enter the stack", title: "Start climb", href: "/login" },
  deckCard: { layer: "02 Decks", title: "Message-based integration", chip: "LIVE", foot: "Slide 07 / 24" },
  opsCard: { layer: "03 Ops", foot: "Quiz 06 · Q 04 / 20" },
  counter: { from: "01", to: "03" },
  scroll: { label: "[ Scroll · the layers stack ]", href: "#stack" },
  tag: "Penta",
};

export const stackContent = {
  label: "The stack",
  title: { first: "Three layers.", second: "One building." },
  layers: [
    {
      index: "01",
      name: "Routes",
      sub: "LMS",
      description: "Classes, lessons and modules in one route. Progress shows as altitude, in meters.",
      tiles: ["Classes", "Lessons", "Modules", "Altitude"],
    },
    {
      index: "02",
      name: "Decks",
      sub: "Presentations",
      description:
        "Teachers upload PPTX or PDF. Students flip through, download, or follow a live session slide by slide.",
      tiles: ["Viewer", "Live", "Editor", "Library"],
    },
    {
      index: "03",
      name: "Ops",
      sub: "Activities",
      description:
        "Quizzes that grade themselves, DOCX and PDF uploads, a gradebook, and a thread for every activity.",
      tiles: ["Quizzes", "Uploads", "Gradebook", "Threads"],
    },
  ],
  goldTile: "Live",
  counter: { label: "Layer", total: "03" },
  skip: { label: "Skip to the layers", href: "#routes" },
};

export const panelsContent = {
  sampleLabel: "Sample data",
  filters: "Filters",
  routes: {
    title: "Routes",
    labels: ["Layer 01 · learning management", "6 classes · 1st sem"],
    list: ["Classes", "Lessons + modules", "Altitude"],
    feature: {
      label: "Continue where you left off",
      code: "INTE 301",
      name: "Systems Integration and Architecture 1",
      tag: "Routes",
      resume: "Resume · Lesson 06",
      lesson: "Message-based integration",
    },
    cards: [
      { code: "COMP 018", section: "Lab", title: "Database administration", lessonsDone: 7, lessonsTotal: 12, meters: 420 },
      { code: "COMP 016", section: "Lab", title: "Web development", lessonsDone: 5, lessonsTotal: 12, meters: 300 },
      { code: "COMP 034", section: "Lab", title: "Intro to data science", lessonsDone: 8, lessonsTotal: 12, meters: 480 },
    ],
    altitude: { start: "0 m", you: "You · 1,840 m", summit: "Summit 3,000 m" },
  },
  decks: {
    title: "Decks",
    labels: ["Layer 02 · presentations", "PPTX · PDF", "Linked to lessons"],
    live: "Live now · INTE 301",
    lesson: "INTE 301 · Lesson 06",
    position: "Slide 07 / 24 · following teacher",
    slide: {
      label: "07 · Message-based integration",
      boxes: ["Producer", "Broker", "Consumer"],
      sentence: "The producer never calls the consumer directly. The broker holds each message until a consumer takes it.",
    },
    thumbCount: 8,
    currentThumb: 7,
    liveCard: {
      label: "Live · you follow the teacher",
      text: "Your screen moves when the teacher moves. Browse freely any time, then jump back.",
      action: "Browse freely",
    },
    unlock: {
      label: "Finish this deck to unlock",
      title: "Quiz 06 · Message brokers",
      viewed: 7,
      total: 24,
    },
    cta: { href: "/login", eyebrow: "Slide 07 now", title: "Join live" },
  },
  ops: {
    title: "Ops",
    line: "When the deadline hits,",
    lineSoft: "everything else goes quiet.",
    cta: { href: "/login", eyebrow: "3 due this week", title: "Open ops" },
    inventory: "Ops inventory",
    labels: ["Layer 03 · activities"],
    items: [
      {
        icon: "M6 3 H18 V21 H6 Z M8.5 8 L10 9.5 L12.5 7 M8.5 13 L10 14.5 L12.5 12 M14 8.5 H16 M14 13.5 H16 M8.5 18 H16",
        kind: "Quiz · INTE 301",
        title: "Message brokers",
        meta: "20 items · auto-graded",
        status: "due",
        statusText: "Due Fri 23:59",
      },
      {
        icon: "M7 3 H14 L18 7 V21 H7 Z M14 3 V7 H18 M12.5 18 V11 M10 13.5 L12.5 11 L15 13.5",
        kind: "Upload · COMP 015",
        title: "Chapter 3 draft",
        meta: "DOCX or PDF · 25 MB",
        status: "late",
        statusText: "Late · 2 days",
      },
      {
        icon: "M12 3 L14.2 5.2 L17.3 5 L17.6 8.1 L20 10.2 L18.2 12.8 L18.8 15.9 L15.8 16.8 L14.3 19.6 L12 18.1 L9.7 19.6 L8.2 16.8 L5.2 15.9 L5.8 12.8 L4 10.2 L6.4 8.1 L6.7 5 L9.8 5.2 Z M8.8 11.6 L11 13.8 L15.3 9.5",
        kind: "Quiz · COMP 018",
        title: "Triggers + errors",
        meta: "10 items · 1 attempt",
        status: "graded",
        statusText: "Graded 9 / 10",
      },
      {
        icon: "M4 5 H16 V13 H9 L6 16 V13 H4 Z M18 9 H20 V17 H18 V20 L15 17 H11 V15",
        kind: "Thread · COMP 016",
        title: "Lab 5 questions",
        meta: "12 replies",
        status: "submitted",
        statusText: "Open",
      },
      {
        icon: "M4 20 V4 M4 20 H20 M8 16 V11 M12 16 V7 M16 16 V9",
        kind: "Gradebook",
        title: "Term standing",
        meta: "All 6 classes",
        status: "submitted",
        statusText: "Updated today",
      },
    ],
  },
} as const;

export const footerContent = {
  tag: "Penta",
  origin: "PENTA was built in a classroom. Not as a trend, but as a response.",
  protocol: "[ Protocol: INTE 301 · SIA ]",
  motto: "For those who climb. Not for the cram.",
  headline: ["Built for focus", "Made for height", "Forged by practice"],
  login: { label: "Log in with school email", href: "/login" },
  caption: ["©2026 PENTA", "INTE 301 project"],
} as const;
