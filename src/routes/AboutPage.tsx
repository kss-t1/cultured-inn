// "O autorze" (/about): who runs the site and how to reach them. Server-rendered, no JS.
import type { ReactNode } from "react";
import { CATEGORIES, CATEGORY_INFO } from "../shared/categories.ts";
import { t } from "../shared/i18n/index.ts";
import type { IconName } from "../shared/icons.ts";
import { Icon, SiteFooter, SiteHeader } from "../shared/ui.tsx";

const A = t.about;

const AUTHOR = {
  email: "krzysztof.spisak.spisacki@gmail.com",
  github: "kss-t1",
  repo: "kss-t1/cultured-inn",
};
const MAILTO = `mailto:${AUTHOR.email}`;
const GITHUB = `https://github.com/${AUTHOR.github}`;
const REPO = `https://github.com/${AUTHOR.repo}`;

function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <li className="fact">
      <Icon name={icon} />
      <div><span className="fact__k">{label}</span><span className="fact__v">{children}</span></div>
    </li>
  );
}

export function AboutPage() {
  const [user, domain] = AUTHOR.email.split("@");
  return (
    <>
      <SiteHeader />
      <main className="wrap about">
        <section className="about__hero cat-impro">
          <span className="about__avatar">
            <img src="/author.jpg" alt={A.photoAlt} width={160} height={160} />
            <span className="about__avatar-seal" aria-hidden="true"><Icon name="impro" /></span>
          </span>
          <div className="about__intro">
            <p className="eyebrow">{A.title}</p>
            <h1 className="about__title">{A.greeting}</h1>
            <p className="about__lead">{A.lead}</p>
            <p className="about__badges">
              {CATEGORIES.map((c) => (
                <span key={c} className={`badge badge--cat badge--lg cat-${CATEGORY_INFO[c].slug}`}>
                  <Icon name={CATEGORY_INFO[c].icon} />{t.categories[c]}
                </span>
              ))}
              <span className="badge badge--lg"><Icon name="pin" />{A.city}</span>
            </p>
          </div>
        </section>

        <div className="about__grid">
          <aside className="ticket about__contact" aria-labelledby="about-contact">
            <div className="about__contact-head">
              <h2 id="about-contact">{A.contact}</h2>
              <p className="muted">{A.contactHint}</p>
            </div>
            <ul className="ticket__facts">
              <Fact icon="mail" label={A.email}>{user}@<wbr />{domain}</Fact>
              <Fact icon="user" label={A.github}>{AUTHOR.github}</Fact>
            </ul>
            <div className="ticket__actions">
              <a className="btn btn--primary btn--lg btn--block" href={MAILTO}><Icon name="mail" />{A.emailCta}</a>
              <a className="btn btn--secondary" href={GITHUB} rel="noopener"><Icon name="user" />{A.github}</a>
            </div>
          </aside>

          <section className="about__project">
            <h2>{A.code}</h2>
            <p className="muted">{A.codeHint}</p>
            <a className="repo" href={REPO} rel="noopener">
              <span className="repo__ico"><Icon name="code" /></span>
              <span className="repo__text">
                <span className="repo__name">{AUTHOR.repo}</span>
                <span className="repo__sub">{A.repoCta}</span>
              </span>
              <Icon name="ext" size="sm" />
            </a>
          </section>
        </div>
      </main>
      <SiteFooter note={t.brand.sources} />
    </>
  );
}
