export const reportSeverityColors = Object.freeze({
  high: '#dc2626',
  medium: '#d97706',
  low: '#eab308',
  unknown: '#64748b',
});

export function normalizeReportSeverity(value) {
  const severity = String(value || '').trim().toLowerCase();
  if (severity === 'moderate' || severity === 'mid') return 'medium';
  if (severity === 'mixed') return 'high';
  return ['high', 'medium', 'low'].includes(severity) ? severity : 'unknown';
}

export function reportSeverityColor(value) {
  return reportSeverityColors[normalizeReportSeverity(value)];
}

export function reportSeverityExpression(property = 'severity') {
  return [
    'match', ['downcase', ['to-string', ['get', property]]],
    ['high', 'mixed'], reportSeverityColors.high,
    ['medium', 'moderate', 'mid'], reportSeverityColors.medium,
    'low', reportSeverityColors.low,
    reportSeverityColors.unknown,
  ];
}
