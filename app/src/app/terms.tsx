import { LegalDoc } from "../components/LegalDoc";
import { TERMS } from "../content/legal";

/** The terms of use parents agree to at sign-up (docs/legal/TERMS.md). */
export default function Terms() {
  return <LegalDoc markdown={TERMS} />;
}
