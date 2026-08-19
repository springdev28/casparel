/**
 * How much room a scrolling tab screen has to leave under its content.
 *
 * The tab bar is `position: 'absolute'` (see app/(tabs)/_layout.tsx), so it
 * floats over whatever is behind it and nothing reserves space for it. Every
 * tab has to add that space itself, on top of the safe-area inset.
 *
 * Three tabs added 80 and the profile screen added 32, which is roughly half
 * of what the bar occupies -- so the bottom of the profile screen sat under
 * it. The card down there is "Delete account": a control an account holder is
 * entitled to reach, and one Apple's review guidelines require an app with
 * sign-up to offer in-app. It was on the screen and could not be touched.
 *
 * One number, in one place, so a new tab cannot pick a different half-right
 * one. mobileTabClearance.test.ts holds the tab screens to it.
 */
export const TAB_BAR_CLEARANCE = 80;
