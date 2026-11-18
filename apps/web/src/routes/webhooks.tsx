import { Navigate } from "react-router-dom";

/** Webhooks are managed on the Integrations page. */
export default function WebhooksRedirect() {
  return <Navigate to="/integrations" replace />;
}
