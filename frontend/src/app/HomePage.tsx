import { useRef } from "react";

import { Hero } from "@/components/marketing/Hero";
import { Nav } from "@/components/marketing/Nav";
import {
  Features,
  FinalCta,
  Footer,
  HowItWorks,
  Trust,
} from "@/components/marketing/StorySections";
import { Studio } from "@/features/agent/components/Studio";
import { useLaunchSession } from "@/features/agent/useLaunchSession";
import { ContactForm } from "@/features/contact/components/ContactForm";
import { Showcase } from "@/features/stores/components/Showcase";

export function HomePage() {
  const session = useLaunchSession();
  const studioRef = useRef<HTMLElement>(null);
  const start = () => {
    studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    studioRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
  };

  return (
    <>
      <Nav onStart={start} />
      <Hero onStart={start} />
      <Studio session={session} ref={studioRef} />
      <HowItWorks />
      <Features />
      <Showcase />
      <Trust />
      <FinalCta onStart={start} />
      <ContactForm />
      <Footer />
    </>
  );
}
