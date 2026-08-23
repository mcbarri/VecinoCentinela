export function DataTable({ title, rows }: { title: string; rows: Array<Record<string, string | number | null | undefined>> }) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <section style={{ background: "white", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(15, 47, 87, 0.08)" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "10px 8px" }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

