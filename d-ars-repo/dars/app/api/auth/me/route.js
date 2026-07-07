import { cookies } from 'next/headers';
import { COOKIE, verifyToken, isEnforced, usingDemoUsers } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  const token = cookies().get(COOKIE)?.value;
  const user = token ? await verifyToken(token) : null;
  return Response.json({
    ok: !!user,
    user: user ? { name: user.name, role: user.role, u: user.u } : null,
    enforced: isEnforced(),
    demo: usingDemoUsers,
  });
}
