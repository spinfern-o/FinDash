/* FinDash's plans: what each includes and what Plus costs.

   One list, read by the server (lib/ai-access.js decides from it how much
   each person may use) and by the pages (the account box shows it, and a
   test checks the pricing page says the same), so the limits enforced are
   always the ones advertised.

   Only the features that call Claude have limits: each use costs money.
   Everything that runs in the browser is free and unlimited on every plan.
   Limits are per calendar month (UTC) and count requests, so a photo that
   gets a second look counts twice.

   Prices are in US dollars and must match the prices set up in Stripe
   (README.md, "Paid plans"). Plus is priced so that even someone who uses
   every request still pays for what they cost: about $0.15 a photo read,
   $0.08 a piece of advice and $0.02 a column match on Claude, plus Stripe's
   fee. Check those against the token counts (README.md, "What each use
   really costs") before changing either side. */

export const PLANS = {
  free: {
    name: "Free",
    limits: { photo: 10, advice: 2, columns: 30 }
  },
  plus: {
    name: "Plus",
    monthlyPrice: 9,
    yearlyPrice: 90,
    limits: { photo: 50, advice: 10, columns: 30 }
  }
};

/* What a month's allowance of each feature is called: "10 photo reads". */
export const FEATURE_NAMES = {
  photo: "photo reads",
  advice: "requests for advice",
  columns: "column matches"
};
