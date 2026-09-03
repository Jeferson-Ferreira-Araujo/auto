import { redirect } from "next/navigation";
import { getOptionalUser, userHasOrganization } from "@/lib/auth";

export default async function Home() {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  redirect((await userHasOrganization(user.id)) ? "/dashboard" : "/onboarding");
}
