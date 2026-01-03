import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { Layout } from '../components/Layout';
import Head from 'next/head';
import { ReactElement, ReactNode, useEffect } from 'react';
import { WeeklyChallengeProvider } from '../hooks/useCurrentWeeklyChallenge';
import { NextPage } from 'next';


export type NextPageWithLayout = NextPage & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

export default function App({ Component, pageProps }: AppPropsWithLayout) {
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

  const getLayout = Component.getLayout;

  return (
    <>
      <Head>
        <title>BytebeatCloud</title>
      </Head>
      <WeeklyChallengeProvider>
        {
          getLayout ? getLayout(<Component {...pageProps} />) :
            <Layout {...pageProps}>
              <Component/>
            </Layout>
        }
      </WeeklyChallengeProvider>
    </>
  );
}
