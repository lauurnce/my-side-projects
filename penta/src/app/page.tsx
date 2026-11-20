import { DecksPanel } from "@/components/landing/DecksPanel";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { OpsPanel } from "@/components/landing/OpsPanel";
import { Panels } from "@/components/landing/Panels";
import { RoutesPanel } from "@/components/landing/RoutesPanel";
import { ScrollStage } from "@/components/landing/ScrollStage";
import { StackScene } from "@/components/landing/StackScene";
import { TopBar } from "@/components/landing/TopBar";

export default function Home() {
  return (
    <ScrollStage>
      <a href="#routes" className="skip-link">
        Skip to the layers
      </a>
      <TopBar />
      <main id="main">
        <Hero />
        <StackScene />
        <Panels>
          <RoutesPanel />
          <DecksPanel />
          <OpsPanel />
        </Panels>
      </main>
      <Footer />
    </ScrollStage>
  );
}
