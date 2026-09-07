# Paddle for Casparel web checkout

Casparel uses Paddle through the existing RevenueCat JavaScript SDK. Do not
add a second checkout library or replace the Android/iOS SDK keys.

Follow [RevenueCat's Paddle provider setup](https://www.revenuecat.com/docs/web/integrations/paddle)
to connect Paddle to the existing Casparel RevenueCat project. Use the Web SDK
configuration and approve `casparel.com` as a checkout domain.

Map the imported Paddle prices in RevenueCat's `default` offering:

| Custom package identifier | Paddle recurring price | Existing entitlement |
| --- | --- | --- |
| `plus_monthly` | Plus, monthly | `plus` |
| `plus_yearly` | Plus, yearly | `plus` |
| `pro_monthly` | Pro, monthly | `pro` |
| `pro_yearly` | Pro, yearly | `pro` |

Keep the existing mobile products attached to these packages. Paddle assigns
`pri_…` identifiers to its prices. Casparel reads those IDs from RevenueCat;
there is no need to paste them into source code. Unknown packages, one-time
products, and mismatched billing periods are excluded from checkout.

## Configuration locations

| Value | Where it belongs |
| --- | --- |
| Paddle API secret | RevenueCat's Paddle provider configuration |
| RevenueCat Paddle public SDK key (`pdl_…`) | GitHub Actions variable `VITE_REVENUECAT_WEB_API_KEY` |
| RevenueCat server secret | Hostinger API environment `REVENUECAT_SECRET_API_KEY` |
| Existing RevenueCat webhook authorization | Hostinger API environment `REVENUECAT_WEBHOOK_AUTH` and matching RevenueCat webhook settings |

The public SDK key is listed under RevenueCat's project API keys for the
Paddle app. It is different from Paddle's own API secret or client-side token.

The GitHub deployment builds the website served at `casparel.com`. Rebuild and
deploy after changing its public SDK key. Adding a key only to Replit does not
configure this Hostinger deployment.

## Verify before enabling live payments

Use the separate Paddle sandbox configuration first. Confirm all four packages
show their provider prices. Complete a sandbox checkout while signed in, then
check RevenueCat's entitlement and the account's Casparel plan. Reload and sign
in on mobile with the same account to verify access persists. Check cancellation
and that an existing subscriber is directed to subscription management rather
than charged for a second subscription.

Live checkout still requires Paddle approval, live prices, the production
RevenueCat Paddle public key, and a successful end-to-end purchase test.
