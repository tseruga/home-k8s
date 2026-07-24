import { text } from '@sveltejs/kit';

export function GET() {
  return text('healthy\n');
}
