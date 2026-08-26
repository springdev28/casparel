/**
 * @fileOverview Web screen role: renders the Legal Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
/**
 * /terms and /privacy.
 *
 * These are not decoration. The mobile paywall links to both, and Apple and
 * Google both require a reachable Terms/EULA and Privacy Policy before a
 * subscription app is accepted. Those links previously pointed at
 * casparel.app, a domain this project does not own, so they resolved to
 * nothing - a guaranteed review rejection and a broken promise to anyone who
 * tapped them before paying.
 *
 * The content describes both what the code does and the externally configured
 * services a shipped client may enable. Anything asserted here is checkable
 * against the repository, release configuration, or the named provider's own
 * documentation. Keep this page in step with monetization changes: an absolute
 * claim such as "no advertising SDK" becomes false as soon as a mobile build
 * includes an optional ad integration, even when production ads remain off.
 */
import { Link } from "wouter";

const SUPPORT_EMAIL = "support@casparel.com";
/** Kept in sync by hand; shown so readers can tell how current this is. */
const LAST_UPDATED = "26 August 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function LegalLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Last updated {LAST_UPDATED}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {intro}
      </p>
      {children}
      <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
        Questions about this page? Email{" "}
        <a className="text-primary-text hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        . See also our{" "}
        <Link href="/privacy" className="text-primary-text hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="text-primary-text hover:underline">
          Terms of Service
        </Link>
        .
      </p>
    </main>
  );
}

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro="These terms cover your use of Casparel on the web, on desktop, and on iOS and Android. By creating an account you agree to them."
    >
      <Section title="Your account">
        <p>
          You need an account to save resources, join classes, and use AI
          features. You are responsible for keeping your password private and
          for activity under your account. Tell us at {SUPPORT_EMAIL} if you
          believe someone else has access to it.
        </p>
        <p>
          You must be old enough to consent to an online service where you live.
          If you are using Casparel as part of a school, your school may have
          its own rules about what you may share.
        </p>
      </Section>

      <Section title="What you post">
        <p>
          You keep ownership of the resources, notes, canvases and messages you
          create. By posting them you allow us to store and display them so the
          product works, including showing them to the people you have chosen to
          share them with.
        </p>
        <p>
          Do not post material you have no right to share, or content that is
          unlawful, harassing, or designed to mislead other learners. We may
          remove content and restrict accounts that break this.
        </p>
      </Section>

      <Section title="Subscriptions">
        <p>
          Casparel Free includes the core library, schedules, citations and
          manual seating, holds one class of up to 30 members, 25 study
          activities, 10 learning goals, 5 resource lists and 3 canvases, and
          comes with a small taste of AI: two discovery searches a day and two
          deep research reports per rolling 30 days. Paid plans are specific
          to your account role: Student Plus and Student Pro raise the personal
          study allowances, Teacher Plus and Teacher Pro raise classroom
          allowances, and Teacher Pro adds explainable seating-plan
          suggestions. A student plan grants nothing on a teacher account and
          the other way round; the role-agnostic Plus and Pro plans remain on
          sale and work on any account role. Schools can license Casparel
          Institutional per seat: a sales-led licence, invoiced rather than
          bought at checkout, that we activate on each licensed account and
          that applies whatever the account&apos;s role. Every allowance on
          every plan, the Institutional licence included, is finite. No
          subscription is unlimited, and your current allowances and usage
          are always shown under Settings, then Plan. Subscriptions can be
          bought in the mobile apps, billed by Apple or Google, or on the web
          by card, billed through RevenueCat. All of them renew automatically
          and attach to your Casparel account, so a plan bought anywhere works
          everywhere you sign in. Cancel at any time: in your App Store or
          Google Play account settings for app purchases, or from the Manage
          billing link on the Plans page for card purchases; Institutional
          licences are cancelled by contacting us. Cancelling stops the next
          renewal; it does not refund the period already paid for.
        </p>
        <p>
          If a subscription ends, nothing you have already created is deleted or
          hidden. Work that exceeds the Free allowances stays available and
          stays yours; until you are back under the limit you cannot add more of
          that kind of item.
        </p>
        <p>
          Refunds for app purchases are handled by Apple or Google under their
          policies, not by us directly. For card purchases made on the web,
          contact {SUPPORT_EMAIL} and we will handle it with our payment
          provider.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          AI discovery and deep research generate suggestions from external
          sources; they can be wrong, out of date, or incomplete. The seating
          planner is rule-based rather than an AI model: it reads your saved
          layout and private notes literally, and its suggestions can still be
          wrong. Check anything you intend to rely on, particularly for
          assessed work or decisions affecting students. Casparel is a study
          aid, not an authority.
        </p>
      </Section>

      <Section title="Availability and changes">
        <p>
          We may change or discontinue features. If we make a change to these
          terms that materially affects you, we will update the date at the top
          of this page and, where the change is significant, tell you in the
          app.
        </p>
      </Section>

      <Section title="Ending your account">
        <p>
          You can delete your account at any time from Settings after confirming
          your password. This destroys your credentials and clears your profile;
          contributions to shared spaces stay, unlinked from you. See the
          Privacy Policy for exactly what is removed. We may suspend an account
          that breaks these terms, and will explain why when we do.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="This explains what Casparel stores, why, and who else sees it. It describes what the product actually does rather than what it might one day do."
    >
      <Section title="What we store">
        <p>
          <strong className="text-foreground">Account details.</strong> Your
          email address, name, and a hashed password. Passwords are never stored
          in a readable form.
        </p>
        <p>
          <strong className="text-foreground">Profile details you choose to
          add.</strong> Avatar, bio, subjects, year group or department,
          timezone and website, together with your visibility settings for each
          of them.
        </p>
        <p>
          <strong className="text-foreground">Your content.</strong> Resources
          you submit, lists, classes, schedules, canvases, forum posts and
          direct messages.
        </p>
        <p>
          <strong className="text-foreground">Usage counts.</strong> How many AI
          searches and deep research runs you have used, so free-tier limits can
          be applied.
        </p>
        <p>
          <strong className="text-foreground">Advertising events, when mobile
          advertising is enabled.</strong> Ad load, display or impression,
          click or open, failure, and impression-revenue events, together with
          technical fields such as the ad unit, placement, format, advertising
          network or mediator, impression identifier, currency, and revenue
          precision where available. These events measure the sponsored
          placement; they do not rank learning resources.
        </p>
      </Section>

      <Section title="What we do not do">
        <p>
          Casparel does not sell your personal data or use your profile,
          searches, study content, messages, classes, or credibility activity
          to build advertising profiles. A sponsored placement is kept separate
          from Casparel&apos;s organic search rankings, credibility reviews,
          Learning Lists and Paths, adaptive suggestions, and teacher
          recommendations.
        </p>
        <p>
          Paid plans are ad-free. The web and desktop clients do not currently
          show third-party advertising.
        </p>
      </Section>

      <Section title="Who else is involved">
        <p>
          <strong className="text-foreground">AI providers.</strong> When you run
          an AI search or deep research, your query is sent to an
          OpenAI-compatible API to produce results. Do not put anything
          confidential in a search box.
        </p>
        <p>
          <strong className="text-foreground">RevenueCat, Apple and Google.</strong>{" "}
          App-store subscriptions are processed by Apple or Google, and web
          card subscriptions by RevenueCat and its payment provider; both are
          reconciled through RevenueCat, which tells us whether your
          subscription is active. Your card details go to the payment
          processor, never to us; we never receive or store them.
        </p>
        <p>
          <strong className="text-foreground">Google AdMob and RevenueCat
          Ads.</strong> When the free mobile sponsored placement is enabled,
          AdMob supplies the advertisement and RevenueCat records the supported
          advertising events described below. Neither service is allowed to
          turn a paid placement into a Casparel recommendation or trust signal.
        </p>
        <p>
          <strong className="text-foreground">Google Calendar and Google
          Classroom.</strong> Optional. If you connect them, we store an access
          token so we can sync on your behalf, and nothing else from your Google
          account. Disconnecting removes the token.
        </p>
        <p>
          <strong className="text-foreground">Hosting.</strong> Data is stored in
          a managed PostgreSQL database in the EU and served from our
          application host.
        </p>
      </Section>

      <Section title="Advertising on the free mobile app">
        <p>
          When mobile advertising is enabled, a free-tier Android user may see
          one native sponsored learning-resource card near the top of the
          dashboard. It is labelled Sponsored and AD. If the advertising
          service is unavailable or not configured, Casparel shows no sponsored
          card.
        </p>
        <p>
          Google AdMob supplies the advertisement. Casparel requests
          non-personalized ads and may provide the current app or education
          context, but does not send your Casparel profile, study content,
          searches, messages, class work, or credibility activity for ad
          targeting. Non-personalized ads are not selected from your past
          behaviour. Google may still process information such as your IP
          address, device information, mobile advertising identifiers, coarse
          location, app context, and ad interactions to deliver ads, cap
          frequency, detect fraud, and produce aggregated reports.
        </p>
        <p>
          RevenueCat Ads receives supported ad lifecycle and impression-revenue
          events, including load, display or impression, click or open, failure,
          ad placement, unit, format, network or mediator, impression
          identifier, and revenue, currency, and precision where available.
          RevenueCat combines this with subscription reporting so Casparel can
          understand advertising and subscription revenue together.
        </p>
        <p>
          Where law or platform policy requires it, the mobile app must present
          the applicable advertising privacy and consent choices before using
          mobile identifiers or local storage. Production advertising must
          remain disabled until those consent controls, conservative content
          rating and category controls, and the applicable store disclosures
          are configured.
        </p>
        <p>
          Read more about{" "}
          <a
            className="text-primary-text hover:underline"
            href="https://policies.google.com/technologies/partner-sites"
          >
            how Google uses information from apps that use its services
          </a>{" "}
          and the{" "}
          <a
            className="text-primary-text hover:underline"
            href="https://www.revenuecat.com/privacy/"
          >
            RevenueCat privacy policy
          </a>
          .
        </p>
      </Section>

      <Section title="Students and younger users">
        <p>
          Casparel is intended for people old enough to consent to the service
          where they live, or people using it with authorization from a school,
          parent, or guardian. We do not use a learner&apos;s age, school, class
          membership, or educational content to personalize advertising.
          Production advertising must remain disabled for an audience that
          requires child-directed or under-age-of-consent treatment until that
          treatment and any required authorization are correctly configured.
        </p>
      </Section>

      <Section title="Who can see your content">
        <p>
          Your profile and library default to <em>classmates</em>: people who
          share a class with you. You can change this in your profile settings.
          Resources you submit publicly are visible to anyone browsing Casparel.
          Direct messages are visible to you and the person you sent them to.
        </p>
        <p>
          Joining a class requires you to accept an invitation. Nobody can add
          you to a class, and so gain classmate-level visibility of your
          profile, without your agreement.
        </p>
      </Section>

      <Section title="Keeping and deleting data">
        <p>
          We keep your data while your account exists. You can delete your
          account at any time from Settings. Resetting or deleting an account
          requires your password so another person using an unlocked device
          cannot activate either action without confirming your identity.
        </p>
        <p>
          Deleting removes your personal details: your email address and
          password are destroyed, your name, avatar, bio, subjects, year group
          and website are cleared, and the account can no longer be signed in
          to. Resources and posts you contributed to shared spaces remain, no
          longer linked to you and shown as authored by a deleted user, so that
          other people's lists and classes do not break. If you want particular
          contributions removed as well, or a copy of your data first, email{" "}
          {SUPPORT_EMAIL} and we will do it by hand.
        </p>
        <p>
          Third-party providers keep information under their own retention
          rules and legal obligations. Deleting your Casparel account does not
          automatically control copies held independently by Apple, Google,
          payment processors, AI providers, or RevenueCat. Email {SUPPORT_EMAIL}
          if you need help routing a related privacy request.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Traffic is encrypted in transit. Passwords are hashed. Sessions expire
          and can be ended by signing out. No system is perfect: if we discover
          a breach affecting your data, we will tell you.
        </p>
      </Section>
    </LegalLayout>
  );
}
