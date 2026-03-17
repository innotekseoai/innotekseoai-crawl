interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8 mt-4 lg:mt-0">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-text truncate">{title}</h1>
        {description && <p className="text-muted text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="flex gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
