// Stub placeholder, replaced in Task 14
import type { LintIssue } from '../../lib/lint/types';

export function LintIssueRow({ issue }: { issue: LintIssue }) {
  return <div style={{ padding: 4 }}>{issue.title}</div>;
}
