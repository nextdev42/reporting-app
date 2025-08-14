import { useState } from "react";

const CLINICS = ["Kisiwani", "Jirambe", "Mikwambe", "Kibada"];

export default function Home() {
  const [form, setForm] = useState({
    username: "",
    clinic: "",
    title: "",
    description: "",
    image: null,
  });
  const [status, setStatus] = useState("");

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setForm({ ...form, [name]: files ? files[0] : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.username || !form.clinic || !form.title || !form.description) {
      alert("Please fill in all required fields.");
      return;
    }

    setStatus("Submitting...");

    const formData = new FormData();
    formData.append("username", form.username);
    formData.append("clinic", form.clinic);
    formData.append("title", form.title);
    formData.append("description", form.description);
    if (form.image) formData.append("image", form.image);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        body: formData, // ✅ Node.js runtime, no duplex needed
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("Error: " + (data.error || "Unknown error"));
        return;
      }

      setStatus(data.message || "Report submitted successfully!");
      setTimeout(() => window.location.href = "/report", 1000);
    } catch (err) {
      setStatus("Error: " + err.message);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", padding: 20 }}>
      <h2>Submit Clinic Report</h2>
      <form onSubmit={handleSubmit}>
        <input
          name="username"
          placeholder="Username"
          value={form.username}
          onChange={handleChange}
          required
        />
        <br /><br />

        <select name="clinic" value={form.clinic} onChange={handleChange} required>
          <option value="">Select Clinic</option>
          {CLINICS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <br /><br />

        <input
          name="title"
          placeholder="Title"
          value={form.title}
          onChange={handleChange}
          required
        />
        <br /><br />

        <textarea
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={handleChange}
          required
        />
        <br /><br />

        <input type="file" name="image" accept="image/*" onChange={handleChange} />
        <br /><br />

        <button type="submit">Submit Report</button>
      </form>

      {status && <p style={{ marginTop: 20 }}>{status}</p>}
    </div>
  );
}
