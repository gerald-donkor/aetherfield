import { Button, Heading, Link, Text } from "react-email";

import { Shell, heading, paragraph } from "./shared";

export const PASSWORD_RESET_SUBJECT = "Reset your Aetherfield password";

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

export function PasswordReset({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}) {
  return (
    <Shell
      preview="Reset your Aetherfield password. This link expires in one hour."
      footerText="You are receiving this because a password reset was requested for this Aetherfield account. If that was not you, no action is needed."
    >
      <Heading as="h1" style={heading}>
        Reset your password
      </Heading>
      <Text style={paragraph}>
        {name}, use this link to choose a new Aetherfield password. It expires
        in one hour.
      </Text>
      <Button href={resetUrl} style={button}>
        Reset password
      </Button>
      <Text style={fallback}>
        If the button does not work, use this password reset link: {" "}
        <Link href={resetUrl} style={fallbackLink}>
          {resetUrl}
        </Link>
      </Text>
      <Text style={paragraph}>
        If you did not request a password change, no action is needed and your
        password remains unchanged.
      </Text>
    </Shell>
  );
}

PasswordReset.PreviewProps = {
  name: "Ada Whitfield",
  resetUrl:
    "https://example.com/reset-password?token=preview-token",
};
