import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions as any);

  return {
    redirect: {
      destination: session ? "/dashboard" : "/signin",
      permanent: false,
    },
  };
};

export default function Home() {
  return null;
}
