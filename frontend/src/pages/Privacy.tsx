import { Box, Typography, Link } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

const LAST_UPDATED = "21 July 2026";
const CONTACT_EMAIL = "ashleyben21@gmail.com";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box mb={4}>
    <Typography variant="h6" component="h2" gutterBottom>
      {title}
    </Typography>
    {children}
  </Box>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" color="text.secondary" paragraph>
    {children}
  </Typography>
);

const Privacy = () => (
  <Box maxWidth={680} mx="auto" py={2}>
    <Typography variant="h4" component="h1" gutterBottom>
      Privacy Policy
    </Typography>
    <Typography variant="body2" color="text.secondary" mb={4}>
      Last updated: {LAST_UPDATED}
    </Typography>

    <Section title="Who we are">
      <P>
        Matchamp is a tournament organisation tool. It is operated by Ashley
        Bennett (the &ldquo;data controller&rdquo; for account data). If you have any
        questions about this policy or your data, email{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
      </P>
    </Section>

    <Section title="What we collect">
      <P>
        <strong>Account data.</strong> When you create an account we store your
        email address, your name / display name, your password (stored only as
        a secure hash — we never see it), and your preferred role (player or
        organiser).
      </P>
      <P>
        <strong>Tournament data.</strong> Tournaments, rounds, matches, results,
        and the names of players. Player names are usually entered by the
        tournament organiser, or by players themselves when joining a
        tournament with a join link or code.
      </P>
      <P>
        <strong>Invite emails.</strong> If a workspace owner invites someone by
        email, we store that email address so the invite can be matched to the
        right person when they accept.
      </P>
      <P>
        <strong>Activity logs.</strong> We keep an internal log of changes to
        tournament data (who changed what, and when) to help recover from
        mistakes and investigate problems. These logs are automatically deleted
        after 12 months.
      </P>
      <P>
        <strong>Device data for anonymous players.</strong> If you join a
        tournament without an account, a random token is stored in your
        browser&rsquo;s local storage so you can get back to your matches. It
        identifies your browser only for that tournament and is not used for
        tracking.
      </P>
    </Section>

    <Section title="What we don't do">
      <P>
        We do not run advertising, we do not sell or share your data with
        anyone for marketing, and we do not use analytics trackers or tracking
        cookies. The only things stored in your browser are what&rsquo;s needed to
        keep you signed in and to remember tournaments you&rsquo;ve joined.
      </P>
    </Section>

    <Section title="Why we process your data (lawful basis)">
      <P>
        We process account and tournament data because it&rsquo;s necessary to
        provide the service you signed up for (&ldquo;performance of a
        contract&rdquo; under UK and EU GDPR). Activity logs and abuse
        prevention rely on our legitimate interest in keeping the service
        working and secure.
      </P>
    </Section>

    <Section title="Where your data lives">
      <P>
        All data is stored with Supabase (our database and authentication
        provider) in the AWS eu-west-1 region in Ireland, inside the EU. The
        website itself is served as static files from our hosting provider&rsquo;s
        content delivery network. Fonts are loaded from Google Fonts, which
        means your IP address is sent to Google when the page loads.
      </P>
    </Section>

    <Section title="How long we keep it">
      <P>
        Account data is kept until you delete your account. Activity logs are
        deleted after 12 months. Invite emails are deleted shortly after the
        invite is accepted, revoked, or expires. Tournament results (including
        player names) are kept as part of the organiser&rsquo;s tournament
        records until the organiser or workspace owner deletes them.
      </P>
    </Section>

    <Section title="Deleting your account">
      <P>
        You can delete your account yourself at any time from the{" "}
        <Link component={RouterLink} to="/me">
          My Account
        </Link>{" "}
        page. This permanently removes your account, profile, workspaces that
        only you own (including all their tournaments), and activity logs tied
        to your account. Tournaments in shared workspaces that other people
        co-own are handed over to the remaining owners rather than deleted, so
        their data isn&rsquo;t destroyed with your account.
      </P>
      <P>
        Player names in past tournament results may remain in the organiser&rsquo;s
        records after account deletion, in the same way results printed at an
        event would. If you want your name removed from a specific tournament,
        ask the organiser, or email us and we&rsquo;ll help.
      </P>
    </Section>

    <Section title="If an organiser added your name">
      <P>
        Organisers can add player names to their tournaments. The organiser is
        responsible for having a good reason to use your name. If your name
        appears in a tournament and you want it corrected or removed, contact
        the organiser or email us at{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
      </P>
    </Section>

    <Section title="Your rights">
      <P>
        Under UK and EU GDPR you can ask for a copy of your data, ask us to
        correct or delete it, object to processing, and ask for your data in a
        portable format. Email us and we&rsquo;ll respond within one month. If
        you&rsquo;re unhappy with how we handle your data, you can complain to the
        UK Information Commissioner&rsquo;s Office (
        <Link href="https://ico.org.uk" target="_blank" rel="noopener">
          ico.org.uk
        </Link>
        ) or your local supervisory authority.
      </P>
    </Section>

    <Section title="Changes to this policy">
      <P>
        If we make meaningful changes to this policy we&rsquo;ll update this page
        and note it in the{" "}
        <Link component={RouterLink} to="/whats-new">
          What&rsquo;s New
        </Link>{" "}
        page. Continued use of Matchamp after a change means you accept the
        updated policy.
      </P>
    </Section>
  </Box>
);

export default Privacy;
