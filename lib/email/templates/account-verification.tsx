import { Button, Heading, Link, Text } from "react-email";

import { Shell, heading, paragraph } from "./shared";

export const ACCOUNT_VERIFICATION_SUBJECT =
  "Verify your email for Aetherfield";

const button = {
  backgroundColor: "#000000",
  color: "#ffffff",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: "13px",
  letterSpacing: "0.04em",
  lineHeight: "46px",
  height: "46px",
  padding: "0 20px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "24px",
} as const;

const fallback = {
  fontFamily:
    'Archivo, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6c6c6c",
  margin: "16px 0 0",
  wordBreak: "break-all",
} as const;

const fallbackLink = {
  color: "#000000",
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

export function AccountVerification({
  name,
  verificationUrl,
}: {
  name: string;
  verificationUrl: string;
}) {
  return (
    <Shell
      preview="Verify your Aetherfield email address. This link expires in one hour."
      footerText="You are receiving this because this address was used to create an Aetherfield account. If that was not you, no action is needed."
    >
      <Heading as="h1" style={heading}>
        Verify your email address
      </Heading>
      <Text style={paragraph}>
        {name}, verify this address to finish setting up your Aetherfield
        account. This link expires in one hour.
      </Text>
      <Button href={verificationUrl} style={button}>
        Verify email address
      </Button>
      <Text style={fallback}>
        If the button does not work, use this verification link: {" "}
        <Link href={verificationUrl} style={fallbackLink}>
          {verificationUrl}
        </Link>
      </Text>
      <Text style={paragraph}>
        If you did not request this account, no action is needed.
      </Text>
    </Shell>
  );
}

AccountVerification.PreviewProps = {
  name: "Ada Whitfield",
  verificationUrl:
    "https://example.com/api/auth/verify-email?token=preview-token&callbackURL=https%3A%2F%2Fexample.com%2Fverify-email%3Fverified%3D1",
};
