import Head from 'next/head';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>BytebeatCloud - Privacy Policy</title>
      </Head>
      <section className="legal-section">
        <h1>Privacy Policy — bytebeat.cloud</h1>
        <div>
          <p>Last updated: 2025-12-02</p>

          <h2>1. Who is responsible?</h2>
          <p>
            <strong>Publisher:</strong> {process.env.LEGAL_PUBLISHER_NAME}
            <br />
            <strong>Contact:</strong> {process.env.LEGAL_CONTACT_EMAIL}
            <br />
            <strong>Website:</strong> bytebeat.cloud
          </p>

          <h2>2. Data we collect</h2>
          <p>We may collect the following personal data:</p>
          <ul>
            <li>Account information (email, username)</li>
            <li>User content (posts, likes)</li>
            <li>Technical logs (IP address, user agent, timestamps)</li>
            <li>Preferences (theme, settings)</li>
          </ul>

          <h2>3. Purpose and legal basis</h2>
          <p>We process personal data to:</p>
          <ul>
            <li>Provide and operate the service (contractual necessity)</li>
            <li>Maintain security and prevent abuse (legitimate interest)</li>
            <li>Comply with legal obligations</li>
            <li>With your consent when required (analytics, marketing)</li>
          </ul>

          <h2>4. Third-party processors</h2>
          <p>
            We use third-party services to host and operate the site. Current processors include:
          </p>
          <ul>
            <li>
              <strong>GitHub Pages</strong> — hosting static site assets (GitHub, Inc.)
            </li>
            <li>
              <strong>Supabase</strong> — database and auth (data processor)
            </li>
          </ul>
          <p>
            Before adding other processors (analytics, ads), we will update this policy and, when
            required, collect consent.
          </p>

          <h2>5. Data retention</h2>
          <p>
            User data is retained as long as the account exists. We may retain anonymized logs for
            security and analytics.
          </p>

          <h2>6. Your rights (GDPR)</h2>
          <p>If you are located in the EU, you have rights under the GDPR:</p>
          <ul>
            <li>Right of access</li>
            <li>Right to rectification</li>
            <li>Right to erasure</li>
            <li>Right to restrict processing</li>
            <li>Right to data portability</li>
            <li>Right to object</li>
          </ul>
          <p>
            To exercise your rights, contact: {process.env.LEGAL_CONTACT_EMAIL}. You may also lodge a
            complaint with a supervisory authority.
          </p>

          <h2>7. Cookies</h2>
          <p>The service uses:</p>
          <ul>
            <li>
              <strong>Essential cookies</strong> — required for authentication and preferences
            </li>
            <li>No third-party advertising cookies are used by default</li>
          </ul>

          <h2>8. Security</h2>
          <p>
            We take reasonable measures to protect data, including encryption in transit (HTTPS) and
            secure storage provided by our processors. However, no system is 100% secure.
          </p>

          <h2>9. International transfers</h2>
          <p>
            Processing may involve transfers to countries outside the EU. We rely on processors that
            provide appropriate safeguards (data residency options, standard contractual clauses) —
            check the processor documentation for details.
          </p>

          <h2>10. Contact & DPO</h2>
          <p>
            Contact: {process.env.LEGAL_CONTACT_EMAIL}
          </p>
          <p>
            We do not currently have a DPO appointed (contact us if you believe one is required).
          </p>
        </div>

        <footer>
          <p>
            This privacy policy is provided for informational purposes and does not constitute legal
            advice.
          </p>
        </footer>
      </section>
    </>
  );
}
