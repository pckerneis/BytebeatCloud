import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

export default function ProfilePage() {
  const { user } = useSupabaseAuth();

  return (
    <section>
      <h2>Profile</h2>
      {user ? (
        <p>You are logged in as {user.email}.</p>
      ) : (
        <p>You are not logged in. Use the login page to sign in.</p>
      )}
    </section>
  );
}
