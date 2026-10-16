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
   (README.md, "Paid plans"). */

export const PLANS = {
  free: {
    name: "Free",
    limits: { photo: 10, advice: 2, columns: 200 }
  },
  plus: {
    name: "Plus",
    monthlyPrice: 19,
    yearlyPrice: 190,
    limits: { photo: 100, advice: 20, columns: 200 }
  }
};

/* What a month's allowance of each feature is called: "10 photo reads". */
export const FEATURE_NAMES = {
  photo: "photo reads",
  advice: "requests for advice",
  columns: "column matches"
};
