import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '../styles/globals.css';
import { Layout } from '../components/Layout';
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
        const sendVersion = () => {
          if (!registration.active) return;
          registration.active.postMessage({ type: 'SET_VERSION', version });
        };

        sendVersion();

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          sendVersion();
        });
      })
      .catch(() => {
        // optional: ignore registration errors
      });
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
