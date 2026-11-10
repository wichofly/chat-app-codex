export const personas = [
  { value: 'assistant', label: 'Thread' },
  { value: 'eli5', label: 'ELI5' },
  { value: 'coach', label: 'Coach' },
] as const;

export type Persona = (typeof personas)[number]['value'];

export function isPersona(value: unknown): value is Persona {
  return personas.some((persona) => persona.value === value);
}
