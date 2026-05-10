import { Navigation } from "./Navigation";

export const Layout = ({ children }) => {
  return (
    <div style={{ minHeight: "100vh", padding: "1rem" }}>
      <Navigation />
      <main>{children}</main>
    </div>
  );
};
