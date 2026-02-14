import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <section>
      <h2>Page not found</h2>
      <p>The page you are looking for does not exist or may have been moved.</p>
      <div className="mt-10">
        <Link href="/">Go back home</Link>
      </div>
    </section>
  );
}
