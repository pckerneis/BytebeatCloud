import { useEffect } from 'react';
import { useRouter } from 'next/router';

export function useSyncTabQuery<T extends string>(
  tabs: readonly T[],
  onTab: (tab: T) => void,
): void {
  const router = useRouter();

  useEffect(() => {
    const q = router.query?.tab as string | string[] | undefined;
    const tab = Array.isArray(q) ? q[0] : q;

    if (tab && (tabs as readonly string[]).includes(tab)) {
      onTab(tab as T);
    } else {
      onTab(tabs[0]);
    }
  }, [router.query?.tab, tabs, onTab]);
}
