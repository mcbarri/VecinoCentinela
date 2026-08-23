export function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ background: "white", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15, 47, 87, 0.08)" }}>
      <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#0f2f57" }}>{value}</div>
    </div>
  );
}

