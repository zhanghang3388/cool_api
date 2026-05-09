interface Props {
  title: string;
  phase?: string;
}

export default function ConsolePlaceholder({ title, phase }: Props) {
  return (
    <div className="fade-in">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="stat-card rounded-xl p-8 text-center space-y-2">
        <p className="text-sm text-gray-400">此页面将在后续阶段接入真实数据。</p>
        {phase && <p className="text-xs text-gray-600">预计 {phase} 开放</p>}
      </div>
    </div>
  );
}
