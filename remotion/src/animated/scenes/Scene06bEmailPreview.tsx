import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;
  durationInFrames: number;
  audioSrc: string;
  productName: string;
  logoSrc: string;
};

const StepCard: React.FC<{ heading: string; body: string }> = ({ heading, body }) => (
  <div style={{
    backgroundColor: "#f5f5f0",
    borderRadius: 10,
    padding: "14px 18px",
    marginBottom: 8,
  }}>
    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{heading}</div>
    <div style={{ fontSize: 14, color: "#555" }}>{body}</div>
  </div>
);

export const Scene06bEmailPreview: React.FC<Props> = ({
  text, productName, logoSrc, durationInFrames, audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const fadeStart = durationInFrames - 12;

  return (
    <AbsoluteFill style={{
      backgroundColor: theme.bg,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.fontBody,
    }}>
      <FadeOut startFrame={fadeStart}>
        {/* Email card */}
        <div style={{
          width: 620,
          padding: "40px 24px",
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          boxShadow: "0 25px 60px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}>

          {/* Logo */}
          <SpringIn from={10} slide={15}>
            <div style={{ marginBottom: 20 }}>
              <Img
                src={logoSrc}
                style={{ height: 28, borderRadius: 4 }}
              />
            </div>
          </SpringIn>

          {/* Heading */}
          <SpringIn from={18} slide={15}>
            <div style={{
              fontSize: 28,
              fontWeight: 700,
              color: theme.foreground,
              marginBottom: 16,
            }}>
              Welcome to {productName}! 🎉
            </div>
          </SpringIn>

          {/* Body paragraph 1 */}
          <SpringIn from={26} slide={15}>
            <p style={{
              fontSize: 16,
              color: "#333",
              margin: "0 0 12px 0",
              lineHeight: 1.6,
            }}>
              Hey, I'm Paulo — I built {productName}. Thanks for signing up!
            </p>
          </SpringIn>

          {/* Body paragraph 2 */}
          <SpringIn from={26} slide={15}>
            <p style={{
              fontSize: 16,
              color: "#333",
              margin: "0 0 16px 0",
              lineHeight: 1.6,
            }}>
              Quick context on what you just got: {productName} handles your transactional
              emails, campaigns, and automations in one place. Your free plan comes
              with <strong>3,000</strong> emails/month. No credit card needed.
            </p>
          </SpringIn>

          {/* Intro to steps */}
          <SpringIn from={34} slide={15}>
            <p style={{
              fontSize: 16,
              color: theme.foreground,
              margin: "0 0 12px 0",
              lineHeight: 1.6,
            }}>
              To start sending, you just need three things:
            </p>
          </SpringIn>

          {/* Step 1 */}
          <SpringIn from={38} slide={15}>
            <StepCard
              heading="Add your sending domain"
              body="You'll set up DKIM, SPF, and DMARC. Takes about 5 minutes."
            />
          </SpringIn>

          {/* Step 2 */}
          <SpringIn from={44} slide={15}>
            <StepCard
              heading="Create an API key"
              body="Go to Settings → API Keys. You'll need this for the SDK or SMTP."
            />
          </SpringIn>

          {/* Step 3 */}
          <SpringIn from={50} slide={15}>
            <StepCard
              heading="Send your first email"
              body="Use the REST API, SMTP, or pick one of our 10 SDKs."
            />
          </SpringIn>

          {/* CTA button */}
          <SpringIn from={50} slide={15}>
            <div style={{ margin: "16px 0" }}>
              <button style={{
                backgroundColor: "#1a1a19",
                color: "#ffffff",
                border: "none",
                borderRadius: 50,
                padding: "13px 28px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: theme.fontBody,
              }}>
                Set up my domain →
              </button>
            </div>
          </SpringIn>

          {/* Signature */}
          <SpringIn from={58} slide={15}>
            <div style={{
              fontSize: 16,
              color: "#333",
              marginTop: 8,
              lineHeight: 1.7,
            }}>
              <div>Talk soon,</div>
              <div style={{ fontWeight: 700 }}>Paulo Castellano</div>
              <div style={{ fontSize: 14, color: "#888" }}>Founder, {productName}</div>
            </div>
          </SpringIn>

        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
