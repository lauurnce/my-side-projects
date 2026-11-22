import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AltitudeMeter } from "@/components/ui/AltitudeMeter";
import { Barcode } from "@/components/ui/Barcode";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { DeckThumb } from "@/components/ui/DeckThumb";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { Grain } from "@/components/ui/Grain";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { OpsCard } from "@/components/ui/OpsCard";
import { RouteCard } from "@/components/ui/RouteCard";
import { SprayTag } from "@/components/ui/SprayTag";
import { StatusChip } from "@/components/ui/StatusChip";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UnlockCard } from "@/components/ui/UnlockCard";
import { panelsContent } from "@/content/landing";
import { submissionUpload } from "@/lib/config";
import { brandDna, layers, sameInBoth, sizeRows, swatches, themePreviews, tokenRows } from "./data";
import { IndexPillDemo, UploadDropDemo, ViewSwitchDemo } from "./demos";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "PENTA style guide",
  description: "Palette, themes, type and every component of the PENTA design system.",
};

const unlockSample = panelsContent.decks.unlock;

const uploadCapMegabytes = submissionUpload.maxBytes / (1024 * 1024);
const uploadHint = `DOCX or PDF only · max ${uploadCapMegabytes} MB`;

const quizIcon = (
  <svg width="64" height="64" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M8 8 L9.5 9.5 L12 7 M8 13 L9.5 14.5 L12 12 M14 8.5 H16.5 M14 13.5 H16.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

function SectionHead({ title, label }: { title: string; label: string }) {
  return (
    <div className={styles.sectionHead}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <BracketLabel>{label}</BracketLabel>
    </div>
  );
}

function Cell({
  code,
  name,
  boxed = false,
  wide = false,
  testId,
  children,
}: {
  code: string;
  name: string;
  boxed?: boolean;
  wide?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const classNames = [boxed ? styles.cellBoxed : styles.cell, wide ? styles.cellWide : ""].join(" ").trim();

  return (
    <div className={classNames} data-testid={testId}>
      <BracketLabel>
        {code} · {name}
      </BracketLabel>
      {children}
    </div>
  );
}

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.topBar} data-testid="top-bar">
        <SprayTag className={styles.brandTag}>Penta</SprayTag>
        <div className={styles.topLabels}>
          <BracketLabel>Design reference · v3</BracketLabel>
          <BracketLabel>INTE 301 · SIA project</BracketLabel>
          <BracketLabel>27.11.2026</BracketLabel>
        </div>
        <ThemeToggle />
      </div>

      <div className={styles.hero}>
        <div className={styles.titleBox}>
          <SprayTag className={styles.titleTag}>Penta</SprayTag>
          <div className={styles.titleLabels}>
            <BracketLabel>Series: AY 2026–27</BracketLabel>
            <BracketLabel>LMS · Decks · Ops</BracketLabel>
          </div>
          <h1 className={styles.title}>
            Penta<sup className={styles.trademark}>™</sup>
          </h1>
        </div>
        <div className={styles.intro}>
          <p className={styles.introText}>
            Learning is a climb. PENTA stacks three layers of one school platform, and every scroll adds a layer on
            top of the last. No nav bar with three buttons: the layers are the navigation.
          </p>
          <div className={styles.layerList}>
            {layers.map((layer) => (
              <div key={layer.index} className={styles.layerRow}>
                <span className={styles.layerIndex}>[ {layer.index} ]</span>
                <span className={styles.layerName}>{layer.name}</span>
                <span className={styles.layerUse}>{layer.use}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function BrandDna() {
  return (
    <section className={styles.section}>
      <SectionHead title="Brand DNA" label="What we take from each reference" />
      <div className={styles.grid3}>
        {brandDna.map((card) => (
          <div key={card.label} className={`${card.filled ? styles.dnaCardFilled : styles.dnaCard} clip-card`}>
            <span className={styles.dnaLabel}>[ {card.label} ]</span>
            <ul className={styles.dnaList}>
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Palette() {
  return (
    <section id="palette" className={styles.section}>
      <SectionHead title="Palette" label="PUP maroon + gold on paper · one sharp accent" />
      <div className={styles.palette}>
        {swatches.map((swatch) => (
          <div key={swatch.name} className={styles.swatch}>
            <div
              className={swatch.outlined ? styles.swatchChipOutlined : styles.swatchChip}
              style={{ background: swatch.hex }}
            />
            <strong className={styles.swatchName}>{swatch.name}</strong>
            <span className={styles.swatchHex}>{swatch.hex}</span>
            <span className={styles.swatchUse}>{swatch.use}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Themes() {
  return (
    <section id="themes" className={styles.section}>
      <SectionHead title="Themes" label="Light is the default · dark is the maroon version" />
      <div className={styles.themes}>
        <div className={styles.previews}>
          {themePreviews.map((preview) => (
            <div
              key={preview.theme}
              data-theme={preview.theme}
              data-testid={`preview-${preview.theme}`}
              className={styles.preview}
            >
              <div className={styles.previewTop}>
                <span>[ {preview.label} ]</span>
                <span>{preview.ground}</span>
              </div>
              <span className={styles.previewTitle}>
                Learn at
                <br />
                Penta
              </span>
              <div className={styles.previewChips}>
                <span className={styles.previewButton}>Button</span>
                <span className={styles.previewCard}>Card</span>
                <span className={styles.previewChip}>Chip</span>
                <span className={styles.previewLive}>Live</span>
              </div>
            </div>
          ))}
          <p className={styles.caption}>
            One switch sets data-theme=&quot;dark&quot; on the page root. Every color comes from the tokens on the
            right. Cards, ink and gold stay the same in both themes. The switch in the top bar lets you check both.
          </p>
        </div>
        <div className={styles.tokens}>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Theme tokens">
            <table className={styles.tokenTable} data-testid="token-table">
              <thead>
                <tr>
                  <th scope="col">Token</th>
                  <th scope="col">Light</th>
                  <th scope="col">Dark</th>
                  <th scope="col">Used for</th>
                </tr>
              </thead>
              <tbody>
                {tokenRows.map((token) => (
                  <tr key={token.name}>
                    <th scope="row">{token.name}</th>
                    <td>
                      <span className={styles.tokenValue}>
                        <span className={styles.tokenChip} style={{ background: token.light }} />
                        {token.light}
                      </span>
                    </td>
                    <td>
                      <span className={styles.tokenValue}>
                        <span className={styles.tokenChip} style={{ background: token.dark }} />
                        {token.dark}
                      </span>
                    </td>
                    <td className={styles.tokenUse}>{token.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className={styles.sameInBoth}>{sameInBoth}</span>
        </div>
      </div>
    </section>
  );
}

function Type() {
  return (
    <section id="type" className={styles.section}>
      <SectionHead title="Type" label="Three faces + one tag face" />
      <div className={styles.type}>
        <div className={styles.typeDisplay}>
          <BracketLabel>Display · Big Shoulders 800–900 · uppercase</BracketLabel>
          <p className={styles.specimen}>
            Climb.
            <br />
            View. Submit.
          </p>
          <div className={styles.sizeRows}>
            {sizeRows.map((size) => (
              <div key={size.name} className={styles.sizeRow} data-size={size.name}>
                <span className={styles.sizeName}>{size.name}</span>
                <span className={styles.sizeSpec}>{size.spec}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.typeFaces}>
          <div className={styles.typeFace}>
            <BracketLabel>Labels · JetBrains Mono 500 · 11–12 px · +8% tracking</BracketLabel>
            <p className={styles.labelSpecimen}>
              [ Route 01 ] [ Due Fri 23:59 ]
              <br />[ Slide 07 / 24 ] [ 1,840 m ]
            </p>
          </div>
          <div className={styles.typeFace}>
            <BracketLabel>Reading · Inter 400/500 · 16 / 1.55</BracketLabel>
            <p className={styles.readingSpecimen}>
              Lessons, instructions and feedback are long reads, so they get a calm sans at a comfortable size.
              Display type is for titles only.
            </p>
          </div>
          <div className={styles.typeFace}>
            <BracketLabel>Tag · Sedgwick Ave Display · decoration only</BracketLabel>
            <div className={styles.tagBox}>
              <SprayTag className={styles.tagSpecimen}>Penta</SprayTag>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Components() {
  return (
    <section id="components" className={styles.section}>
      <SectionHead title="Components" label="Names match the build: use them in code" />
      <div className={styles.grid3}>
        <Cell code="C-01" name="OctagonCTA" boxed>
          <div className={styles.octagons}>
            <OctagonCTA href="#components" eyebrow="Enter routes" title="6 classes" size={124} />
            <OctagonCTA href="#components" eyebrow="Slide 07 now" title="Join live" size={96} />
            <OctagonCTA href="#components" eyebrow="3 due this week" title="Open ops" size={72} />
          </div>
          <span className={styles.note}>
            124 px on layers, 96 px in panels, 72 px in cards. Hover: fill with the text color, arrow flips. One per
            layer.
          </span>
        </Cell>
        <Cell code="C-02" name="IndexPill · idle / active" boxed>
          <IndexPillDemo />
        </Cell>
        <Cell code="C-03" name="StatusChip" boxed>
          <div className={styles.chips}>
            <StatusChip status="due">Due Fri 23:59</StatusChip>
            <StatusChip status="late">Late · 2 days</StatusChip>
            <StatusChip status="submitted">Submitted</StatusChip>
            <StatusChip status="graded">Graded 9/10</StatusChip>
            <StatusChip status="live">Live now</StatusChip>
          </div>
          <span className={styles.note}>Each status is a word plus a shape, so it still reads in grayscale.</span>
        </Cell>

        <Cell code="C-04" name="RouteCard" testId="demo-route-card">
          <RouteCard
            href="#components"
            code="COMP 018"
            section="BSIT 3-3"
            title="Database Administration"
            lessonsDone={7}
            lessonsTotal={12}
            meters={1740}
          />
        </Cell>
        <Cell code="C-05" name="OpsCard">
          <OpsCard
            href="#components"
            icon={quizIcon}
            kind="Quiz · INTE 301"
            title="Message brokers"
            detail="20 items · auto-graded · 2 attempts"
            status={
              <StatusChip status="due" dot={false}>
                Due Fri 23:59
              </StatusChip>
            }
          />
        </Cell>
        <Cell code="C-06" name="DeckThumb">
          <DeckThumb
            href="#components"
            eyebrow="INTE 301 · Lesson 06"
            title="Message-based integration"
            slideCount={24}
            format="PPTX"
            viewedCount={7}
            live
          />
          <DeckThumb
            href="#components"
            eyebrow="COMP 018 · Lesson 07"
            title="Triggers + errors"
            slideCount={18}
            format="PDF"
            viewedCount={0}
          />
        </Cell>

        <Cell code="C-07" name="UploadDrop · idle / uploading / error" wide>
          <UploadDropDemo hint={uploadHint} />
        </Cell>

        <Cell code="C-08" name="AltitudeMeter">
          <AltitudeMeter
            meters={1840}
            note="Lessons, decks and activities each add meters. Summit = 3,000 m per term."
          />
        </Cell>
        <Cell code="C-09" name="Field · plain / error">
          <div className={styles.frame}>
            <Field label="School email" name="email" type="email" placeholder="you@iskolarngbayan.pup.edu.ph" />
            <Field
              label="School email"
              name="email-with-error"
              type="email"
              defaultValue="you@gmail.com"
              error="Use your PUP school email"
            />
          </div>
        </Cell>
        <Cell code="C-10" name="FilterPill" testId="demo-filter-pill">
          <div className={styles.frameRow}>
            <FilterPill>Filters</FilterPill>
          </div>
        </Cell>
        <Cell code="C-11" name="ViewSwitch" testId="demo-view-switch">
          <div className={styles.frameRow}>
            <ViewSwitchDemo />
          </div>
        </Cell>
        <Cell code="C-12" name="ThemeToggle" testId="demo-theme-toggle">
          <div className={styles.frameRow}>
            <ThemeToggle />
          </div>
        </Cell>
        <Cell code="C-13" name="BracketLabel">
          <div className={styles.frameRow}>
            <BracketLabel>Layer 01</BracketLabel>
            <BracketLabel>INTE 301 · SIA project</BracketLabel>
          </div>
        </Cell>
        <Cell code="C-14" name="SprayTag">
          <div className={styles.frameTag}>
            <SprayTag className={styles.tagSpecimen}>Penta</SprayTag>
          </div>
        </Cell>
        <Cell code="C-15" name="Grain">
          <div className={styles.frameGrain}>
            <Grain />
            <span className={styles.grainNote}>55% · multiply in light · overlay in dark</span>
          </div>
        </Cell>
        <Cell code="C-16" name="Barcode">
          <div className={styles.frameRow}>
            <Barcode
              caption={
                <>
                  ©2026 PENTA
                  <br />
                  INTE 301 project
                </>
              }
            />
          </div>
        </Cell>
        <Cell code="C-17" name="UnlockCard · in progress / unlocked" testId="demo-unlock-card">
          <UnlockCard
            href="#components"
            title={unlockSample.title}
            viewed={unlockSample.viewed}
            total={unlockSample.total}
          />
          <UnlockCard title={unlockSample.title} viewed={unlockSample.total} total={unlockSample.total} />
          <span className={styles.note}>
            The count line carries the meaning. The track is decoration. With a link, the whole card opens the deck.
          </span>
        </Cell>
      </div>
    </section>
  );
}

function Imagery() {
  return (
    <section id="imagery" className={styles.section}>
      <SectionHead title="Imagery + texture" label="Duotone PUP Main Building · grain · spray · barcode" />
      <div className={styles.imageBox}>
        <img
          className={`${styles.building} only-light`}
          src="/design/main-building-light.webp"
          alt=""
          loading="lazy"
          width={2000}
          height={1100}
        />
        <img
          className={`${styles.building} only-dark`}
          src="/design/main-building-dark.webp"
          alt=""
          loading="lazy"
          width={2000}
          height={1100}
        />
        <SprayTag className={styles.imageTag}>Penta</SprayTag>
        <Grain />
        <div className={styles.scrim} aria-hidden="true" />
        <div className={styles.imageFoot}>
          <div className={styles.imageLines}>
            <span>For those who climb.</span>
            <span>Not for the cram.</span>
          </div>
          <Barcode
            caption={
              <>
                ©2026 PENTA
                <br />
                INTE 301 project
              </>
            }
          />
        </div>
      </div>
      <p className={styles.imageCaption}>
        The PUP Main Building here is a generated render, modelled on aerial photos of its wings. It ships in two
        versions: a paper one for light and a maroon one for dark. Grain goes on top at 55% (multiply in light,
        overlay in dark).
      </p>
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className={styles.page}>
      <Grain />
      <Header />
      <BrandDna />
      <Palette />
      <Themes />
      <Type />
      <Components />
      <Imagery />
    </main>
  );
}
