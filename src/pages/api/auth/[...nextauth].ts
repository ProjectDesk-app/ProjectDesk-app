import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { generateToken, tokenExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/mailer";

export const authOptions = {
  adapter: PrismaAdapter(prisma), // ✅ Added adapter
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials?.email },
        });

        if (!user || !user.passwordHash) throw new Error("No user found");
        const isValid = await compare(credentials!.password, user.passwordHash);
        if (!isValid) throw new Error("Invalid password");

        if (!user.emailVerified) {
          const token = generateToken(24);
          const expiresAt = tokenExpiry(24);

          await prisma.$transaction([
            prisma.emailVerification.deleteMany({ where: { userId: user.id } }),
            prisma.emailVerification.create({
              data: {
                userId: user.id,
                token,
                expiresAt,
              },
            }),
          ]);

          const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
          const verifyLink = `${baseUrl}/verify-email?token=${token}`;

          await sendEmail(
            user.email,
            "Verify your ProjectDesk account",
            `Hello ${user.name || "there"},\n\nPlease confirm your email by visiting the link below:\n${verifyLink}\n\nIf you did not request this, you can ignore the message.`
          );

          throw new Error("Email not verified");
        }

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
        } as any;
      },
    }),
  ],

  session: {
    strategy: "jwt" as const,
  },

  callbacks: {
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id ? Number(token.id) : undefined;
        session.user.role = token.role as string;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
  },
};

export default NextAuth(authOptions);
