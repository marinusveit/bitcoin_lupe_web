export interface NavItem {
  href: string;
  label: string;
}

/** Feste Einträge neben den Kapiteln; die Kapitel kommen aus der Collection. */
export const extraNav: NavItem[] = [
  { href: '/simulator/', label: 'Simulator' },
];
