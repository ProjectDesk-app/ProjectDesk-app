import NextAuth from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: number;
      name?: string | null;
      email?: string | null;
      role?: string;
      subscriptionType?: import("@prisma/client").SubscriptionType;
      subscriptionStartedAt?: string | null;
      subscriptionExpiresAt?: string | null;
      sponsorId?: number | null;
    };
  }

  interface User {
    id: number;
    role: string;
    subscriptionType: import("@prisma/client").SubscriptionType;
    subscriptionStartedAt: Date;
    subscriptionExpiresAt?: Date | null;
    sponsorId?: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: number;
    role?: string;
    subscriptionType?: import("@prisma/client").SubscriptionType;
    subscriptionStartedAt?: string;
    subscriptionExpiresAt?: string | null;
    sponsorId?: number | null;
  }
}
