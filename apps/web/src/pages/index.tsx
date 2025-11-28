import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import type { GreetingResponse } from 'shared';

interface HomeProps {
  greeting: GreetingResponse | null;
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
  try {
    const res = await fetch('http://localhost:4000/');

    if (!res.ok) {
      return { props: { greeting: null } };
    }

    const data = (await res.json()) as GreetingResponse;
    return { props: { greeting: data } };
  } catch {
    return { props: { greeting: null } };
  }
};

export default function Home({ greeting }: HomeProps) {
  return (
    <>
      <section style={{ marginTop: '1rem' }}>
        <h2>API status</h2>
        {greeting ? (
          <>
            <p>{greeting.message}</p>
            <p>Source: {greeting.source}</p>
          </>
        ) : (
          <p>API not reachable at the moment.</p>
        )}
      </section>
    </>
  );
}
