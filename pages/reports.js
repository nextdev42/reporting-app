import { useEffect, useState } from "react";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch("/api/fetchReports");
        if (!res.ok) throw new Error("Failed to fetch reports");
        const data = await res.json();
        if (Array.isArray(data)) setReports(data);
        else setReports([]);
      } catch (err) {
        console.error(err);
        setReports([]);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 20 }}>
      <h2>Submitted Reports</h2>

      {loading ? (
        <p>Loading reports...</p>
      ) : reports.length === 0 ? (
        <p>No reports yet.</p>
      ) : (
        reports.map((r, i) => <ReportCard key={i} report={r} />)
      )}

      <div style={{ marginTop: 20 }}>
        <p>
          Download full report Excel:{" "}
          <a
            href="https://YOUR_SUPABASE_BUCKET_URL/reports.xlsx"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </a>
        </p>
      </div>
    </div>
  );
}

function ReportCard({ report }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");

  const addComment = () => {
    if (!text) return;
    setComments([...comments, text]);
    setText("");
  };

  return (
    <div style={{ border: "1px solid #ccc", marginBottom: 20, padding: 12 }}>
      <p>
        <strong>Time:</strong>{" "}
        {report.Timestamp ? new Date(report.Timestamp).toLocaleString() : "N/A"}
      </p>
      <p><strong>Username:</strong> {report.Username || "N/A"}</p>
      <p><strong>Clinic:</strong> {report.Clinic || "N/A"}</p>
      <p><strong>Title:</strong> {report.Title || "N/A"}</p>
      <p><strong>Description:</strong> {report.Description || "N/A"}</p>

      {report["Image URL"] && (
        <img
          src={report["Image URL"]}
          alt="report"
          style={{ maxWidth: "100%", marginTop: 10 }}
        />
      )}

      <div style={{ marginTop: 10 }}>
        <h4>Comments:</h4>
        {comments.length === 0 ? (
          <p>No comments yet.</p>
        ) : (
          comments.map((c, idx) => <p key={idx}>- {c}</p>)
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add comment"
          style={{ width: "80%", padding: 4 }}
        />
        <button onClick={addComment} style={{ padding: "4px 8px", marginLeft: 4 }}>
          Add
        </button>
      </div>
    </div>
  );
}
