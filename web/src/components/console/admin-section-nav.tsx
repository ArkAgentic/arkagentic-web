"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export function AdminSectionNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const links = [
    { href: "/console/admin", label: t("admin.nav.overview") },
    { href: "/console/admin/usage", label: t("admin.nav.usage") },
    { href: "/console/admin/channels", label: t("admin.nav.channels") },
    { href: "/console/admin/routes", label: t("admin.nav.routes") },
  ];

  return (
    <nav className="rounded-xl border border-amber-100/70 bg-white/80 p-2">
      <div className="flex flex-wrap gap-2">
        {links.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                active
                  ? "bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] text-white"
                  : "border border-amber-100 bg-white text-stone-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
