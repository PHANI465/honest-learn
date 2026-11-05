import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../lib/api";
import { colors } from "../lib/theme";

interface Country {
  code: string;
  name: string;
}

/**
 * Optional country choice. It's only used so Hoot can name the right child helpline if a child
 * ever says they feel unsafe. `null` means "not set / other".
 */
export function CountryPicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    api<{ countries: Country[] }>("GET", "/content/countries")
      .then((r) => setCountries(r.countries))
      .catch(() => {});
  }, []);

  const chip = (code: string | null, label: string) => {
    const selected = value === code;
    return (
      <Pressable
        key={code ?? "none"}
        onPress={() => onChange(code)}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected, checked: selected }}
        style={{
          paddingHorizontal: 12,
          minHeight: 44,
          justifyContent: "center",
          borderRadius: 999,
          borderWidth: 2,
          borderColor: selected ? colors.brand : colors.inputLine,
          backgroundColor: selected ? colors.brandSoft : colors.card,
        }}
      >
        <Text style={{ color: colors.ink, fontWeight: "600" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
      {countries.map((c) => chip(c.code, c.name))}
      {chip(null, "Other / prefer not to say")}
    </View>
  );
}
