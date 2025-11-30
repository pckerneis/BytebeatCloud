import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { Layout } from '../components/Layout';
import Head from 'next/head';
import { APP_NAME } from '../constants';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>{APP_NAME}</title>
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </>
  );
}
