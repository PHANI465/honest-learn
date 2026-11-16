import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, H1, H2, P, Screen } from "../components/ui";
import { licenceEntries, licenceTexts } from "../content/licences.generated";
import { colors } from "../lib/theme";

/**
 * The open source software and fonts the app includes, each under its own licence (these licences ask for their notice to be shown
 * with the app). The data is generated from the packages that are really in the app's bundles by scripts/build-licences.mjs; it is
 * also in THIRD_PARTY_NOTICES.md. Public, like the privacy notice: no sign-in needed.
 */
export default function Licences() {
  const [open, setOpen] = useState<string | null>(null);
  const packages = licenceEntries.filter((e) => e.kind === "package").length;
  const fonts = licenceEntries.length - packages;

  return (
    <Screen>
      <H1 size={26}>Open source licences</H1>
      <P>
        Honest Learn is built with free and open source software, and uses two free fonts on the website. Each piece is used under its own licence, shown below with its
        copyright notices. Thank you to everyone who made them.
      </P>
      <P size={14}>
        Honest Learn itself: the code is under the Apache License 2.0, and the lessons, quiz questions, facts and word lists are under Creative Commons Attribution-ShareAlike 4.0 (share and adapt them with credit, under the same licence).
      </P>
      <P muted size={14}>
        {packages} packages and {fonts} fonts, under {licenceTexts.length} licence wordings. Each lesson lists its own sources and their licences. Wikipedia text is
        shown with attribution under its Creative Commons licence.
      </P>

      {licenceTexts.map((g) => {
        const members = licenceEntries.filter((e) => e.textId === g.id);
        const isOpen = open === g.id;
        return (
          <Card key={g.id} style={{ gap: 10 }}>
            <H2>{g.name}</H2>
            <P muted size={14}>
              Used by {members.length} {members.length === 1 ? "item" : "items"}
            </P>
            <Button
              title={isOpen ? "Hide the list and the licence text" : "Show the list and the licence text"}
              kind="secondary"
              onPress={() => setOpen(isOpen ? null : g.id)}
              label={`${isOpen ? "Hide" : "Show"} ${members.length === 1 ? "the item" : `the ${members.length} items`} and the full text of the ${g.name} licence`}
            />
            {isOpen ? (
              <View style={{ gap: 10 }}>
                {members.map((e) => (
                  <View key={`${e.name}@${e.version}`} accessible accessibilityLabel={`${e.name} ${e.version}. ${e.copyright.join(". ")}`} style={{ gap: 2 }}>
                    <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 14 }}>
                      {e.name} <Text style={{ fontWeight: "400", color: colors.muted }}>{e.version}</Text>
                    </Text>
                    {e.copyright.map((c) => (
                      <Text key={c} style={{ color: colors.muted, fontSize: 13 }}>{c}</Text>
                    ))}
                    {e.note ? <Text style={{ color: colors.muted, fontSize: 12, fontStyle: "italic" }}>{e.note}</Text> : null}
                    {e.notice ? <Text selectable style={{ color: colors.ink, fontSize: 12 }}>{e.notice}</Text> : null}
                  </View>
                ))}
                <Text accessibilityRole="header" style={{ fontWeight: "700", color: colors.ink, marginTop: 4 }}>The {g.name} licence</Text>
                <Text selectable style={{ color: colors.ink, fontSize: 12, lineHeight: 17, fontFamily: "monospace" }}>{g.text}</Text>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Button title="Back" kind="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
    </Screen>
  );
}
