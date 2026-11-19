import { SyncBeatsMark } from "@/components/brand/SyncBeatsLogo";

export function BrandMark({ size = 32 }: { size?: number }) {
  return <SyncBeatsMark width={size} height={size} />;
}
