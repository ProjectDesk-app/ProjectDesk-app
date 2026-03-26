import Credentials from 'next-auth/providers/credentials';
import AzureAD from 'next-auth/providers/azure-ad';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { SubscriptionType } from '@prisma/client';
import { isEmailBlocked, normalizeEmail } from '@/lib/blockedEmails';

const azureEnabled = process.env.AZURE_AD_ENABLED === 'true';
const localEnabled = process.env.LOCAL_AUTH_ENABLED !== 'false';

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' as const },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...(azureEnabled
      ? [
          AzureAD({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
            authorization: { params: { scope: 'openid profile email' } },
          }),
        ]
      : []),
    ...(localEnabled
      ? [
          Credentials({
            name: 'Credentials',
            credentials: {
              email: { label: 'Email', type: 'email' },
              password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
              const normalizedEmail = normalizeEmail(credentials?.email);
              if (!normalizedEmail || !credentials?.password) return null;
              if (await isEmailBlocked(normalizedEmail)) {
                throw new Error('This email address has been blocked from ProjectDesk');
              }
              const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
              if (!user || !user.passwordHash) return null;
              const ok = await bcrypt.compare(credentials.password, user.passwordHash);
              if (!ok) return null;
              if (user.subscriptionType === SubscriptionType.SPONSORED && !user.sponsorId) {
                throw new Error('Awaiting sponsorship approval');
              }
              return {
                id: String(user.id),
                name: user.name ?? user.email,
                email: user.email,
                role: user.role,
                subscriptionType: user.subscriptionType,
                subscriptionStartedAt: user.subscriptionStartedAt,
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                sponsorId: user.sponsorId,
                sponsorSubscriptionInactive: user.sponsorSubscriptionInactive,
              } as any;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, profile }: any) {
      const email = normalizeEmail(user?.email || profile?.email);
      if (email && (await isEmailBlocked(email))) {
        throw new Error('This email address has been blocked from ProjectDesk');
      }

      return true;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = (user as any).id ?? token.id;
        token.role = (user as any).role ?? token.role;
        token.subscriptionType = (user as any).subscriptionType ?? token.subscriptionType;
        token.subscriptionStartedAt = (user as any).subscriptionStartedAt
          ? new Date((user as any).subscriptionStartedAt).toISOString()
          : token.subscriptionStartedAt ?? null;
        token.subscriptionExpiresAt = (user as any).subscriptionExpiresAt
          ? new Date((user as any).subscriptionExpiresAt).toISOString()
          : token.subscriptionExpiresAt ?? null;
        token.sponsorId =
          typeof (user as any).sponsorId === 'number'
            ? (user as any).sponsorId
            : (user as any).sponsorId != null
            ? Number((user as any).sponsorId)
            : token.sponsorId ?? null;
        token.sponsorSubscriptionInactive =
          typeof (user as any).sponsorSubscriptionInactive === 'boolean'
            ? (user as any).sponsorSubscriptionInactive
            : token.sponsorSubscriptionInactive ?? false;
      }

      const userId = Number(token.id ?? token.sub);
      if (!userId) {
        return token;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          subscriptionType: true,
          subscriptionStartedAt: true,
          subscriptionExpiresAt: true,
          sponsorId: true,
          sponsorSubscriptionInactive: true,
        },
      });

      if (!dbUser) {
        return {};
      }

      token.id = dbUser.id;
      token.sub = String(dbUser.id);
      token.role = dbUser.role;
      token.name = dbUser.name ?? dbUser.email;
      token.email = dbUser.email;
      token.subscriptionType = dbUser.subscriptionType;
      token.subscriptionStartedAt = dbUser.subscriptionStartedAt
        ? dbUser.subscriptionStartedAt.toISOString()
        : null;
      token.subscriptionExpiresAt = dbUser.subscriptionExpiresAt
        ? dbUser.subscriptionExpiresAt.toISOString()
        : null;
      token.sponsorId = dbUser.sponsorId ?? null;
      token.sponsorSubscriptionInactive = dbUser.sponsorSubscriptionInactive ?? false;

      return token;
    },
    async session({ session, token }: any) {
      if (!token?.id) {
        return null;
      }

      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).subscriptionType = token.subscriptionType;
        (session.user as any).subscriptionStartedAt = token.subscriptionStartedAt ?? null;
        (session.user as any).subscriptionExpiresAt = token.subscriptionExpiresAt ?? null;
        (session.user as any).sponsorId = token.sponsorId ?? null;
        (session.user as any).sponsorSubscriptionInactive =
          typeof token.sponsorSubscriptionInactive === 'boolean'
            ? token.sponsorSubscriptionInactive
            : Boolean(token.sponsorSubscriptionInactive);
      }
      return session;
    },
  },
};

export function requireRole(role: string, userRole?: string) {
  if (!userRole) return false;
  if (role === 'supervisor') return userRole === 'supervisor' || userRole === 'admin';
  if (role === 'admin') return userRole === 'admin';
  return true; // anyone
}
