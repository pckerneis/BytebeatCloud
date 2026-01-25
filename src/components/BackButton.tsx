import { useRouter } from 'next/router';

interface BackButtonProps {
  fallbackPath?: string;
}

export function BackButton({ fallbackPath = '/explore' }: Readonly<BackButtonProps>) {
  const router = useRouter();

  const handleBack = () => {
    if (window.history.length > 1
      && document.referrer.indexOf(window.location.host) !== -1
    ) {
      router.back();
    } else {
      void router.push(fallbackPath);
    }
  };

  return (
    <button type="button" className="button ghost" onClick={handleBack}>
      ← Back
    </button>
  );
}
