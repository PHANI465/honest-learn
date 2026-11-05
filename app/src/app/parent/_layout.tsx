import { Redirect, Stack, router } from "expo-router";
import { PinPad } from "../../components/PinPad";
import { Loading, Screen } from "../../components/ui";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

/** Everything under /parent requires the parent PIN. */
export default function ParentLayout() {
  const { ready, familyToken, parentToken, children } = useSession();
  if (!ready) return <Loading />;
  if (!familyToken) return <Redirect href="/welcome" />;
  if (!parentToken) {
    return (
      <Screen>
        <PinPad
          title="Parent area"
          subtitle="Enter your parent PIN. Children can't change settings without it."
          onSuccess={() => {}}
          onCancel={children.length ? () => router.replace("/profiles") : undefined}
        />
      </Screen>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
