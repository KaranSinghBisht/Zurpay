import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { Provider } from 'next-auth/providers/index';

const providers: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
} else if (process.env.NODE_ENV === 'production') {
  console.warn(
    'WARN: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set. ' +
      'Google OAuth will be disabled. Email-gated claims will not work.'
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.email = profile.email;
        token.googleId = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        (session.user as { googleId?: string }).googleId = token.googleId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
};
