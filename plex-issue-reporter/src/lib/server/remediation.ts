export type RemediationAction = 'blocklist-and-regrab' | 'search';

export function decideAction(item: { hasFile: boolean }): RemediationAction {
  return item.hasFile ? 'blocklist-and-regrab' : 'search';
}

export function actionLabel(action: RemediationAction): string {
  return action === 'blocklist-and-regrab'
    ? 'Blocklisted the old file and is grabbing a new copy'
    : 'Searching for a copy';
}
