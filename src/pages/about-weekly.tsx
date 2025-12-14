import Head from 'next/head';
import Link from 'next/link';

export default function AboutWeekly() {
  return (
    <>
      <Head>
        <title>Weekly challenge - BytebeatCloud</title>
      </Head>
      <section>
        <h1>Bytebeat of the Week - About</h1>

        <p>
          <b>Bytebeat of the Week</b> is a recurring community challenge celebrating the most
          creative and surprising bytebeat expressions shared on BytebeatCloud.
        </p>

        <p>
          Each week, a new theme is announced. The theme is optional — it’s simply there to inspire
          ideas. Any new post created during the week and tagged for the challenge automatically
          participates.
        </p>

        <p>
          The challenge is here to highlight creators, spark experimentation, and give everyone
          (from beginners to bytebeat veterans) a space to explore algorithmic music together.
        </p>

        <h2>How It Works</h2>

        <h3>1. A New Theme Every Saturday</h3>

        <p>
          Every Saturday at 20:00 UTC introduces a fresh creative prompt. Themes are suggestions
          only. You can follow them or ignore them. No automated validation is performed.
        </p>

        <p>The current theme appears on the homepage.</p>

        <h3>2. Submit Your Post</h3>

        <p>To participate:</p>

        <ul>
          <li>create a new post during the challenge week</li>
          <li>
            enable the <b>&#34;Bytebeat of the Week&#34;</b> toggle, or
          </li>
          <li>
            add the week&#39;s tag manually (e.g. <b>#week4</b>)
          </li>
        </ul>

        <p>Make sure your post is public (not saved as a draft).</p>
        <p>
          Post only <b>original content</b>. If you steal someone else&#39;s code, your
          participation will be discarded.
        </p>

        <h3>3. Community Voting</h3>

        <p>
          Throughout the week, others can <Link href='/explore?tab=weekly'>explore and favorite</Link> submissions.
          At the end of the period (next Saturday at 20:00 UTC), the <b>most-favorited post</b> among eligible entries
          becomes the week&#39;s winner.
        </p>

        <p>
          Only engagement gathered <b>within the challenge week</b> is counted.
        </p>

        <h2>Winning & Rewards</h2>

        <p>The winning post receives:</p>

        <ul>
          <li>
            a <b>Top Pick badge</b>
          </li>
          <li>
            a permanent spot in the <Link href="/weekly-hall-of-fame">Hall of Fame</Link>
          </li>
          <li>a notification and boosted visibility on the site</li>
          <li>may be showcased on BytebeatCloud&apos;s official social media accounts</li>
        </ul>

        <p>
          By participating, creators grant BytebeatCloud permission to feature their winning
          submission (audio, code, and preview visuals) on its social channels for promotional
          purposes.
        </p>

        <h2>Rules</h2>

        <ul>
          <li>
            Posts must be <b>created during the challenge week</b>.
          </li>
          <li>They must include the week&#39;s tag.</li>
          <li>
            Theme participation is <b>optional</b>.
          </li>
          <li>
            Only <b>public posts</b> are eligible.
          </li>
          <li>Multiple entries are allowed (each must be a separate post).</li>
          <li>Collaborations are welcome; list all contributors.</li>
          <li>No NSFW content.</li>
          <li>Engagement counted only during the challenge week.</li>
          <li>
            Participants agree that winning entries may be promoted by BytebeatCloud on social
            networks.
          </li>
        </ul>

        <h2>Past Winners</h2>

        <p>
          A gallery of previous Bytebeat of the Week champions lives in the{' '}
          <Link href={'/weekly-hall-of-fame'}>Hall of Fame</Link> page.
        </p>
      </section>
    </>
  );
}
