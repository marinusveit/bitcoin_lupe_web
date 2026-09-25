import { getCollection } from 'astro:content';

export interface NavItem {
  href: string;
  label: string;
}

/** Feste Einträge neben den Kapiteln; die Kapitel kommen aus der Collection. */
export const extraNav: NavItem[] = [
  { href: '/simulator/', label: 'Simulator' },
];

/** Alle veröffentlichten Kapitel (ohne Entwürfe), nach `order` sortiert. */
export async function chapters() {
  return (await getCollection('kapitel', (k) => !k.data.draft)).sort((a, b) => a.data.order - b.data.order);
}
