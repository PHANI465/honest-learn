import { View } from "react-native";
import { WebView } from "react-native-webview";
import { embedUrl } from "../lib/video";

/** Native (iOS/Android): privacy-enhanced YouTube player. Navigation away from the player is blocked. */
export function VideoEmbed({ videoId, title }: { videoId: string; title: string }) {
  const src = embedUrl(videoId);
  return (
    <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }} accessibilityLabel={`Video: ${title}`}>
      <WebView
        source={{ uri: src }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        setSupportMultipleWindows={false}
        // Only the embed itself may load. Clicks on the YouTube logo, end screens etc. are ignored.
        onShouldStartLoadWithRequest={(req) => req.url.startsWith("https://www.youtube-nocookie.com/embed/")}
      />
    </View>
  );
}
