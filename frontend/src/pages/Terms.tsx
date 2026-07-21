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

const Terms = () => (
  <Box maxWidth={680} mx="auto" py={2}>
    <Typography variant="h4" component="h1" gutterBottom>
      Terms of Service
    </Typography>
    <Typography variant="body2" color="text.secondary" mb={4}>
      Last updated: {LAST_UPDATED}
    </Typography>

    <Section title="The service">
      <P>
        Matchamp is a tool for organising and running tournaments — creating
        events, pairing players, recording results, and sharing standings. By
        creating an account or using the site you agree to these terms and to
        the{" "}
        <Link component={RouterLink} to="/privacy">
          Privacy Policy
        </Link>
        .
      </P>
    </Section>

    <Section title="Your account">
      <P>
        You&rsquo;re responsible for keeping your login details secure and for
        what happens under your account. You must give us a working email
        address so we can reach you about your account. You can delete your
        account at any time from the My Account page.
      </P>
    </Section>

    <Section title="Organisers and player data">
      <P>
        If you run tournaments, you&rsquo;ll be entering other people&rsquo;s names
        into Matchamp. Only enter information you have a genuine reason to use
        for running your event, and remove a player&rsquo;s name if they ask you
        to. Don&rsquo;t use player lists for anything beyond running your
        tournaments.
      </P>
    </Section>

    <Section title="Acceptable use">
      <P>
        Don&rsquo;t use Matchamp to do anything unlawful, to harass people, to
        impersonate others, or to attempt to break or overload the service.
        Don&rsquo;t try to access data that isn&rsquo;t yours. We may suspend or
        close accounts that break these rules.
      </P>
    </Section>

    <Section title="Service availability">
      <P>
        Matchamp is provided free of charge, &ldquo;as is&rdquo;. We work hard to keep
        it reliable, but we don&rsquo;t guarantee uninterrupted availability and
        we may change or discontinue features. Export or record anything
        critical to your event — to the fullest extent allowed by law, we&rsquo;re
        not liable for losses arising from use of the service. Nothing in
        these terms limits liability that can&rsquo;t legally be limited.
      </P>
    </Section>

    <Section title="Changes to these terms">
      <P>
        We may update these terms from time to time. Meaningful changes will be
        noted on the{" "}
        <Link component={RouterLink} to="/whats-new">
          What&rsquo;s New
        </Link>{" "}
        page. Continued use after a change means you accept the updated terms.
      </P>
    </Section>

    <Section title="Contact & governing law">
      <P>
        Questions about these terms:{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>. These
        terms are governed by the law of England and Wales.
      </P>
    </Section>
  </Box>
);

export default Terms;
