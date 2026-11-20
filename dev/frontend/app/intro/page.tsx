import type { Metadata } from "next";
import { IntroSlides } from "../../components/pwa/IntroSlides";
import { PwaRootRedirect } from "../../components/pwa/PwaRootRedirect";

export const metadata: Metadata = {
  title: "Welcome",
  description: "A quick introduction to listening together with SyncBeats.",
  robots: { index: false, follow: false },
};

export default function IntroPage() {
  return <>
    <PwaRootRedirect />
    <IntroSlides />
  </>;
}
