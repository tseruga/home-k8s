import { actionLabel, type RemediationAction } from './remediation';

export type ReportSummary = {
  username: string;
  mediaLabel: string;
  note?: string;
  action: RemediationAction;
};

export function buildEmbed(r: ReportSummary): object {
  const fields = [
    { name: 'Reported by', value: r.username, inline: true },
    { name: 'Action', value: actionLabel(r.action), inline: true }
  ];
  if (r.note && r.note.trim()) fields.push({ name: 'Note', value: r.note.trim(), inline: false });
  return {
    embeds: [
      {
        title: `Issue reported: ${r.mediaLabel}`,
        color: r.action === 'blocklist-and-regrab' ? 0xff5c8a : 0xb6ff9e,
        fields
      }
    ]
  };
}

export async function notifyDiscord(
  webhookUrl: string,
  r: ReportSummary,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  try {
    await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildEmbed(r))
    });
  } catch (err) {
    console.error('[discord] notification failed', err);
  }
}
