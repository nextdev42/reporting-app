import { useState } from "react";

const CLINICS = ["Kisiwani", "Jirambe", "Mikwambe", "Kibada"];

export default function Home() {
  const [status, setStatus] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("Submitting...");

    const formData = new FormData(e.target);

    const res = await fetch("/api/submit", {
      method: "POST",
      body: formData,
    });

    const text = await res.text();
    setStatus(text);
    if (res.ok) e.target.reset();
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
    </div>
  );
}
