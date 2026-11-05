import { router } from "expo-router";
import { Fragment, type ReactNode } from "react";
import { Text, View } from "react-native";
import { colors } from "../lib/theme";
import { Banner, Button, H1, H2, P, Screen } from "./ui";

/** Renders the small Markdown subset used in docs/legal/*.md: #, ##, ###, "- " bullets, "> " notes, **bold**. */
export function LegalDoc({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n\s*\n/);
  return (
    <Screen>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block.trim())}</Fragment>
      ))}
      <Button title="Back" kind="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
    </Screen>
  );
}

function renderBlock(block: string): ReactNode {
  if (block.startsWith("# ")) return <H1 size={26}>{block.slice(2)}</H1>;
  if (block.startsWith("## ")) return <H2>{block.slice(3)}</H2>;
  if (block.startsWith("### ")) return <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink, marginTop: 4 }} accessibilityRole="header">{block.slice(4)}</Text>;
  if (block.startsWith("> ")) return <Banner tone="warn">{inline(block.replace(/^> ?/gm, ""))}</Banner>;
  const lines = block.split("\n");
  if (lines.every((l) => l.startsWith("- "))) {
    return (
      <View style={{ gap: 8 }}>
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ fontSize: 16, lineHeight: 23, color: colors.ink }}>•</Text>
            <View style={{ flex: 1 }}>
              <P>{inline(l.slice(2))}</P>
            </View>
          </View>
        ))}
      </View>
    );
  }
  return <P>{inline(lines.join(" "))}</P>;
}

/** **bold** → bold text; everything else as written. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={i} style={{ fontWeight: "700" }}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}
