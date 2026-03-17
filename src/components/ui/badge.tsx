type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'grade';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  grade?: string;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface2 text-muted border-border',
  success: 'bg-green-500/10 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
  info: 'bg-accent/10 text-accent border-accent/30',
  grade: '',
};

function getGradeStyle(grade?: string): string {
  switch (grade?.toUpperCase()) {
    case 'A': return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'B': return 'bg-lime-500/15 text-lime-400 border-lime-500/30';
    case 'C': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    case 'D': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'F': return 'bg-red-500/15 text-red-400 border-red-500/30';
    default: return 'bg-surface2 text-muted border-border';
  }
}

function getStatusVariant(text: string): BadgeVariant {
  const s = text.toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'crawling' || s === 'analyzing') return 'info';
  if (s === 'failed') return 'error';
  if (s === 'pending') return 'warning';
  return 'default';
}

export function Badge({ children, variant = 'default', grade, className = '' }: BadgeProps) {
  const style = variant === 'grade'
    ? getGradeStyle(grade)
    : variantStyles[variant];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={getStatusVariant(status)}>{status}</Badge>;
}

export function GradeBadge({ grade }: { grade: string }) {
  return <Badge variant="grade" grade={grade}>{grade}</Badge>;
}
