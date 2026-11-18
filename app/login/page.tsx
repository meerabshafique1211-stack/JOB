import { signInWithGoogle, signInWithPassword, signUpWithPassword, sendMagicLink } from './actions';
import { Card, CardBody, Flash, Input, Label } from '@/components/ui';
import { SubmitButton } from '@/components/client';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-semibold">JobsApply</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Private workspace. One authorized user.</p>
        <Flash msg={sp.msg} err={sp.err} />
        <Card>
          <CardBody className="space-y-6">
            <form action={signInWithGoogle}>
              <SubmitButton className="w-full" variant="outline" pendingText="Redirecting to Google…">Continue with Google</SubmitButton>
            </form>
            <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
            <form className="space-y-3">
              <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
              <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" /></div>
              <div className="flex gap-2">
                <SubmitButton className="flex-1" formAction={signInWithPassword}>Sign in</SubmitButton>
                <SubmitButton className="flex-1" variant="outline" formAction={signUpWithPassword}>Create account</SubmitButton>
              </div>
              <SubmitButton className="w-full" variant="ghost" formAction={sendMagicLink} pendingText="Sending…">Email me a sign-in link instead</SubmitButton>
            </form>
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Sign-ups from any other address are blocked in the database.</p>
      </div>
    </main>
  );
}
