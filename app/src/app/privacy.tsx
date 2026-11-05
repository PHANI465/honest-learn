import { LegalDoc } from "../components/LegalDoc";
import { PRIVACY_NOTICE } from "../content/legal";

/** The privacy notice parents agree to at sign-up (docs/legal/PRIVACY_NOTICE.md). */
export default function Privacy() {
  return <LegalDoc markdown={PRIVACY_NOTICE} />;
}
