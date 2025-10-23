import Credentials from 'next-auth/providers/credentials';
import AzureAD from 'next-auth/providers/azure-ad';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

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
              if (!credentials?.email || !credentials?.password) return null;
              const user = await prisma.user.findUnique({ where: { email: credentials.email } });
              if (!user || !user.passwordHash) return null;
              const ok = await bcrypt.compare(credentials.password, user.passwordHash);
              if (!ok) return null;
              return { id: String(user.id), name: user.name ?? user.email, email: user.email, role: user.role } as any;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = (user as any).id ?? token.id;
        token.role = (user as any).role ?? token.role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
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
