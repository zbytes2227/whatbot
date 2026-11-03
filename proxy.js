// Redirects unauthenticated visitors to the sign-in page before any
// dashboard page renders. API routes perform their own authentication.
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const user = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login') {
    return user ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (!user) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|manifest.json|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
