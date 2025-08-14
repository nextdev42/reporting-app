import { useState } from "react";

const CLINICS = ["Kisiwani", "Jirambe", "Mikwambe", "Kibada"];

export default function Home() {
  const [status, setStatus] = useState("");
  const [reportUrl, setReportUrl] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("Submitting...");
    setReportUrl("");

    const formData = new FormData(e.target);

    // Simple frontend validation
    if (
      !formData.get("username") ||
      !formData.get("clinic") ||
      !formData.get("title") ||
      !formData.get("description") ||
      !formData.get("image")
    ) {
      setStatus("Please fill all fields and upload an image.");
      return;
    }

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      setStatus(text);

      if (res.ok) {
        e.target.reset();
        // Set the link to the reports page
        setReportUrl("/reports");
      }
    } catch (error) {
      console.error(error);
      setStatus("An error occurred while submitting the report.");
    }
  };

  return (
    <div style={{ maxWidth: "500px", margin: "auto", padding: "20px" }}>
      <h2>Clinic Report Form</h2>
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <input name="username" placeholder="Username" required />
        <br /><br />

        <select name="clinic" required>
          <option value="">Select Clinic</option>
          {CLINICS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <br /><br />

        <input name="title" placeholder="Title" required />
        <br /><br />

        <textarea name="description" placeholder="Description" required />
        <br /><br />

        <input type="file" name="image" accept="image/*" required />
        <br /><br />

        <button type="submit">Submit</button>
      </form>

      {status && <p>{status}</p>}

      {reportUrl && (
        <p>
          View all reports here:{" "}
          <a href={reportUrl} target="_blank" rel="noopener noreferrer">
            {reportUrl}
          </a>
        </p>
      )}
    </div>
  );
}
