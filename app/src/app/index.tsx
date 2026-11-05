import { Redirect } from "expo-router";
import { Loading } from "../components/ui";
import { useSession } from "../lib/session";

/** Entry: decide where the family should land. */
export default function Index() {
  const { ready, familyToken, children } = useSession();
  if (!ready) return <Loading />;
  if (!familyToken) return <Redirect href="/welcome" />;
  if (children.length === 0) return <Redirect href="/parent" />;
  return <Redirect href="/profiles" />;
}
