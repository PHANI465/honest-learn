// Outgoing email (verification codes, password resets).
// Development: printed to the server console. Production: Postmark (set POSTMARK_TOKEN and MAIL_FROM).
// MAIL_MODE=console forces console logging even in production (demo deployments only: codes end up in the logs).

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async send(to: string, subject: string, text: string) {
    console.log(`\n📧 [dev email] to=${to}\n   subject: ${subject}\n   ${text.replace(/\n/g, "\n   ")}\n`);
  }
}

/** Keeps sent mail in memory — used by tests. */
export class MemoryMailer implements Mailer {
  sent: { to: string; subject: string; text: string }[] = [];
  async send(to: string, subject: string, text: string) {
    this.sent.push({ to, subject, text });
  }
  lastCode(to: string): string | undefined {
    const m = [...this.sent].reverse().find((x) => x.to === to);
    return m?.text.match(/\b(\d{6})\b/)?.[1];
  }
}

export class PostmarkMailer implements Mailer {
  constructor(
    private token: string,
    private from: string,
  ) {}
  async send(to: string, subject: string, text: string) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "X-Postmark-Server-Token": this.token },
      body: JSON.stringify({ From: this.from, To: to, Subject: subject, TextBody: text, MessageStream: "outbound" }),
    });
    if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
  }
}

export function createMailer(): Mailer {
  if (process.env.MAIL_MODE === "console") return new ConsoleMailer();
  const token = process.env.POSTMARK_TOKEN;
  const from = process.env.MAIL_FROM;
  if (token && from) return new PostmarkMailer(token, from);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Production needs POSTMARK_TOKEN and MAIL_FROM so parents can verify email and reset passwords (or MAIL_MODE=console for a demo).",
    );
  }
  return new ConsoleMailer();
}
