import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { Layout } from '../components/Layout';
import Head from 'next/head';
import { useEffect } from 'react';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // If the app no longer uses a service worker, proactively unregister any
    // previously installed registrations to prevent stale workers from
    // controlling pages and causing reload loops. Guarded to run only in the browser.
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const shouldUnregister = process.env.NEXT_PUBLIC_ENABLE_SW !== '1';
    if (!shouldUnregister) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => void 0);
  }, []);

  return (
    <>
      <Head>
        <title>BytebeatCloud</title>
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </>
  );
}
