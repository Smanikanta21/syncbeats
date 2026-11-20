import { ImageResponse } from "next/og";
import { SyncBeatsMark } from "@/components/brand/SyncBeatsLogo";
export const alt =
  "SyncBeats — Different devices. One shared beat. Listen together on phones, tablets, and laptops.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#171C1A",
          color: "#f4f0ea",
          fontFamily: "sans-serif",
          padding: "65px 75px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            right: -130,
            top: -150,
            borderRadius: "50%",
            background: "transparent",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <SyncBeatsMark width={52} height={52} />
              <span style={{ fontSize: 30, fontWeight: 700 }}>SyncBeats.</span>
            </div>
            <span
              style={{
                fontSize: 17,
                color: "#B7BAB5",
                border: "1px solid #ffffff33",
                borderRadius: 30,
                padding: "10px 18px",
              }}
            >
              Mac app coming soon
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 76, letterSpacing: -4, lineHeight: 1.1 }}>
              Different devices.
            </span>
            <span
              style={{
                fontSize: 76,
                letterSpacing: -4,
                lineHeight: 1.2,
                color: "#F4F5EF",
              }}
            >
              One shared beat.
            </span>
            <span style={{ fontSize: 25, color: "#c1beb9", marginTop: 24 }}>
              Play music together on phones, tablets, and laptops.
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 19,
            }}
          >
            <span style={{ color: "#B7BAB5" }}>
              One room. One queue. Your people.
            </span>
            <span>syncbeats.in</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
