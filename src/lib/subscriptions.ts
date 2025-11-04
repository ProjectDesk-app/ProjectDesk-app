import { SubscriptionType } from "@prisma/client";

export const SUPERVISOR_SPONSOR_LIMIT = 50;

export function canSponsorAccounts(subscriptionType: SubscriptionType): boolean {
  return (
    subscriptionType === SubscriptionType.SUBSCRIBED ||
    subscriptionType === SubscriptionType.ADMIN_APPROVED
  );
}

