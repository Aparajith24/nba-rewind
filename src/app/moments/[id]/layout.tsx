import { AppShell } from "@/ui/AppShell";

/** A moment page uses the sidebar shell; the homepage and the moments list use the top navigation. */
export default function MomentLayout({ children }: LayoutProps<"/moments/[id]">) {
  return <AppShell>{children}</AppShell>;
}
