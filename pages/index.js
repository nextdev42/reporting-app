import { useState } from "react";

export default function Home() {
  const [form, setForm] = useState({
    username: "",
    clinic: "",
    title: "",
    description: "",
    image: null,
  });

  const [loading, setLoading] = useState(false);
  const clinics = ["Kisiwani", "Jirambe", "Mikwambe", "Kibada"];

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setForm({ ...form, [name]: files ? files[0] : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!form.username || !form.clinic || !form.title || !form.description) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("username", form.username);
    formData.append("clinic", form.clinic);
    formData.append("title", form.title);
    formData.append("description", form.description);
    if (form.image) formData.append("image", form.image);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      window.location.href = "/report";
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <h1>Submit Clinic Report</h1>
      <form onSubmit={handleSubmit}>
        <input
          name="username"
          placeholder="Your Name"
          onChange={handleChange}
          required
        />
        <select
          name="clinic"
          onChange={handleChange}
          required
          defaultValue=""
        >
          <option value="" disabled>Select Clinic</option>
          {clinics.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          name="title"
          placeholder="Report Title"
          onChange={handleChange}
          required
        />
        <textarea
          name="description"
          placeholder="Description"
          onChange={handleChange}
          required
        />
        <input
          type="file"
          name="image"
          accept="image/*"
          onChange={handleChange}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Uploading..." : "Submit Report"}
        </button>
      </form>
    </div>
  );
}
