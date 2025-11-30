import { useRouter } from 'next/router';
import { UserProfileContent } from '../../components/UserProfileContent';
import Head from 'next/head';
import { APP_NAME } from '../../constants';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const uname = typeof username === 'string' ? username : null;

  return (
    <>
      <Head>
        <title>
          {APP_NAME} - {uname ?? 'User'}
        </title>
      </Head>
      <UserProfileContent username={uname} />
    </>
  );
}
