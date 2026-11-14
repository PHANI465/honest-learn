// Website landing page (the web version of the welcome screen; phones and tablets in the native app keep welcome.tsx).
// Built to the "landing-page-design" rules: one offer, one audience, one primary action ("Create a free family account").
// Every number on this page comes from the app's own content or documents; nothing is invented (no testimonials exist yet).
import { router } from "expo-router";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ICONS, type IconName } from "../landing/icons";
import { LANDING_CSS } from "../landing/styles";

const REPO = "https://github.com/PHANI465/honest-learn";

function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

/** Sections rise and fade in once as they enter the screen. */
function Reveal({ children, className = "", as: Tag = "div", ...rest }: { children: ReactNode; className?: string; as?: "div" | "section"; id?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={`${className} reveal${shown ? " in" : ""}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Large statement whose words turn from muted to full colour one at a time as they cross a line near the bottom of the screen. */
function TaglineReveal({ text }: { text: string }) {
  const words = text.split(" ");
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLSpanElement[];
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("on"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // lit once it reaches the trigger line, and stays lit when it has scrolled past the top
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            e.target.classList.add("on");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -30% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <p className="heading-2" aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true">
          <span className="word" ref={(el) => { refs.current[i] = el; }}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

const NAV = [
  ["how", "How it works"],
  ["why", "Why it is different"],
  ["proof", "Check our work"],
  ["faq", "Questions"],
] as const;

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  { icon: "lightbulb", title: "Hints that teach, not tell", body: "Every question has three hints in order: a nudge, a bigger hint, then a worked example of a different problem. The answer shows only after all three, or after a correct try." },
  { icon: "compass", title: "Lessons for five age groups", body: "Ages 3 to 5, 6 to 8, 9 to 11, 12 to 14 and 15 to 18, across 11 subjects from language and maths to money, digital safety and health." },
  { icon: "key", title: "Parents hold the PIN", body: "A PIN protects settings, chat history, outside links, extra time and deleting data. Topics like religion, body and politics stay hidden until you unlock them." },
  { icon: "shield-check", title: "A helper with limits", body: "Hoot removes personal details from messages. If a child mentions hurting themselves, Hoot replies kindly with a helpline, and you get an email without the child's words." },
  { icon: "prohibit", title: "Nothing to sell", body: "No ads, no third party analytics, no streaks and no leaderboards. Free for every family and funded by donations." },
  { icon: "list-checks", title: "See what they know", body: "The parent area groups what each child has learned as strong, practising or not started, so you know where a little help goes furthest." },
];

const STEPS = [
  ["Create a family account", "A parent or guardian aged 18 or over signs up and sets a PIN of four to six digits for the grown up area."],
  ["Add a profile for each child", "Choose a nickname and an age. Lessons, quizzes and puzzles match that age group."],
  ["Learn together", "Children work through lessons and earn answers with hints. You see what they know and read Hoot chats with your PIN."],
] as const;

const FAQ = [
  ["Is Honest Learn really free?", "Yes. There is nothing to buy and there are no ads. It is funded by donations, and the only donate button sits inside the PIN protected parent area, never on a child's screen."],
  ["Does Hoot give the answers?", "No. Hoot gives hints and asks questions. Each reply passes a second safety check, which also looks for replies that would give away the quiz answer."],
  ["Who can create an account?", "A parent or guardian aged 18 or over. Children use profiles inside the family account."],
  ["What happens to chats with Hoot?", "Chats are saved so a parent can read them with the PIN, and they are currently set to be deleted after 12 months. Personal details a child types are removed before the message is saved or sent on."],
  ["Have experts checked the lessons?", "Not yet. The lessons were drafted with AI help and each one needs two human reviewers before it is marked reviewed. Health and sensitive topics need a specialist first. The full list is public."],
  ["What about sensitive topics?", "Lessons on religion, body and politics are hidden until a parent unlocks them with the PIN. They describe more than one perspective."],
  ["Does it work without internet?", "Once the website is added to your home screen it opens offline and keeps lessons a child has already opened. Parent area data and Hoot chats are never saved on the device."],
  ["Is there an iPhone or Android app?", "The website works on phones, tablets and computers. App store versions are not released yet."],
  ["Can I delete my family's data?", "Yes. With the PIN you can export or delete everything from the parent area."],
] as const;

export default function Welcome() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const page = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = "Honest Learn: free learning for ages 3 to 18";
  }, []);

  // Highlight the navigation item for the section on screen.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    NAV.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (path: string) => (e: MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    router.push(path as never);
  };
  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const cta = (
    <a className="btn btn-primary button-lg" href="/signup" onClick={go("/signup")}>
      Create a free family account <Icon name="arrow-right" />
    </a>
  );
  const risk = (
    <ul className="risk body-6">
      <li><Icon name="check-circle" /> Free for every family</li>
      <li><Icon name="check-circle" /> No ads and no card needed</li>
      <li><Icon name="check-circle" /> Delete your data any time</li>
    </ul>
  );

  return (
    <div className="hl" ref={page}>
      <style>{LANDING_CSS}</style>
      <a className="skip button-sm" href="#main" onClick={jump("main")}>Skip to content</a>

      <header>
        <nav className="nav" aria-label="Main">
          <a className="brand title-3" href="/welcome" onClick={(e) => { e.preventDefault(); page.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <img src="/icons/icon-192.png" alt="" width={28} height={28} /> Honest Learn
          </a>
          <div className="nav-links">
            {NAV.map(([id, label]) => (
              <a key={id} className="nav-link button-sm" href={`#${id}`} onClick={jump(id)} aria-current={active === id ? "true" : undefined}>{label}</a>
            ))}
            <a className="btn btn-ghost button-sm" href="/login" onClick={go("/login")}>Sign in</a>
          </div>
          <button className="menu-toggle" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
            <span /><span /><span />
          </button>
        </nav>
        <div id="mobile-menu" className={`panel${open ? " open" : ""}`} aria-hidden={!open}>
          {NAV.map(([id, label], i) => (
            <a key={id} className="heading-5" href={`#${id}`} onClick={jump(id)} style={{ "--i": Math.min(i, 6) } as CSSProperties} tabIndex={open ? 0 : -1}>{label}</a>
          ))}
          <a className="heading-5" href="/login" onClick={go("/login")} style={{ "--i": NAV.length } as CSSProperties} tabIndex={open ? 0 : -1}>Sign in</a>
        </div>
      </header>

      <main id="main">
        <section className="wrap hero" aria-labelledby="hero-title">
          <span className="badge caption-1"><Icon name="seal-check" /> Pre launch preview. Lessons are drafts.</span>
          <h1 id="hero-title" className="heading-1">
            <span className="ln">Real learning for ages 3 to 18,</span> <span className="ln">without ads or shortcuts</span>
          </h1>
          <p className="sub title-2">
            Free lessons, quizzes and puzzles, with an owl helper called Hoot who gives hints and never the answer. A parent PIN keeps the grown up settings in your hands.
          </p>
          <div className="hero-cta">
            {cta}
            {risk}
          </div>
          <p className="proof body-6">175 lessons, 501 quiz questions and 68 puzzles across five age groups.</p>

          <figure style={{ margin: 0, width: "100%" }}>
            <div className="shot">
              <div className="shot-inner">
                <div className="shot-q">
                  <p className="caption-1 shot-lesson">Adding big numbers with tens and ones · Question 1 of 3</p>
                  <p className="heading-5">What is 31 + 12?</p>
                  <div className="opts body-2">
                    <div className="opt">42</div>
                    <div className="opt">43</div>
                    <div className="opt">19</div>
                  </div>
                </div>
                <div className="shot-hints">
                  <div className="hint open">
                    <span className="n caption-3">1</span>
                    <div><p className="caption-1">Hint 1: a nudge</p><p className="body-3">Split each number into tens and ones.</p></div>
                  </div>
                  <div className="hint open">
                    <span className="n caption-3">2</span>
                    <div><p className="caption-1">Hint 2: a bigger hint</p><p className="body-3">Tens: 30 + 10 = ? Ones: 1 + 2 = ?</p></div>
                  </div>
                  <div className="hint locked">
                    <span className="n caption-3">3</span>
                    <div><p className="caption-1">Hint 3: a worked example</p><p className="body-3">A different problem, solved step by step. Opens after hint 2.</p></div>
                  </div>
                  <p className="shot-note caption-1"><Icon name="lock-key" /> The answer appears only after all three hints, or after a correct try.</p>
                </div>
              </div>
            </div>
            <figcaption className="shot-cap caption-1">A quiz question from the app, shown with the hints a child can open.</figcaption>
          </figure>
        </section>

        <Reveal className="section problem" as="section" id="why">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow caption-3"><Icon name="eye-slash" /> Why it is different</span>
              <h2 className="heading-2">A learning app should not compete for your child's attention</h2>
              <p className="muted title-2">Honest Learn is built so that a child finishes a lesson, closes the app and gets on with their day.</p>
            </div>
            <div className="contrast">
              <div>
                <h3 className="title-1">What we leave out</h3>
                <ul className="body-3">
                  <li><Icon name="minus" /> Ads and upgrade prompts</li>
                  <li><Icon name="minus" /> Streaks and leaderboards</li>
                  <li><Icon name="minus" /> Selling data or third party analytics</li>
                  <li><Icon name="minus" /> Answers on request</li>
                </ul>
              </div>
              <div>
                <h3 className="title-1">What you get</h3>
                <ul className="body-3">
                  <li><Icon name="plus" /> Hints in a fixed order that the server keeps track of</li>
                  <li><Icon name="plus" /> A PIN for everything a child should not change</li>
                  <li><Icon name="plus" /> A parent view of what your child knows</li>
                  <li><Icon name="plus" /> Sensitive topics that stay locked until you choose</li>
                </ul>
              </div>
            </div>
          </div>
        </Reveal>

        <section className="wrap tagline" aria-label="Our promise">
          <TaglineReveal text="Every answer is earned. Every hint is honest. Every parent stays in charge." />
        </section>

        <Reveal className="wrap section" as="section">
          <div className="section-head center">
            <h2 className="heading-2">Made for how children learn</h2>
            <p className="muted title-2">Six things you can check in the app today.</p>
          </div>
          <div className="cards">
            {BENEFITS.map((b) => (
              <article key={b.title} className="card">
                <span className="icon-tile"><Icon name={b.icon} /></span>
                <h3 className="title-1">{b.title}</h3>
                <p className="muted body-3">{b.body}</p>
              </article>
            ))}
          </div>
        </Reveal>

        <Reveal className="wrap section" as="section" id="how">
          <div className="section-head center">
            <h2 className="heading-2">Start in three steps</h2>
            <p className="muted title-2">Most families are set up in a few minutes.</p>
          </div>
          <ol className="steps">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="step">
                <span className="num title-2">{i + 1}</span>
                <h3 className="title-1">{title}</h3>
                <p className="muted body-3">{body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal className="wrap section" as="section" id="proof">
          <div className="section-head center">
            <h2 className="heading-2">Check our work yourself</h2>
            <p className="muted title-2">We have no testimonials yet, because we have not launched. Here is what you can verify instead.</p>
          </div>
          <div className="checks">
            <article className="check">
              <span className="icon-tile"><Icon name="github-logo" /></span>
              <h3 className="title-1">The code is public</h3>
              <p className="muted body-3">Read how the hints, the PIN and Hoot's safety checks are built.</p>
              <a className="body-2" href={REPO} target="_blank" rel="noopener noreferrer">Open the repository <Icon name="arrow-right" /></a>
            </article>
            <article className="check">
              <span className="icon-tile"><Icon name="seal-check" /></span>
              <h3 className="title-1">Lessons are drafts, and we say so</h3>
              <p className="muted body-3">Each of the 175 lessons stays marked as draft until two human reviewers approve it. The list of what still needs an expert is public.</p>
              <a className="body-2" href={`${REPO}/blob/main/docs/NEEDS_APPROVAL.md`} target="_blank" rel="noopener noreferrer">See what needs review <Icon name="arrow-right" /></a>
            </article>
            <article className="check">
              <span className="icon-tile"><Icon name="shield-check" /></span>
              <h3 className="title-1">Security notes in plain words</h3>
              <p className="muted body-3">Problems we found in our own review and what we changed are written down.</p>
              <a className="body-2" href={`${REPO}/blob/main/docs/SECURITY.md`} target="_blank" rel="noopener noreferrer">Read the security notes <Icon name="arrow-right" /></a>
            </article>
            <article className="check">
              <span className="icon-tile"><Icon name="users-three" /></span>
              <h3 className="title-1">Written for families of every age</h3>
              <p className="muted body-3">Five age groups from 3 to 18, 11 subjects, 220 learning outcomes and 27 free outside resources.</p>
            </article>
          </div>
        </Reveal>

        <Reveal className="wrap section" as="section" id="faq">
          <div className="section-head center">
            <h2 className="heading-2">Questions parents ask</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary className="title-2">{q}<Icon name="plus" /></summary>
                <div className="body-3">{a}</div>
              </details>
            ))}
          </div>
        </Reveal>

        <Reveal className="section final" as="section">
          <div className="wrap">
            <h2 className="heading-2">Give your child hints, not shortcuts</h2>
            <p className="sub title-2">Set up a family account in a few minutes and try a lesson together.</p>
            <div className="hero-cta">
              {cta}
              {risk}
            </div>
          </div>
        </Reveal>
      </main>

      <footer className="foot">
        <div className="wrap">
          <p className="muted body-6">Honest Learn is a pre launch project. A parent or guardian aged 18 or over creates the account.</p>
          <nav aria-label="Footer" className="body-6">
            <a href="/privacy" onClick={go("/privacy")}>Privacy notice</a>
            <a href="/terms" onClick={go("/terms")}>Terms</a>
            <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="#main" onClick={(e) => { e.preventDefault(); page.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>Back to top</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
