import { View } from "react-native";
import { embedUrl } from "../lib/video";

/** Web: privacy-enhanced YouTube player in a sandboxed iframe (no pop-ups, no top-level navigation). */
export function VideoEmbed({ videoId, title }: { videoId: string; title: string }) {
  return (
    <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}>
      <iframe
        src={embedUrl(videoId)}
        title={title}
        style={{ border: 0, width: "100%", height: "100%" }}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </View>
  );
}
