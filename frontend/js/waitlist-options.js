/* The choices on the waitlist page, in one place: the page draws its form
   from them (waitlist.js) and the server accepts only them
   (api/waitlist.js), so an answer is always one the page offered.

   The answers are for sizing the market before building more: what kinds
   of food business want FinDash, where, in which languages, and how much
   paperwork they handle. */

export const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurant or takeout" },
  { value: "cafe", label: "Café or bakery" },
  { value: "grocery", label: "Grocery store or market" },
  { value: "producer", label: "Food producer or processor" },
  { value: "catering", label: "Catering or food truck" },
  { value: "distributor", label: "Food distributor or wholesaler" },
  { value: "other", label: "Something else" }
];

/* Each language under its English name and its own, so an owner can find
   theirs either way. Anything else goes in "Other languages". */
export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish", own: "Español" },
  { value: "zh", label: "Chinese", own: "中文" },
  { value: "vi", label: "Vietnamese", own: "Tiếng Việt" },
  { value: "ko", label: "Korean", own: "한국어" },
  { value: "tl", label: "Tagalog" },
  { value: "ar", label: "Arabic", own: "العربية" },
  { value: "hi", label: "Hindi", own: "हिन्दी" },
  { value: "pt", label: "Portuguese", own: "Português" },
  { value: "fr", label: "French", own: "Français" },
  { value: "ja", label: "Japanese", own: "日本語" },
  { value: "th", label: "Thai", own: "ไทย" }
];

/* Who speaks or writes each language: the owner, the staff, and the
   suppliers whose invoices come in. */
export const LANGUAGE_GROUPS = [
  { key: "ownerLanguages", label: "You" },
  { key: "staffLanguages", label: "Your staff" },
  { key: "invoiceLanguages", label: "Supplier invoices" }
];

export const INVOICE_COUNTS = [
  { value: "under-10", label: "Fewer than 10" },
  { value: "10-30", label: "10 to 30" },
  { value: "30-60", label: "30 to 60" },
  { value: "60-100", label: "60 to 100" },
  { value: "over-100", label: "More than 100" },
  { value: "not-sure", label: "Not sure" }
];

/* Suggestions for the country field, as people type. Any country can be
   typed; these are only the likeliest. */
export const COUNTRY_SUGGESTIONS = [
  "United States", "Canada", "Mexico", "United Kingdom", "Ireland", "Australia", "New Zealand",
  "China", "Hong Kong", "Taiwan", "Japan", "South Korea", "Vietnam", "Thailand", "Philippines", "Malaysia",
  "Singapore", "Indonesia", "India", "Pakistan", "Bangladesh", "United Arab Emirates", "Saudi Arabia",
  "Egypt", "Morocco", "Nigeria", "South Africa", "Spain", "France", "Germany", "Italy", "Portugal",
  "Netherlands", "Brazil", "Argentina", "Colombia", "Peru", "Chile", "Guatemala", "Dominican Republic"
];

/* The longest answer each text field takes. */
export const TEXT_LIMITS = {
  email: 254,
  country: 80,
  otherLanguages: 120,
  hardestPart: 600
};
