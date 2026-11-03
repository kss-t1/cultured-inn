// "O autorze" (/about): who runs the site and how to reach them. Server-rendered, no JS.
import { t } from "../shared/i18n/index.ts";
import type { IconName } from "../shared/icons.ts";
import { Icon, SiteFooter, SiteHeader } from "../shared/ui.tsx";

const A = t.about;

export const AUTHOR = {
  email: "krzysztof.spisak.spisacki@gmail.com",
  whatsapp: "48739272287",
  whatsappDisplay: "+48 739 272 287",
  github: "kss-t1",
  repo: "kss-t1/cultured-inn",
};

function Contact({ icon, label, href, text }: { icon: IconName; label: string; href: string; text: string }) {
  return (
    <li className="fact">
      <Icon name={icon} />
      <div>
        <span className="fact__k">{label}</span>
        <a className="fact__v" href={href} rel={href.startsWith("http") ? "noopener" : undefined}>{text}</a>
      </div>
    </li>
  );
}

export function AboutPage() {
  return (
    <>
      <SiteHeader current="about" />
      <main className="wrap about">
        <h1 className="about__title">{A.title}</h1>
        <p className="about__lead">{A.hello}</p>

        <section className="about__section">
          <h2>{A.code}</h2>
          <p className="muted">{A.codeHint}</p>
          <ul className="ticket ticket__facts">
            <Contact icon="code" label={A.github} href={`https://github.com/${AUTHOR.repo}`} text={`github.com/${AUTHOR.repo}`} />
          </ul>
        </section>

        <section className="about__section">
          <h2>{A.contact}</h2>
          <ul className="ticket ticket__facts">
            <Contact icon="mail" label={A.email} href={`mailto:${AUTHOR.email}`} text={AUTHOR.email} />
            <Contact icon="chat" label={A.whatsapp} href={`https://wa.me/${AUTHOR.whatsapp}`} text={AUTHOR.whatsappDisplay} />
            <Contact icon="user" label={A.github} href={`https://github.com/${AUTHOR.github}`} text={AUTHOR.github} />
          </ul>
        </section>
      </main>
      <SiteFooter note={t.brand.sources} />
    </>
  );
}
