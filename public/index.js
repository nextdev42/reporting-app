<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Clinic Report</title>
</head>
<body>
  <h2>Submit Clinic Report</h2>
  <form id="reportForm">
    <input name="username" placeholder="Username" required /><br><br>

    <select name="clinic" required>
      <option value="">Select Clinic</option>
      <option value="Kisiwani">Kisiwani</option>
      <option value="Jirambe">Jirambe</option>
      <option value="Mikwambe">Mikwambe</option>
      <option value="Kibada">Kibada</option>
    </select>
    <br><br>

    <input name="title" placeholder="Title" required /><br><br>
    <textarea name="description" placeholder="Description" required></textarea><br><br>
    <input type="file" name="image" accept="image/*" /><br><br>
    <button type="submit">Submit Report</button>
  </form>

  <p id="status"></p>

  <script>
    const form = document.getElementById('reportForm');
    const status = document.getElementById('status');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = "Submitting...";

      const formData = new FormData(form);

      try {
        // FIX: Removed .js from endpoint
        const res = await fetch('/api/report', {
          method: 'POST',
          body: formData
        });

        // Handle response
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } 
        catch { data = { message: text }; }

        if (!res.ok) {
          status.textContent = "Error: " + (data.error || data.message);
        } else {
          status.textContent = data.message || "Report submitted successfully!";
          form.reset();
        }
      } catch (err) {
        status.textContent = "Error: " + err.message;
      }
    });
  </script>
</body>
</html>
