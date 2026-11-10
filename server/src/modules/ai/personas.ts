import { z } from 'zod';

export const personaSchema = z.enum(['assistant', 'eli5', 'coach']);
export type Persona = z.infer<typeof personaSchema>;
