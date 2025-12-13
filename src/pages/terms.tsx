import Head from 'next/head';

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Services - BytebeatCloud</title>
      </Head>
      <section className="home-section">
        <h2>Terms of Service</h2>
        <p>
          Welcome to BytebeatCloud, an experimental platform for creating and sharing bytebeat
          expressions. By using this service, you agree to the following terms.
        </p>

        <h3>1. Usage Rules</h3>

        <p>
          You agree <b>not</b> to upload, post, or share any content that is:
        </p>
        <ul>
          <li>illegal or promotes illegal activities</li>
          <li>hateful, harassing, discriminatory, or otherwise offensive</li>
          <li>pornographic, sexually explicit, or intended to shock</li>
          <li>spam, commercial advertising, or automated posting</li>
          <li>harmful to the platform or other users (e.g., code injection attempts, exploits)</li>
        </ul>
        <p>We reserve the right to remove content or suspend accounts that violate these rules.</p>

        <h4>2. Experimental Nature of the Service</h4>

        <p>
          This app is currently in <b>experimental / early development phase.</b>
        </p>
        <p>This means:</p>
        <ul>
          <li>data may be lost or corrupted</li>
          <li>features may break or change without notice</li>
          <li>you may experience bugs, crashes, or downtime</li>
          <li>
            your posts, likes, drafts, or profile data are{' '}
            <b>not guaranteed to be permanently stored</b>
          </li>
        </ul>
        <p>Please do not rely on the service for anything critical.</p>

        <h4>3. User-Generated Content</h4>

        <p>You keep ownership of the bytebeat code, text, and other material you publish.</p>
        <p>
          However, by posting on the platform, you grant us a non-exclusive, worldwide license to:
        </p>
        <ul>
          <li>store, display, and distribute your content on the app</li>
          <li>generate audio from your code in the client</li>
          <li>use copies or thumbnails for previews, search, feed, or promotional material</li>
        </ul>
        <p>This is necessary for the platform to function.</p>
        <p>
          You are responsible for making sure your content does not violate copyright or other laws.
        </p>

        <h4>4. Forking & Derivatives</h4>

        <p>
          Users may “fork” or remix your bytebeat expressions unless you explicitly mark your post
          as non-forkable.
        </p>
        <p>Forks:</p>
        <ul>
          <li>will credit the original post</li>
          <li>may persist even if you delete your account, unless you request removal</li>
        </ul>
        <p>We may handle corner cases (e.g., deleted source posts) by:</p>
        <ul>
          <li>showing “Original post deleted”</li>
          <li>keeping forks functional unless legally required to remove them</li>
        </ul>

        <h4>5. Account & Security</h4>

        <p>You agree to:</p>
        <ul>
          <li>use a valid email for authentication</li>
          <li>not share your credentials</li>
          <li>report security issues instead of exploiting them</li>
        </ul>
        <p>We may delete inactive accounts after a long period of inactivity.</p>

        <h4>6. Privacy & Data</h4>

        <p>We store only the minimum data required for the platform to function:</p>
        <ul>
          <li>account info (email, username)</li>
          <li>posts and likes</li>
          <li>basic analytics (non-personal)</li>
        </ul>
        <p>We do not sell your data.</p>
        <p>We do not use targeted advertising.</p>
        <p>
          As this is an experimental service, <b>data may be removed without notice</b>.
        </p>

        <h4>7. No Sensitive or Personal Data</h4>

        <p>This platform is not designed to store or process sensitive information.</p>
        <p>
          You agree <b>not to upload, post, or include</b> in your content any:
        </p>
        <ul>
          <li>personal identifying information (e.g., full name, address, phone number, IDs)</li>
          <li>credentials (passwords, tokens, API keys)</li>
          <li>financial or payment data</li>
          <li>health information</li>
          <li>private conversations or confidential material</li>
          <li>any information you would not want publicly visible</li>
        </ul>
        <p>Any such data may be removed at our discretion.</p>
        <p>
          We are not responsible for the exposure, misuse, or loss of sensitive data posted in
          violation of these terms.
        </p>

        <h4>8. Limits & Fair Use</h4>

        <p>To keep costs sustainable, users agree not to:</p>
        <ul>
          <li>automate large-scale posting</li>
          <li>scrape or mass-download data</li>
          <li>attempt to overload servers, storage, or API quotas</li>
        </ul>
        <p>Rate limits or caps may be introduced at any time.</p>

        <h4>9. Disclaimer of Warranty</h4>

        <p>The service is provided “as is”, without any warranties.</p>
        <p>We make no guarantees about:</p>
        <ul>
          <li>uptime</li>
          <li>data retention</li>
          <li>availability</li>
          <li>bug-free experience</li>
        </ul>
        <p>Use at your own risk.</p>

        <h4>10. Termination</h4>

        <p>We reserve the right to:</p>
        <ul>
          <li>remove content</li>
          <li>suspend accounts</li>
          <li>block abusive activity</li>
          <li>shut down the service entirely</li>
        </ul>
        <p>If the service shuts down, you may lose access to your data.</p>

        <h4>11. Changes to the Terms</h4>

        <p>These terms may change over time.</p>
        <p>Major changes will be announced in the app or on our website.</p>
      </section>
    </>
  );
}
