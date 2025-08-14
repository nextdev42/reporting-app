import { useEffect, useState } from "react";

export default function Reports() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    async function fetchReports() {
      const res = await fetch("/api/fetchReports");
      const data = await res.json();
      setReports(data);
    }
    fetchReports();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 20 }}>
      <h2>Submitted Reports</h2>
      {reports.length === 0 ? (
        <p>No reports yet.</p>
      ) : (
        reports.map((r, i) => <ReportCard key={i} report={r} />)
      )}
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
      <p><strong>Time:</strong> {new Date(report.Timestamp).toLocaleString()}</p>
      <p><strong>Username:</strong> {report.Username}</p>
      <p><strong>Clinic:</strong> {report.Clinic}</p>
      <p><strong>Title:</strong> {report.Title}</p>
      <p><strong>Description:</strong> {report.Description}</p>
      {report["Image URL"] && (
        <img src={report["Image URL"]} alt="report" style={{ maxWidth: "100%", marginTop: 10 }} />
      )}

      <div style={{ marginTop: 10 }}>
        <h4>Comments:</h4>
        {comments.length === 0 ? <p>No comments yet.</p> : comments.map((c, idx) => <p key={idx}>- {c}</p>)}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add comment"
          style={{ width: "80%", padding: 4 }}
        />
        <button onClick={addComment} style={{ padding: "4px 8px", marginLeft: 4 }}>Add</button>
      </div>
    </div>
  );
}
