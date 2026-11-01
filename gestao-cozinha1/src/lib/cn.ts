/** Junta nomes de classe, ignorando valores vazios/falsos. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
