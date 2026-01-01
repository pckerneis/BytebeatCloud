import Head from 'next/head';
import Link from 'next/link';

export default function WhatIsBytebeat() {
  return (
    <>
      <Head>
        <title>Bytebeat: Make Music with Code</title>
        <meta
          name="description"
          content="Bytebeat is a fun way to create music using simple code. Learn what it is, how it works, and try it yourself on BytebeatCloud."
        />
      </Head>
      <section>
        <h1>Bytebeat: make music with just a line of code</h1>

        <h2>Definition of Bytebeat</h2>

        <p>
          <b>Bytebeat</b> is a playful way of making algorithmic music using very simple code.
          Instead of recording instruments or arranging notes on a timeline, you write a short
          mathematical expression that directly generates sound.
        </p>

        <p>
          Because the sound is calculated by the code itself, bytebeat is also a form of generative
          sound, meaning the music is generated automatically rather than recorded or arranged by
          hand.
        </p>

        <p>
          The idea became popular in the late 2000s among programmers who enjoyed experimenting with
          creative constraints. In bytebeat, a single variable — usually called{' '}
          <span className="inline-code">t</span> — represents time. For each moment in time, the
          expression produces a number, and that number is played as sound. That’s it.
        </p>

        <p>
          Even though the rules are simple, the results can be surprisingly musical. With just basic
          math and logic, bytebeat can create beats, melodies, looping patterns, ambient textures,
          or strange digital noises.
        </p>

        <p>
          Unlike traditional music production, there are no tracks, instruments, or samples.
          Everything comes from the code itself. This makes bytebeat a unique mix of <b>music</b>,{' '}
          <b>coding</b>, and <b>experimentation</b>, and a great entry point into creative coding
          for beginners.
        </p>

        <h2>How does bytebeat work?</h2>

        <p>
          Bytebeat works by repeating the same calculation over and over, very fast. Each time the
          calculation runs, it uses the current value of <span className="inline-code">t</span>{' '}
          (time) and outputs a number. That number becomes the audio signal you hear.
        </p>

        <p>
          Most bytebeat formulas use simple operations like addition, multiplication, division, and
          bitwise operators. You don’t need advanced math — many classic bytebeats are made from
          trial and error, curiosity, and small tweaks.
        </p>

        <p>
          Because the sound is generated live, you hear changes instantly when you edit the code.
          Change one number, press play, and the rhythm or melody might completely transform. This
          instant feedback makes bytebeat easy to explore, even if you’ve never written audio code
          before.
        </p>

        <p>
          Modern bytebeat tools run directly in the browser, so there’s nothing to install. You can
          experiment, break things, and discover new sounds just by editing a single line of code.
        </p>

        <h2>Bytebeat tools and platforms</h2>

        <p>
          Over time, several tools helped shape the bytebeat scene.{' '}
          <Link href="https://dollchan.net/bytebeat" target="_blank">
            Dollchan’s Bytebeat Composer
          </Link>{' '}
          and{' '}
          <Link
            href="http://greggman.com/downloads/examples/html5bytebeat/html5bytebeat.html"
            target="_blank"
          >
            Greggman’s bytebeat engine
          </Link>
          are classic tools that introduced many people to the concept.
        </p>

        <p>
          <b>BytebeatCloud</b> takes bytebeat a step further by focusing on creativity and
          community. You can create bytebeats in your browser, listen to what others have made, and
          share your own experiments with the world.
        </p>

        <h2>Try bytebeat yourself</h2>

        <p>
          The best way to understand bytebeat is to hear it and play with it. Start with community
          creations or jump straight into coding — it only takes one line of code.
        </p>

        <div>
          <Link href="/explore">→ Explore bytebeats</Link>
        </div>
        <div>
          <Link href="/create">→ Create a bytebeat now</Link>
        </div>
      </section>
    </>
  );
}
